"""2B-5D lifecycle, credential freeze and real cross-store recovery.

Every case runs with enforced SQLite FKs and an isolated PostgreSQL schema.
"""
import asyncio
from sqlalchemy import text, event
from types import SimpleNamespace

import chromadb
import pytest
from fastapi import HTTPException
from fastapi import FastAPI
from fastapi.testclient import TestClient
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.security import HTTPAuthorizationCredentials

from app.api.endpoints import auth, rag
from app.api.endpoints import users as users_api
from app.models.base import get_db
from app.core.security import get_password_hash, create_access_token
from app.models import User, Student, Question
from app.services import rag_document_store as store
from app.services import rag_account_service as accounts
from app.services import user_deletion_service as lifecycle
from app.services.student_portal_service import (
    login_student, get_current_student_from_token, StudentPortalServiceError,
)
from app.services.user_admin_service import UserAdminServiceError, set_user_subscription
from scripts.assign_legacy_rag_documents import find_target_user, LegacyMigrationError
from tests.test_user_tenant_purge import database, tenant, resource, USER_TENANT_PURGE_TABLES


@pytest.fixture
def real_store(tmp_path, monkeypatch):
    client = chromadb.PersistentClient(path=str(tmp_path / "chroma"))
    collection = client.create_collection("lifecycle", embedding_function=None)
    monkeypatch.setattr(store, "REGISTRY_FILE", tmp_path / "registry.json")
    monkeypatch.setattr(store, "get_collection_only", lambda: collection)
    for uid in (2, 3):
        collection.add(ids=[f"doc-{uid}"], embeddings=[[1., 0., 0.]],
                       documents=["fixture"], metadatas=[{"owner_user_id": uid}])
    store.write_documents_registry([{"owner_user_id": uid, "document_id": f"doc-{uid}"} for uid in (2, 3)])
    return collection


def assert_frozen(factory):
    with factory() as db:
        user = db.get(User, 2)
        assert user and user.deletion_state == "deleting" and not user.is_active
        assert user.deletion_started_at is not None
        return user.deletion_started_at


def assert_empty(collection):
    assert collection.get(where={"owner_user_id": 2})["ids"] == []
    assert not [r for r in store.read_documents_registry(strict=True) if r.get("owner_user_id") == 2]
    assert collection.get(where={"owner_user_id": 3})["ids"] == ["doc-3"]


def test_full_lifecycle_sql_graph_and_real_chroma(database, real_store):
    with database() as db:
        tenant(db, 2)
        tenant(db, 3)
        db.commit()
        before = {name: db.execute(text(f'SELECT count(*) FROM "{name}"')).scalar()
                  for name in USER_TENANT_PURGE_TABLES}
        lifecycle.delete_user_lifecycle(db, 2, 1)
    assert_empty(real_store)
    with database() as db:
        assert db.get(User, 2) is None
        assert db.get(User, 3) is not None
        for name in USER_TENANT_PURGE_TABLES - {"users"}:
            assert db.execute(text(f'SELECT count(*) FROM "{name}"')).scalar() == before[name] // 2


def test_initial_conflict_and_self_delete_have_zero_rag_access(database, real_store, monkeypatch):
    monkeypatch.setattr(lifecycle, "rag_purge_owner", lambda _: pytest.fail("RAG accessed"))
    with database() as db:
        student = Student(user_id=2, name="conflict", grade="8", class_name="1")
        db.add(student)
        db.flush()
        db.add(resource(Question, 3, student.id))
        db.commit()
        for uid, actor, status in ((2, 2, 400), (999, 1, 404), (2, 1, 409)):
            with pytest.raises(UserAdminServiceError) as error:
                lifecycle.delete_user_lifecycle(db, uid, actor)
            assert error.value.status_code == status
        assert db.get(User, 2).deletion_state == "active"
        assert db.get(User, 2).is_active
    assert real_store.get(where={"owner_user_id": 2})["ids"] == ["doc-2"]


