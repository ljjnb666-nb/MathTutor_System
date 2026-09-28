"""File-backed SQLite concurrency checks for the Teacher Agent practice lifecycle."""
from __future__ import annotations

import threading
from functools import wraps
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.deps import LLMConfig
from app.models.agent_artifact import AgentAction, AgentArtifact
from app.models.agent_run import AgentRun
from app.models.base import Base
from app.models.question_bank import QuestionBank
from app.models.student import Student
from app.models.user import User
from app.schemas.practice_draft_dto import PracticeDraftConfirm, PracticeDraftCreate, PracticeDraftUpdate, PracticeSetDraft
from app.services.practice_draft_generator import DeterministicFakePracticeDraftGenerator
from app.services import teacher_agent_artifact_service as service


@pytest.fixture
def concurrency_db():
    case_dir = Path(__file__).resolve().parent / f".tmp_teacher_agent_concurrency_{uuid4().hex}"
    case_dir.mkdir()
    db_path = case_dir / "practice-concurrency.sqlite"
    engine = create_engine(
        f"sqlite:///{db_path.as_posix()}",
        connect_args={"check_same_thread": False, "timeout": 20},
        poolclass=NullPool,
    )
    with engine.connect() as conn:
        conn.exec_driver_sql("PRAGMA journal_mode=WAL")
    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            Student.__table__,
            AgentRun.__table__,
            AgentArtifact.__table__,
            AgentAction.__table__,
            QuestionBank.__table__,
        ],
    )
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    with sessions() as db:
        user = User(id=1, username="teacher", hashed_password="fixture", role="teacher", is_active=True)
        db.add(user)
        db.flush()
        run = AgentRun(user_id=user.id, goal="Practice linear functions", status="completed")
        db.add(run)
        db.commit()
        run_id = run.id
    yield engine, sessions, run_id
    engine.dispose()
    for path in (db_path, Path(f"{db_path}-wal"), Path(f"{db_path}-shm")):
        if path.exists():
            path.unlink()
    case_dir.rmdir()


async def create_ready_artifact(sessions, run_id: int):
    with sessions() as db:
        user = db.get(User, 1)
        artifact = await service.create_practice_artifact(
            db,
            user,
            run_id,
            PracticeDraftCreate(question_count=1, question_types=["choice"], difficulty="medium"),
            LLMConfig(provider="fake", api_key="", base_url="", model=""),
            generator=DeterministicFakePracticeDraftGenerator(),
        )
        return artifact.id


def create_pending_action(sessions, artifact_id: int):
    with sessions() as db:
        user = db.get(User, 1)
        action, _ = service.prepare_practice_save(db, user, artifact_id)
        return action.id, action.idempotency_key, action.expected_artifact_version


def synchronize_first_read(monkeypatch, function_name: str, barrier: threading.Barrier):
    """Pause each worker after its first read so both observe the same starting state."""
    original = getattr(service, function_name)
    worker_state = threading.local()

    @wraps(original)
    def synchronized(*args, **kwargs):
        result = original(*args, **kwargs)
        if not getattr(worker_state, "synchronized", False):
            worker_state.synchronized = True
            barrier.wait(timeout=15)
        return result

    monkeypatch.setattr(service, function_name, synchronized)


def run_two_sessions_concurrently(sessions, jobs):
    start = threading.Barrier(2, timeout=15)
    results, errors, connection_ids = {}, {}, set()
    ids_lock = threading.Lock()

    def worker(name, job):
        db = sessions()
        try:
            connection = db.connection().connection.driver_connection
            with ids_lock:
                connection_ids.add(id(connection))
            start.wait()
            results[name] = job(db)
        except HTTPException as exc:
            results[name] = ("http", exc.status_code)
        except Exception as exc:  # concurrent database errors must be surfaced to the assertion below
            errors[name] = repr(exc)
        finally:
            db.close()

    threads = [threading.Thread(target=worker, args=(name, job)) for name, job in jobs]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
    assert not any(thread.is_alive() for thread in threads), "concurrency worker did not finish"
    assert len(connection_ids) == 2, "workers must use independent SQLite connections"
    assert not errors, errors
    return results


