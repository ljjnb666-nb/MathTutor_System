"""Queued and parsed uploads must bind the immutable account instance."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from threading import Event
from types import SimpleNamespace

import pytest
from fastapi import HTTPException, UploadFile

from app.api.endpoints import rag
from app.models.user import User
from app.services import rag_account_service as accounts
from app.services import user_deletion_service as lifecycle
from tests.test_user_tenant_purge import database
from tests.test_user_deletion_lifecycle import real_store, assert_empty


@pytest.fixture
def uploads(database, monkeypatch):
    monkeypatch.setattr(accounts, "SessionLocal", database)
    monkeypatch.setattr(rag, "_require_rag", lambda *_: None)
    monkeypatch.setattr(rag, "get_rag_service", lambda *a, **kw: SimpleNamespace(add_document=lambda *a, **kw: pytest.fail("late write")))
    with database() as db:
        user = db.get(User, 2)
        db.expunge(user)
    return user


def test_sync_parse_active_then_deleting_before_write_rejects(database, uploads, monkeypatch):
    def parse(*_):
        with database() as db:
            user = db.get(User, 2)
            user.deletion_state = "deleting"
            user.is_active = False
            user.deletion_started_at = lifecycle.utc_now()
            db.commit()
        return "fixture"
    monkeypatch.setattr(rag, "parse_file_from_bytes", parse)
    file = UploadFile(filename="file.pdf", file=BytesIO(b"fixture"))
    with pytest.raises(HTTPException) as error:
        asyncio.run(rag.rag_upload(file=file, knowledge_point="", chunk_type="question", embedding_config=None, db=None, current_user=uploads))
    assert error.value.status_code == 409


@pytest.mark.parametrize("recreate", [False, True])
def test_queued_async_upload_rejects_deleting_or_recreated_same_id(database, uploads, real_store, monkeypatch, recreate):
    parsing, release = Event(), Event()
    def parse(*_):
        parsing.set()
        assert release.wait(20)
        return "fixture"
    monkeypatch.setattr(rag, "parse_file_from_bytes", parse)
    task_id = "old-upload"
    rag._upload_status[task_id] = {"owner_user_id": 2, "owner_auth_subject": uploads.auth_subject, "status": "pending"}
    def run():
        asyncio.run(rag._run_upload_task(task_id, b"fixture", "file.pdf", "", "question", None, 2, uploads.auth_subject))
    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(run)
            try:
                assert parsing.wait(10)
                with database() as db:
                    if recreate:
                        lifecycle.delete_user_lifecycle(db, 2, 1)
                        db.add(User(id=2, username="new-account", hashed_password="x"))
                        db.commit()
                    else:
                        user = db.get(User, 2)
                        user.deletion_state = "deleting"
                        user.is_active = False
                        user.deletion_started_at = lifecycle.utc_now()
                        db.commit()
            finally:
                release.set()
            future.result(timeout=20)
        rec = rag._upload_status[task_id]
        assert rec["status"] == "failed"
        assert rec["error"] == "账号已进入删除流程，上传已取消"
        if recreate:
            assert_empty(real_store)
    finally:
        rag._upload_status.pop(task_id, None)


def test_async_endpoint_captures_id_and_subject(uploads, monkeypatch):
    captured = []
    captured_configs = []
    def schedule(coroutine):
        captured_configs.append(coroutine.cr_frame.f_locals["embedding_config"])
        captured.append(coroutine)
        coroutine.close()
    monkeypatch.setattr(asyncio, "create_task", schedule)
    file = UploadFile(filename="file.pdf", file=BytesIO(b"fixture"))
    config = SimpleNamespace(provider="openai", api_key="", base_url="", model="")
    response = asyncio.run(rag.rag_upload_async(file=file, knowledge_point="", chunk_type="question", embedding_config=config, db=None, current_user=uploads))
    import json
    task_id = json.loads(response.body)["task_id"]
    try:
        assert response.status_code == 202 and len(captured) == 1
        assert captured_configs == [config]
        assert rag._upload_status[task_id]["owner_user_id"] == 2
        assert rag._upload_status[task_id]["owner_auth_subject"] == uploads.auth_subject
        assert asyncio.run(rag.rag_upload_status(task_id, uploads))["status"] == "pending"
    finally:
        rag._upload_status.pop(task_id, None)
