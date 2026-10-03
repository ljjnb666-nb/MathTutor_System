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

    async def read(self, size=None):
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


# ---- RF02-01: sync route shares the admission slot --------------------------

def _call_sync(user, file, monkeypatch):
    return asyncio.run(rag.rag_upload(
        file=file, knowledge_point="", chunk_type="question",
        db=None, current_user=user, embedding_config=None,
    ))


def test_sync_rag_01_owner_limit_rejects_before_read(teacher_b, monkeypatch):
    monkeypatch.setattr(rag, "parse_file_from_bytes", lambda *a, **k: pytest.fail("parse must not run"))
    _seed_active("busy-1", owner=20)
    _seed_active("busy-2", owner=20)
    with pytest.raises(HTTPException) as exc:
        _call_sync(teacher_b, ExplosiveUpload(), monkeypatch)
    assert exc.value.status_code == 429


def test_sync_rag_02_global_limit_rejects_before_read(teacher_b):
    for i in range(rag.MAX_ACTIVE_RAG_UPLOADS_GLOBAL):
        _seed_active("global-%02d" % i, owner=100 + i)
    with pytest.raises(HTTPException) as exc:
        _call_sync(teacher_b, ExplosiveUpload(), None)
    assert exc.value.status_code == 503


def test_sync_rag_03_async_slot_counts_against_sync_route(teacher_b):
    """Existing async active slots count toward the sync route's owner quota:
    with the per-owner limit already consumed by async tasks, sync gets 429."""
    # Two seeded async actives consume the per-owner quota (limit 2), so the
    # sync route must be rejected by the same shared counter.
    _seed_active("async-busy", owner=20)
    _seed_active("async-busy-2", owner=20)
    with pytest.raises(HTTPException) as exc:
        _call_sync(teacher_b, ExplosiveUpload(), None)
    assert exc.value.status_code == 429


def test_sync_rag_04_successful_sync_upload_releases_slot(teacher_b, monkeypatch):
    monkeypatch.setattr(rag, "parse_file_from_bytes", lambda *a, **k: "fixture text")
    monkeypatch.setattr(
        rag, "get_rag_service",
        lambda *a, **k: SimpleNamespace(add_document=lambda *a, **k: "doc-sync"),
    )
    monkeypatch.setattr(rag, "write_rag_for_account_instance", lambda owner, subject, fn: fn())
    response = _call_sync(teacher_b, _file(), monkeypatch)
    assert response["document_id"] == "doc-sync"
    assert rag._upload_status == {}  # reservation released on success
    assert rag._active_task_count() == 0


def test_sync_rag_05_unexpected_provider_error_releases_slot(teacher_b, monkeypatch):
    def explode(*a, **k):
        raise RuntimeError("postgres://secret-shaped-internal")
    monkeypatch.setattr(rag, "parse_file_from_bytes", explode)
    with pytest.raises(HTTPException) as exc:
        _call_sync(teacher_b, _file(), monkeypatch)
    assert exc.value.status_code == 500
    assert "RAG_PROVIDER_ERROR" in exc.value.detail
    assert "postgres" not in exc.value.detail
    assert rag._upload_status == {}  # slot released on unexpected failure too
    assert rag._active_task_count() == 0


# ---- RF02-02: terminal TTL starts at completion -----------------------------

def _status_user(user_id=20):
    user = _make_user(user_id)
    return user


def test_rag_ttl_01_recently_finished_long_task_stays_queryable(teacher_b):
    now = time.time()
    rag._upload_status["long-then-done"] = {
        "owner_user_id": 20, "owner_auth_subject": "subject-20",
        "status": "done", "message": "Knowledge base updated",
        "filename": "big.pdf", "created_at": now - 1200, "finished_at": now,
    }
    payload = asyncio.run(rag.rag_upload_status("long-then-done", _status_user()))
    assert payload["status"] == "done"
    assert "long-then-done" in rag._upload_status


