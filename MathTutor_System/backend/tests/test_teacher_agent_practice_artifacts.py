import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.deps import LLMConfig
from app.models.agent_artifact import AgentAction, AgentArtifact
from app.models.agent_run import AgentRun
from app.models.base import Base
from app.models.plan import Plan
from app.models.question_bank import QuestionBank
from app.models.student import Student
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.practice_draft_dto import PracticeDraftConfirm, PracticeDraftCreate, PracticeDraftUpdate, PracticeSetDraft
from app.services.practice_draft_generator import DeterministicFakePracticeDraftGenerator
from app.services.teacher_agent_artifact_service import (
    ACTION_SAVE_PRACTICE_SET,
    cancel_action,
    confirm_action,
    create_practice_artifact,
    prepare_practice_save,
    update_practice_artifact,
)


def make_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            Plan.__table__,
            Subscription.__table__,
            Student.__table__,
            AgentRun.__table__,
            AgentArtifact.__table__,
            AgentAction.__table__,
            QuestionBank.__table__,
        ],
    )
    return sessionmaker(bind=engine)()


def seed_user(db, user_id=1, username="teacher-a"):
    plan = Plan(code=f"free-{user_id}", name="Free", max_students=3, features={"rag": False})
    db.add(plan)
    db.flush()
    user = User(id=user_id, username=username, hashed_password="x", role="teacher", is_active=True)
    db.add(user)
    db.flush()
    db.add(Subscription(user_id=user.id, plan_id=plan.id, status="active"))
    db.commit()
    db.refresh(user)
    return user