@pytest.mark.parametrize("failure", ["raise", "remaining"])
def test_rag_failure_durable_barrier_and_retry(database, real_store, monkeypatch, failure):
    original = lifecycle.rag_purge_owner
    def fail(_):
        if failure == "raise":
            raise store.DocumentRegistryError("fixture")
        return SimpleNamespace(remaining_chunk_count=1, remaining_registry_count=0)
    monkeypatch.setattr(lifecycle, "rag_purge_owner", fail)
    with database() as db:
        tenant(db, 2)
        db.commit()
        with pytest.raises(UserAdminServiceError) as error:
            lifecycle.delete_user_lifecycle(db, 2, 1)
        assert error.value.status_code == 503
    started = assert_frozen(database)
    with database() as db:
        assert db.query(Student).filter(Student.user_id == 2).count() == 1
    monkeypatch.setattr(lifecycle, "rag_purge_owner", original)
    with database() as db:
        assert db.get(User, 2).deletion_started_at == started
        lifecycle.delete_user_lifecycle(db, 2, 1)
    assert_empty(real_store)
    with database() as db:
        assert db.get(User, 2) is None


def test_crash_equivalent_and_corrupt_deleting_state_resume(database, real_store):
    store.rag_purge_owner(2)
    with database() as db:
        user = db.get(User, 2)
        user.deletion_state = "deleting"
        # Deliberately corrupt: lifecycle must tighten, never reactivate.
        user.is_active = True
        db.commit()
        lifecycle.delete_user_lifecycle(db, 2, 1)
        assert db.get(User, 2) is None
    assert_empty(real_store)


def test_final_fresh_preflight_conflict_rollback_and_repair(database, real_store, monkeypatch):
    with database() as db:
        tenant(db, 2)
        db.commit()
        student_id = db.query(Student.id).filter(Student.user_id == 2).scalar()
    original = lifecycle.rag_purge_owner
    def purge_and_race(uid):
        result = original(uid)
        # Existing child references can change while the parent row is locked.
        with database() as race:
            race.add(resource(Question, 3, student_id))
            race.commit()
        return result
    monkeypatch.setattr(lifecycle, "rag_purge_owner", purge_and_race)
    with database() as db:
        with pytest.raises(UserAdminServiceError) as error:
            lifecycle.delete_user_lifecycle(db, 2, 1)
        assert error.value.status_code == 409
    assert_frozen(database)
    assert_empty(real_store)
    with database() as db:
        assert db.query(Student).filter(Student.user_id == 2).count() == 1
        db.query(Question).filter(Question.owner_user_id == 3).delete()
        db.commit()
    monkeypatch.setattr(lifecycle, "rag_purge_owner", original)
    with database() as db:
        lifecycle.delete_user_lifecycle(db, 2, 1)
        assert db.get(User, 2) is None


def test_real_final_fk_failure_rolls_back_sql_and_keeps_durable_state(database, real_store):
    with database() as db:
        tenant(db, 2)
        db.commit()
        db.execute(text("CREATE TABLE unexpected_references (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id))"))
        db.execute(text("INSERT INTO unexpected_references VALUES (1, 2)"))
        db.commit()
        with pytest.raises(UserAdminServiceError) as error:
            lifecycle.delete_user_lifecycle(db, 2, 1)
        assert error.value.status_code == 409
    assert_frozen(database)
    assert_empty(real_store)
    with database() as db:
        assert db.query(Student).filter(Student.user_id == 2).count() == 1
        assert db.query(Question).filter(Question.owner_user_id == 2).count() == 1
        db.execute(text("DELETE FROM unexpected_references"))
        db.commit()
        lifecycle.delete_user_lifecycle(db, 2, 1)
        assert db.get(User, 2) is None


def test_unexpected_final_sql_failure_keeps_barrier_and_rolls_back(database, real_store):
    engine = database.kw["bind"]
    def fail(connection, cursor, statement, parameters, context, executemany):
        if statement.startswith("DELETE FROM users"):
            raise RuntimeError("final SQL fixture failure")
    with database() as db:
        tenant(db, 2)
        db.commit()
    event.listen(engine, "before_cursor_execute", fail)
    try:
        with database() as db:
            with pytest.raises(RuntimeError, match="final SQL fixture failure"):
                lifecycle.delete_user_lifecycle(db, 2, 1)
    finally:
        event.remove(engine, "before_cursor_execute", fail)
    assert_frozen(database)
    assert_empty(real_store)
    with database() as db:
        assert db.query(Student).filter(Student.user_id == 2).count() == 1
        lifecycle.delete_user_lifecycle(db, 2, 1)
        assert db.get(User, 2) is None