def test_rag_ttl_02_old_finished_task_expires_by_finished_at(teacher_b):
    now = time.time()
    rag._upload_status["stale-done"] = {
        "owner_user_id": 20, "owner_auth_subject": "subject-20",
        "status": "done", "message": "Knowledge base updated",
        "filename": "big.pdf", "created_at": now - 1200,
        "finished_at": now - (rag._STATUS_EXPIRE_SEC + 1),
    }
    with pytest.raises(HTTPException) as exc:
        asyncio.run(rag.rag_upload_status("stale-done", _status_user()))
    assert exc.value.status_code == 404
    assert "stale-done" not in rag._upload_status


def test_rag_ttl_03_legacy_terminal_without_finished_at_uses_created_at(teacher_b):
    now = time.time()
    rag._upload_status["legacy-done"] = {
        "owner_user_id": 20, "owner_auth_subject": "subject-20",
        "status": "done", "message": "Knowledge base updated",
        "filename": "old.pdf", "created_at": now - (rag._STATUS_EXPIRE_SEC + 10),
    }
    with pytest.raises(HTTPException) as exc:
        asyncio.run(rag.rag_upload_status("legacy-done", _status_user()))
    assert exc.value.status_code == 404
    assert "legacy-done" not in rag._upload_status


def test_rag_ttl_04_active_tasks_never_expire_by_terminal_ttl(teacher_b):
    now = time.time()
    for status in ("processing", "receiving", "pending"):
        task_id = "active-%s" % status
        rag._upload_status[task_id] = {
            "owner_user_id": 20, "owner_auth_subject": "subject-20",
            "status": status, "message": "Working",
            "filename": "busy.pdf", "created_at": now - 100_000,
        }
    for status in ("processing", "receiving", "pending"):
        payload = asyncio.run(rag.rag_upload_status("active-%s" % status, _status_user()))
        assert payload["status"] == status
    assert rag._active_task_count() == 3


# ---- RF02-03: bounded read ---------------------------------------------------

class OversizedUpload:
    """Records the read(size) hint and returns MAX+1 bytes."""

    filename = "big.pdf"
    content_type = "application/pdf"

    def __init__(self):
        self.sizes = []

    async def read(self, size=None):
        self.sizes.append(size)
        return b"x" * (rag.MAX_RAG_UPLOAD_BYTES + 1)


def test_bounded_read_caps_python_allocation_async(teacher_b, monkeypatch):
    monkeypatch.setattr(rag, "parse_file_from_bytes", lambda *a, **k: pytest.fail("parse must not see oversized bytes"))
    upload = OversizedUpload()
    with pytest.raises(HTTPException) as exc:
        _call_async(teacher_b, upload, monkeypatch)
    assert exc.value.status_code == 413
    assert upload.sizes == [rag.MAX_RAG_UPLOAD_BYTES + 1]
    assert rag._upload_status == {}  # reservation released on the 413 too


# ---- RF02-EXT: scheduling failure releases the reservation ------------------

def test_rag_schedule_01_create_task_failure_releases_slot_and_closes_coroutine(teacher_b, monkeypatch):
    """asyncio.create_task 抛异常：释放 reservation、关闭未调度 coro、稳定 500。"""
    captured = {}
    secret = "postgres://tutor:tutor-pw@10.0.0.9/db SECRET-material"

    def exploding_create_task(coro):
        captured["coro"] = coro
        raise RuntimeError(f"event loop rejected task: {secret}")

    monkeypatch.setattr(asyncio, "create_task", exploding_create_task)
    with pytest.raises(HTTPException) as exc:
        _call_async(teacher_b, _file(), monkeypatch)

    assert exc.value.status_code == 500
    assert exc.value.detail == "RAG_QUEUE_ERROR: 知识库任务创建失败，请稍后重试。"
    assert "RuntimeError" not in exc.value.detail
    assert secret not in exc.value.detail
    assert rag._upload_status == {}
    assert rag._active_task_count() == 0
    # The never-scheduled coroutine was closed, not left dangling.
    assert captured["coro"].cr_frame is None