def seed_completed_run(db, user):
    run = AgentRun(
        user_id=user.id,
        goal="Create a practice draft for linear functions",
        status="completed",
        intent_json={"intent_type": "practice_plan", "knowledge_points": ["linear functions"]},
        context_snapshot_json={"knowledge_point": "linear functions"},
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


async def make_artifact(db, user, run, *, count=5):
    return await create_practice_artifact(
        db,
        user,
        run.id,
        PracticeDraftCreate(question_count=count, question_types=["choice"], difficulty="medium", knowledge_points=["linear functions"]),
        LLMConfig(provider="fake", api_key="", base_url="", model=""),
        generator=DeterministicFakePracticeDraftGenerator(),
    )


@pytest.mark.asyncio
async def test_completed_run_creates_versioned_artifact_without_question_bank_write():
    db = make_db()
    user = seed_user(db)
    run = seed_completed_run(db, user)

    artifact = await make_artifact(db, user, run)

    assert artifact.version == 1
    assert artifact.status == "ready_for_confirmation"
    assert artifact.validation_json["valid"] is True
    assert db.query(QuestionBank).count() == 0
    assert "api_key" not in str(artifact.content_json).lower()


@pytest.mark.asyncio
async def test_non_completed_and_other_teacher_run_are_rejected():
    db = make_db()
    user = seed_user(db, 1, "teacher-a")
    other = seed_user(db, 2, "teacher-b")
    running = AgentRun(user_id=user.id, goal="x", status="running")
    foreign = AgentRun(user_id=other.id, goal="x", status="completed")
    db.add_all([running, foreign])
    db.commit()

    with pytest.raises(HTTPException) as non_completed:
        await make_artifact(db, user, running)
    assert non_completed.value.status_code == 409

    with pytest.raises(HTTPException) as not_found:
        await make_artifact(db, user, foreign)
    assert not_found.value.status_code == 404


@pytest.mark.asyncio
async def test_artifact_edit_increments_version_and_stale_version_409():
    db = make_db()
    user = seed_user(db)
    run = seed_completed_run(db, user)
    artifact = await make_artifact(db, user, run)
    content = PracticeSetDraft.model_validate(artifact.content_json)
    content.questions[0].stem = "Updated valid practice question stem."

    updated = update_practice_artifact(db, user, artifact.id, PracticeDraftUpdate(expected_version=1, content=content))

    assert updated.version == 2
    with pytest.raises(HTTPException) as stale:
        update_practice_artifact(db, user, artifact.id, PracticeDraftUpdate(expected_version=1, content=content))
    assert stale.value.status_code == 409


@pytest.mark.asyncio
async def test_invalid_edit_does_not_overwrite_previous_content():
    db = make_db()
    user = seed_user(db)
    run = seed_completed_run(db, user)
    artifact = await make_artifact(db, user, run)
    original = artifact.content_json["questions"][0]["stem"]
    content = PracticeSetDraft.model_validate(artifact.content_json)
    content.questions[0].stem = ""

    with pytest.raises(Exception):
        update_practice_artifact(db, user, artifact.id, PracticeDraftUpdate(expected_version=1, content=content))

    db.refresh(artifact)
    assert artifact.version == 1
    assert artifact.content_json["questions"][0]["stem"] == original


@pytest.mark.asyncio
async def test_prepare_save_then_confirm_creates_questions_and_records_ids():
    db = make_db()
    user = seed_user(db)
    run = seed_completed_run(db, user)
    artifact = await make_artifact(db, user, run, count=5)

    action, summary = prepare_practice_save(db, user, artifact.id)
    assert action.status == "pending_confirmation"
    assert summary["question_count"] == 5
    assert db.query(QuestionBank).count() == 0

    completed = confirm_action(
        db,
        user,
        action.id,
        PracticeDraftConfirm(idempotency_key=action.idempotency_key, expected_artifact_version=artifact.version),
    )

    assert completed.status == "completed"
    assert completed.result_json["question_count"] == 5
    assert len(completed.result_json["question_ids"]) == 5
    assert db.query(QuestionBank).count() == 5
    db.refresh(artifact)
    assert artifact.status == "saved"


@pytest.mark.asyncio
async def test_replaying_completed_action_does_not_duplicate_questions():
    db = make_db()
    user = seed_user(db)
    run = seed_completed_run(db, user)
    artifact = await make_artifact(db, user, run, count=2)
    action, _ = prepare_practice_save(db, user, artifact.id)
    req = PracticeDraftConfirm(idempotency_key=action.idempotency_key, expected_artifact_version=artifact.version)

    first = confirm_action(db, user, action.id, req)
    second = confirm_action(db, user, action.id, req)

    assert first.result_json == second.result_json
    assert db.query(QuestionBank).count() == 2


@pytest.mark.asyncio
async def test_different_key_cannot_resave_saved_artifact():
    db = make_db()
    user = seed_user(db)
    run = seed_completed_run(db, user)
    artifact = await make_artifact(db, user, run, count=1)
    action, _ = prepare_practice_save(db, user, artifact.id)
    confirm_action(db, user, action.id, PracticeDraftConfirm(idempotency_key=action.idempotency_key, expected_artifact_version=1))

    with pytest.raises(HTTPException) as exc:
        prepare_practice_save(db, user, artifact.id)
    assert exc.value.status_code == 409
    assert db.query(QuestionBank).count() == 1


@pytest.mark.asyncio
async def test_cancelled_and_stale_actions_cannot_confirm():
    db = make_db()
    user = seed_user(db)
    run = seed_completed_run(db, user)
    artifact = await make_artifact(db, user, run, count=1)
    action, _ = prepare_practice_save(db, user, artifact.id)
    cancel_action(db, user, action.id)

    with pytest.raises(HTTPException) as cancelled:
        confirm_action(db, user, action.id, PracticeDraftConfirm(idempotency_key=action.idempotency_key, expected_artifact_version=1))
    assert cancelled.value.status_code == 409

    action2, _ = prepare_practice_save(db, user, artifact.id)
    content = PracticeSetDraft.model_validate(artifact.content_json)
    content.questions[0].stem = "Changed after prepare save."
    update_practice_artifact(db, user, artifact.id, PracticeDraftUpdate(expected_version=1, content=content))
    with pytest.raises(HTTPException) as stale:
        confirm_action(db, user, action2.id, PracticeDraftConfirm(idempotency_key=action2.idempotency_key, expected_artifact_version=1))
    assert stale.value.status_code == 409


@pytest.mark.asyncio
async def test_other_teacher_cannot_confirm_action():
    db = make_db()
    user = seed_user(db, 1, "teacher-a")
    other = seed_user(db, 2, "teacher-b")
    run = seed_completed_run(db, user)
    artifact = await make_artifact(db, user, run, count=1)
    action, _ = prepare_practice_save(db, user, artifact.id)

    with pytest.raises(HTTPException) as exc:
        confirm_action(db, other, action.id, PracticeDraftConfirm(idempotency_key=action.idempotency_key, expected_artifact_version=1))
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_transaction_failure_rolls_back_all_questions(monkeypatch):
    db = make_db()
    user = seed_user(db)
    run = seed_completed_run(db, user)
    artifact = await make_artifact(db, user, run, count=2)
    action, _ = prepare_practice_save(db, user, artifact.id)

    def boom(*args, **kwargs):
        raise RuntimeError("forced failure")

    monkeypatch.setattr("app.services.teacher_agent_artifact_service.save_questions_to_bank", boom)
    with pytest.raises(HTTPException):
        confirm_action(db, user, action.id, PracticeDraftConfirm(idempotency_key=action.idempotency_key, expected_artifact_version=1))

    assert db.query(QuestionBank).count() == 0
    db.refresh(artifact)
    db.refresh(action)
    assert artifact.status == "ready_for_confirmation"
    assert action.status == "failed"


def test_medium_write_tool_is_not_low_registry():
    from app.services.agent_tool_registry import TOOL_REGISTRY, available_read_tools

    assert ACTION_SAVE_PRACTICE_SET not in {tool.name for tool in available_read_tools()}
    assert ACTION_SAVE_PRACTICE_SET not in TOOL_REGISTRY