def action_status(sessions, action_id: int) -> str:
    with sessions() as db:
        return db.get(AgentAction, action_id).status


@pytest.mark.parametrize("round_index", range(3))
@pytest.mark.asyncio
async def test_confirm_confirm_has_one_database_claim_and_no_duplicate_questions(
    concurrency_db, monkeypatch, round_index
):
    _, sessions, run_id = concurrency_db
    artifact_id = await create_ready_artifact(sessions, run_id)
    action_id, key, version = create_pending_action(sessions, artifact_id)
    synchronize_first_read(monkeypatch, "get_action_or_404", threading.Barrier(2, timeout=15))
    request = PracticeDraftConfirm(idempotency_key=key, expected_artifact_version=version)

    results = run_two_sessions_concurrently(
        sessions,
        [
            ("first", lambda db: service.confirm_action(db, db.get(User, 1), action_id, request).status),
            ("second", lambda db: service.confirm_action(db, db.get(User, 1), action_id, request).status),
        ],
    )

    assert set(results.values()).issubset({"completed", ("http", 409)})
    with sessions() as db:
        assert db.query(QuestionBank).count() == 1
        assert db.query(QuestionBank.owner_user_id).distinct().all() == [(1,)]
        artifact = db.get(AgentArtifact, artifact_id)
        assert artifact.status == "saved"
        assert artifact.version == 1
        assert db.get(AgentAction, action_id).status == "completed"


@pytest.mark.parametrize("round_index", range(3))
@pytest.mark.asyncio
async def test_confirm_cancel_race_has_one_legal_terminal_path(concurrency_db, monkeypatch, round_index):
    _, sessions, run_id = concurrency_db
    artifact_id = await create_ready_artifact(sessions, run_id)
    action_id, key, version = create_pending_action(sessions, artifact_id)
    synchronize_first_read(monkeypatch, "get_action_or_404", threading.Barrier(2, timeout=15))
    request = PracticeDraftConfirm(idempotency_key=key, expected_artifact_version=version)

    results = run_two_sessions_concurrently(
        sessions,
        [
            ("confirm", lambda db: service.confirm_action(db, db.get(User, 1), action_id, request).status),
            ("cancel", lambda db: service.cancel_action(db, db.get(User, 1), action_id).status),
        ],
    )

    assert sum(value != ("http", 409) for value in results.values()) == 1
    with sessions() as db:
        action = db.get(AgentAction, action_id)
        artifact = db.get(AgentArtifact, artifact_id)
        count = db.query(QuestionBank).count()
        assert action.status in {"cancelled", "completed"}
        assert (action.status == "cancelled" and artifact.status == "ready_for_confirmation" and count == 0) or (
            action.status == "completed" and artifact.status == "saved" and count == 1
        )


@pytest.mark.parametrize("round_index", range(3))
@pytest.mark.asyncio
async def test_cancel_cancel_race_cancels_once(concurrency_db, monkeypatch, round_index):
    _, sessions, run_id = concurrency_db
    artifact_id = await create_ready_artifact(sessions, run_id)
    action_id, _, _ = create_pending_action(sessions, artifact_id)
    synchronize_first_read(monkeypatch, "get_action_or_404", threading.Barrier(2, timeout=15))

    results = run_two_sessions_concurrently(
        sessions,
        [
            ("first", lambda db: service.cancel_action(db, db.get(User, 1), action_id).status),
            ("second", lambda db: service.cancel_action(db, db.get(User, 1), action_id).status),
        ],
    )

    assert sorted(results.values(), key=str) == sorted(["cancelled", ("http", 409)], key=str)
    assert action_status(sessions, action_id) == "cancelled"