@pytest.mark.parametrize("active_flag", [False, True])
def test_teacher_student_credentials_and_admin_mutations_freeze(database, active_flag):
    with database() as db:
        user = db.get(User, 2)
        user.hashed_password = get_password_hash("-".join(["deletion", "pass", "123"]))
        student = Student(user_id=2, name="S", grade="8", class_name="1", login_code="code", hashed_password=get_password_hash("-".join(["portal", "pass", "123"])))
        db.add(student)
        db.commit()
        token = login_student(db, "code", "-".join(["portal", "pass", "123"])).access_token
        payload = {"type": "teacher", "sub": user.auth_subject, "uid": 2, "username": user.username}
        assert auth._resolve_teacher_user(payload, db) is user
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=create_access_token(data=payload))
        assert auth.get_current_user(credentials, db).id == 2
        assert get_current_student_from_token(db, token).id == student.id
        user.deletion_state = "deleting"
        user.is_active = active_flag
        user.deletion_started_at = lifecycle.utc_now()
        db.commit()
        assert auth._resolve_teacher_user(payload, db) is None
        with pytest.raises(HTTPException) as error:
            auth.get_current_user(credentials, db)
        assert error.value.status_code == 401
        with pytest.raises(HTTPException) as error:
            auth.login(OAuth2PasswordRequestForm(username=user.username, password="-".join(["deletion", "pass", "123"])), db)
        assert error.value.status_code == 401
        for operation in (lambda: login_student(db, "code", "-".join(["portal", "pass", "123"])), lambda: get_current_student_from_token(db, token)):
            with pytest.raises(StudentPortalServiceError) as error:
                operation()
            assert error.value.status_code == 401
        with pytest.raises(UserAdminServiceError) as error:
            set_user_subscription(db, 2, "free", None)
        assert error.value.status_code == 409
        with pytest.raises(LegacyMigrationError):
            find_target_user(db, user_id=2)


def test_old_account_upload_and_status_rejected_after_id_reuse(database, monkeypatch):
    monkeypatch.setattr(accounts, "SessionLocal", database)
    with database() as db:
        subject = db.get(User, 2).auth_subject
        db.query(User).filter(User.id == 2).delete()
        db.commit()
        replacement = User(id=2, username="replacement", hashed_password="x")
        db.add(replacement)
        db.commit()
        with pytest.raises(accounts.StaleRAGAccountError):
            accounts.write_rag_for_account_instance(2, subject, lambda: pytest.fail("late write"))
        rag._upload_status["old"] = {"owner_user_id": 2, "owner_auth_subject": subject}
        try:
            with pytest.raises(HTTPException) as error:
                asyncio.run(rag.rag_upload_status("old", replacement))
            assert error.value.status_code == 404
        finally:
            rag._upload_status.pop("old", None)


def test_delete_endpoint_503_retry_then_204(database, real_store, monkeypatch):
    app = FastAPI()
    app.include_router(users_api.router, prefix="/api/users")
    def session():
        with database() as db:
            yield db
    app.dependency_overrides[get_db] = session
    app.dependency_overrides[users_api.get_current_active_superuser] = lambda: User(id=1, role="admin")
    original = lifecycle.rag_purge_owner
    def fail(_):
        raise RuntimeError("storage fixture failure")
    monkeypatch.setattr(lifecycle, "rag_purge_owner", fail)
    with TestClient(app) as client:
        response = client.delete("/api/users/2")
        assert response.status_code == 503
        assert response.json()["detail"] == "用户删除暂未完成，知识库清理失败，请稍后重试"
        assert_frozen(database)
        monkeypatch.setattr(lifecycle, "rag_purge_owner", original)
        response = client.delete("/api/users/2")
        assert response.status_code == 204 and not response.content
    assert_empty(real_store)
