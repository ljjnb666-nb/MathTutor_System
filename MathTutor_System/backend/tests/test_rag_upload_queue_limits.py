"""SEC-04: RAG async queue fairness — bounded active slots, active entries never evicted."""
import asyncio
import time
from io import BytesIO
from types import SimpleNamespace

import pytest
from fastapi import HTTPException, UploadFile

from app.api.endpoints import rag
from app.models.user import User


def _file(name="file.pdf"):
    return UploadFile(filename=name, file=BytesIO(b"%PDF-1.4 fixture"))


@pytest.fixture(autouse=True)
def clean_status():
    rag._upload_status.clear()
    yield
    rag._upload_status.clear()


@pytest.fixture
def teacher_b(monkeypatch):
    monkeypatch.setattr(rag, "_require_rag", lambda *a, **k: None)
    return User(id=20, username="teacher-b", hashed_password="x", role="teacher", is_active=True)


def _schedule(monkeypatch):
    created = []
    monkeypatch.setattr(asyncio, "create_task", lambda coro: (created.append(coro), coro.close())[0])
    return created


def _seed_terminal(task_id, owner=20, *, finished_at=None):
    rag._upload_status[task_id] = {
        "owner_user_id": owner,
        "owner_auth_subject": "subject-%d" % owner,
        "status": "done",
        "message": "Knowledge base updated",
        "filename": "old.pdf",
        "created_at": 1.0,
        "finished_at": finished_at,
    }


def _seed_active(task_id, owner, *, created_at=None):
    rag._upload_status[task_id] = {
        "owner_user_id": owner,
        "owner_auth_subject": "subject-%d" % owner,
        "status": "processing",
        "message": "Processing",
        "filename": "busy.pdf",
        "created_at": created_at if created_at is not None else time.time(),
    }


def test_active_tasks_survive_history_cap_flood(teacher_b):
    for i in range(rag._MAX_STATUS_ENTRIES + 40):
        _seed_terminal("old-%03d" % i, owner=20)
    _seed_active("keep-1", owner=20)
    _seed_active("keep-2", owner=20)
    # A terminal entry older than every active task must be evicted first.
    rag._prune_upload_status()
    assert "keep-1" in rag._upload_status
    assert "keep-2" in rag._upload_status
    assert rag._active_task_count(20) == 2


def test_per_owner_active_limit_returns_429(teacher_b, monkeypatch):
    _schedule(monkeypatch)
    _seed_active("busy-1", owner=20)
    _seed_active("busy-2", owner=20)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(rag.rag_upload_async(
            file=_file(), knowledge_point="", chunk_type="question",
            db=None, current_user=teacher_b, embedding_config=None,
        ))
    assert exc.value.status_code == 429
    assert "稍后重试" in exc.value.detail


def test_global_active_limit_returns_503(teacher_b, monkeypatch):
    _schedule(monkeypatch)
    for i in range(rag.MAX_ACTIVE_RAG_UPLOADS_GLOBAL):
        _seed_active("global-%02d" % i, owner=100 + i)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(rag.rag_upload_async(
            file=_file(), knowledge_point="", chunk_type="question",
            db=None, current_user=teacher_b, embedding_config=None,
        ))
    assert exc.value.status_code == 503


def test_stale_active_tasks_are_force_failed_and_frees_slot(teacher_b, monkeypatch):
    created = _schedule(monkeypatch)
    _seed_active("zombie", owner=20, created_at=time.time() - (rag._ACTIVE_TASK_TIMEOUT_SEC + 10))
    rag._expire_stale_active_tasks()
    assert rag._upload_status["zombie"]["status"] == "failed"

    # The freed slot lets a fresh upload through (per-owner limit is 2).
    response = asyncio.run(rag.rag_upload_async(
        file=_file(), knowledge_point="", chunk_type="question",
        db=None, current_user=teacher_b, embedding_config=None,
    ))
    assert response.status_code == 202
    for coro in created:
        coro.close()


def test_cross_tenant_availability_teacher_a_status_survives_teacher_b_flood(monkeypatch):
    monkeypatch.setattr(rag, "_require_rag", lambda *a, **k: None)
    teacher_a = User(id=30, username="teacher-a", hashed_password="x", role="teacher", is_active=True)
    teacher_a.auth_subject = "subject-30"
    _seed_active("a-active", owner=30)
    for i in range(rag._MAX_STATUS_ENTRIES * 2):
        _seed_terminal("b-%04d" % i, owner=20, finished_at=float(i))
    rag._prune_upload_status()

    payload = asyncio.run(rag.rag_upload_status("a-active", teacher_a))
    assert payload["status"] == "processing"
    # And teacher B cannot read teacher A's task even by guessing the id.
    stranger = User(id=20, username="teacher-b", hashed_password="x", role="teacher", is_active=True)
    stranger.auth_subject = "subject-20"
    with pytest.raises(HTTPException) as exc:
        asyncio.run(rag.rag_upload_status("a-active", stranger))
    assert exc.value.status_code == 404


def test_task_completion_updates_original_entry_even_after_prune(monkeypatch):
    monkeypatch.setattr(rag, "_require_rag", lambda *a, **k: None)
    monkeypatch.setattr(rag, "parse_file_from_bytes", lambda *a, **k: "fixture text")
    monkeypatch.setattr(
        rag, "get_rag_service",
        lambda *a, **k: SimpleNamespace(add_document=lambda *a, **k: "doc-42"),
    )
    monkeypatch.setattr(
        rag, "write_rag_for_account_instance",
        lambda owner, subject, fn: fn(),
    )
    task_id = "pruned-while-running"
    # Simulate the worst case: pruning removed the entry while the task ran.
    asyncio.run(rag._run_upload_task(task_id, b"%PDF-fixture", "file.pdf", "", "question", None, 2, "subject-2"))
    rec = rag._upload_status[task_id]
    assert rec["status"] == "done"
    assert rec["document_id"] == "doc-42"


def test_owner_and_global_counts_ignore_terminal_entries(teacher_b):
    _seed_terminal("done-1", owner=20)
    _seed_terminal("done-2", owner=20)
    _seed_active("live-1", owner=20)
    assert rag._active_task_count(20) == 1
    assert rag._active_task_count() == 1
