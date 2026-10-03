"""RB03: RAG async queue contract — admission before read, terminal-only TTL,
no fake timeout release."""
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


class ExplosiveUpload:
    """An upload whose read() must never be reached: admission fails first."""

    filename = "file.pdf"
    content_type = "application/pdf"

    async def read(self):
        pytest.fail("read() was called even though admission should have rejected earlier")


@pytest.fixture(autouse=True)
def clean_status():
    rag._upload_status.clear()
    yield
    rag._upload_status.clear()


@pytest.fixture
def teacher_b(monkeypatch):
    monkeypatch.setattr(rag, "_require_rag", lambda *a, **k: None)
    return User(id=20, username="teacher-b", hashed_password="x", role="teacher", is_active=True)


def _make_user(user_id):
    user = User(id=user_id, username=f"u{user_id}", hashed_password="x", role="teacher", is_active=True)
    user.auth_subject = f"subject-{user_id}"
    return user


def _schedule(monkeypatch):
    created = []
    monkeypatch.setattr(asyncio, "create_task", lambda coro: (created.append(coro), coro.close())[0])
    return created


def _seed_terminal(task_id, owner=20, *, created_at=None, finished_at=None):
    rag._upload_status[task_id] = {
        "owner_user_id": owner,
        "owner_auth_subject": f"subject-{owner}",
        "status": "done",
        "message": "Knowledge base updated",
        "filename": "old.pdf",
        "created_at": created_at if created_at is not None else 1.0,
        "finished_at": finished_at,
    }


def _seed_active(task_id, owner, *, created_at=None, status="processing"):
    rag._upload_status[task_id] = {
        "owner_user_id": owner,
        "owner_auth_subject": f"subject-{owner}",
        "status": status,
        "message": "Processing",
        "filename": "busy.pdf",
        "created_at": created_at if created_at is not None else time.time(),
    }


def _call_async(user, file, monkeypatch):
    return asyncio.run(rag.rag_upload_async(
        file=file, knowledge_point="", chunk_type="question",
        db=None, current_user=user, embedding_config=None,
    ))


def test_rag_q01_owner_limit_rejects_before_read(teacher_b):
    _seed_active("busy-1", owner=20)
    _seed_active("busy-2", owner=20)
    with pytest.raises(HTTPException) as exc:
        _call_async(teacher_b, ExplosiveUpload(), None)
    assert exc.value.status_code == 429
    assert "稍后重试" in exc.value.detail


def test_rag_q02_global_limit_rejects_before_read(teacher_b):
    for i in range(rag.MAX_ACTIVE_RAG_UPLOADS_GLOBAL):
        _seed_active("global-%02d" % i, owner=100 + i)
    with pytest.raises(HTTPException) as exc:
        _call_async(teacher_b, ExplosiveUpload(), None)
    assert exc.value.status_code == 503


def test_rag_q03_active_task_survives_status_ttl(teacher_b):
    """An 11-minute processing task keeps returning 200/processing — never popped."""
    user = _make_user(20)
    rag._upload_status["long-run"] = {
        "owner_user_id": 20,
        "owner_auth_subject": "subject-20",
        "status": "processing",
        "message": "Processing",
        "filename": "busy.pdf",
        "created_at": time.time() - 660,
    }
    payload = asyncio.run(rag.rag_upload_status("long-run", user))
    assert payload["status"] == "processing"
    assert "long-run" in rag._upload_status


def test_rag_q04_terminal_history_can_expire(teacher_b):
    user = _make_user(20)
    rag._upload_status["old-done"] = {
        "owner_user_id": 20,
        "owner_auth_subject": "subject-20",
        "status": "done",
        "message": "Knowledge base updated",
        "filename": "old.pdf",
        "created_at": time.time() - (rag._STATUS_EXPIRE_SEC + 5),
    }
    with pytest.raises(HTTPException) as exc:
        asyncio.run(rag.rag_upload_status("old-done", user))
    assert exc.value.status_code == 404
    assert "old-done" not in rag._upload_status


def test_rag_q05_stale_processing_still_counts_and_blocks(teacher_b):
    """RB03-B: no wall-clock quota release — a >30min processing task keeps its slot."""
    created = time.time() - 1900  # far beyond the old 30-minute timeout
    _seed_active("zombie", owner=20, created_at=created, status="processing")
    _seed_active("live", owner=20)
    assert rag._active_task_count(20) == 2
    with pytest.raises(HTTPException) as exc:
        _call_async(teacher_b, ExplosiveUpload(), None)
    assert exc.value.status_code == 429
    rec = rag._upload_status["zombie"]
    assert rec["status"] == "processing"  # never force-failed


def test_rag_q06_failed_validation_releases_reservation(teacher_b, monkeypatch):
    created = _schedule(monkeypatch)
    # admission passes, then read/validation fails → reservation must vanish
    class BadUpload:
        filename = "file.pdf"
        content_type = "text/plain"  # rejected after the slot is reserved

        async def read(self):
            return b"whatever"

    with pytest.raises(HTTPException) as exc:
        _call_async(teacher_b, BadUpload(), monkeypatch)
    assert exc.value.status_code == 400
    assert rag._active_task_count(20) == 0
    for coro in created:
        coro.close()


def test_rag_q07_reservation_flow_reaches_pending(teacher_b, monkeypatch):
    created = _schedule(monkeypatch)
    response = _call_async(teacher_b, _file(), monkeypatch)
    assert response.status_code == 202
    task_id = response.body and __import__("json").loads(response.body)["task_id"]
    assert rag._upload_status[task_id]["status"] == "pending"
    assert rag._active_task_count(20) == 1
    for coro in created:
        coro.close()


def test_active_tasks_survive_history_cap_flood(teacher_b):
    for i in range(rag._MAX_STATUS_ENTRIES + 40):
        _seed_terminal("old-%03d" % i, owner=20)
    _seed_active("keep-1", owner=20)
    _seed_active("keep-2", owner=20)
    rag._prune_upload_status()
    assert "keep-1" in rag._upload_status
    assert "keep-2" in rag._upload_status
    assert rag._active_task_count(20) == 2


def test_cross_tenant_availability_teacher_a_status_survives_teacher_b_flood(monkeypatch):
    monkeypatch.setattr(rag, "_require_rag", lambda *a, **k: None)
    teacher_a = _make_user(30)
    _seed_active("a-active", owner=30)
    for i in range(rag._MAX_STATUS_ENTRIES * 2):
        _seed_terminal("b-%04d" % i, owner=20, finished_at=float(i))
    rag._prune_upload_status()

    payload = asyncio.run(rag.rag_upload_status("a-active", teacher_a))
    assert payload["status"] == "processing"
    stranger = _make_user(20)
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


def test_receiving_reservation_counts_as_active(teacher_b):
    task_id = rag.reserve_upload_slot(teacher_b)
    assert rag._upload_status[task_id]["status"] == "receiving"
    assert rag._active_task_count(20) == 1
    assert rag._active_task_count() == 1