@pytest.mark.parametrize("round_index", range(3))
@pytest.mark.asyncio
async def test_edit_edit_same_version_is_compare_and_swap(concurrency_db, monkeypatch, round_index):
    _, sessions, run_id = concurrency_db
    artifact_id = await create_ready_artifact(sessions, run_id)
    synchronize_first_read(monkeypatch, "get_artifact_or_404", threading.Barrier(2, timeout=15))

    def edit(db, stem):
        user = db.get(User, 1)
        artifact = db.get(AgentArtifact, artifact_id)
        content = PracticeSetDraft.model_validate(artifact.content_json)
        content.questions[0].stem = stem
        updated = service.update_practice_artifact(
            db, user, artifact_id, PracticeDraftUpdate(expected_version=1, content=content)
        )
        return ("saved", updated.version, updated.content_json["questions"][0]["stem"])

    results = run_two_sessions_concurrently(
        sessions,
        [
            ("first", lambda db: edit(db, "Winner A: slope is two.")),
            ("second", lambda db: edit(db, "Winner B: slope is three.")),
        ],
    )

    winners = [value for value in results.values() if isinstance(value, tuple) and value[0] == "saved"]
    conflicts = [value for value in results.values() if value == ("http", 409)]
    assert len(winners) == 1
    assert len(conflicts) == 1
    with sessions() as db:
        artifact = db.get(AgentArtifact, artifact_id)
        assert artifact.version == 2
        assert artifact.content_json["questions"][0]["stem"] == winners[0][2]
        assert artifact.user_id == 1


@pytest.mark.parametrize("round_index", range(3))
@pytest.mark.asyncio
async def test_prepare_same_artifact_version_concurrently_reuses_one_action(
    concurrency_db, monkeypatch, round_index
):
    _, sessions, run_id = concurrency_db
    artifact_id = await create_ready_artifact(sessions, run_id)
    synchronize_first_read(monkeypatch, "_get_action_for_artifact_version", threading.Barrier(2, timeout=15))

    results = run_two_sessions_concurrently(
        sessions,
        [
            ("first", lambda db: service.prepare_practice_save(db, db.get(User, 1), artifact_id)[0].id),
            ("second", lambda db: service.prepare_practice_save(db, db.get(User, 1), artifact_id)[0].id),
        ],
    )

    assert results["first"] == results["second"]
    with sessions() as db:
        actions = db.query(AgentAction).filter(AgentAction.artifact_id == artifact_id).all()
        assert len(actions) == 1
        assert actions[0].status == "pending_confirmation"


@pytest.mark.parametrize("round_index", range(3))
@pytest.mark.asyncio
async def test_failed_transaction_retry_uses_new_version_without_duplicate_rows(
    concurrency_db, monkeypatch, round_index
):
    _, sessions, run_id = concurrency_db
    artifact_id = await create_ready_artifact(sessions, run_id)
    action_id, key, version = create_pending_action(sessions, artifact_id)

    def fail_once(*args, **kwargs):
        raise RuntimeError("fixture transient transaction failure")

    original_save = service.save_questions_to_bank
    monkeypatch.setattr(service, "save_questions_to_bank", fail_once)
    with sessions() as db:
        with pytest.raises(HTTPException) as failed:
            service.confirm_action(
                db,
                db.get(User, 1),
                action_id,
                PracticeDraftConfirm(idempotency_key=key, expected_artifact_version=version),
            )
        assert failed.value.status_code == 500
    with sessions() as db:
        assert db.query(QuestionBank).count() == 0
        assert db.get(AgentAction, action_id).status == "failed"
        artifact = db.get(AgentArtifact, artifact_id)
        assert artifact.status == "ready_for_confirmation"
        content = PracticeSetDraft.model_validate(artifact.content_json)
        content.questions[0].stem = "Retry on a new version after a failed transaction."
        updated = service.update_practice_artifact(
            db, db.get(User, 1), artifact_id, PracticeDraftUpdate(expected_version=1, content=content)
        )
        assert updated.version == 2
        retry_action, _ = service.prepare_practice_save(db, db.get(User, 1), artifact_id)

    monkeypatch.setattr(service, "save_questions_to_bank", original_save)
    with sessions() as db:
        result = service.confirm_action(
            db,
            db.get(User, 1),
            retry_action.id,
            PracticeDraftConfirm(
                idempotency_key=retry_action.idempotency_key,
                expected_artifact_version=retry_action.expected_artifact_version,
            ),
        )
        assert result.status == "completed"
    with sessions() as db:
        rows = db.query(QuestionBank).all()
        assert len(rows) == 1
        assert {row.owner_user_id for row in rows} == {1}
        assert db.get(AgentAction, action_id).status == "failed"
