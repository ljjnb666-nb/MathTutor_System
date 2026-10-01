"""Real PostgreSQL row-lock races with distinct process-local mutation guards."""
from contextlib import nullcontext
from concurrent.futures import ThreadPoolExecutor
import os
from threading import Event
from time import monotonic
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.user import User
from app.services import rag_account_service as accounts
from app.services import user_deletion_service as lifecycle
from tests.test_user_deletion_lifecycle import real_store, assert_empty


@pytest.fixture
def pg_database(monkeypatch):
    root_url = os.getenv("TUTORPRO_TEST_POSTGRES_URL")
    if not root_url:
        pytest.skip("NOT_RUN_ENV_UNAVAILABLE: TUTORPRO_TEST_POSTGRES_URL")
    root = create_engine(root_url)
    schema = "phase2b5d_race_" + uuid4().hex
    with root.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    url = make_url(root_url).update_query_dict({"options": f"-csearch_path={schema}"})
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    with factory() as db:
        db.add_all([User(id=i, username=f"user-{i}", hashed_password="x") for i in (1, 2, 3)])
        db.commit()
    monkeypatch.setattr(accounts, "SessionLocal", factory)
    # Model two processes: neither process-local guard can serialize the other.
    # The actual storage service still keeps its own physical mutation guard.
    monkeypatch.setattr(accounts, "rag_mutation_guard", nullcontext)
    monkeypatch.setattr(lifecycle, "rag_mutation_guard", nullcontext)
    try:
        yield factory, engine
    finally:
        engine.dispose()
        with root.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        root.dispose()


def wait_for_database_lock(engine, pid):
    # Observe the actual server wait, not a timing assumption. Bounded busy
    # polling only reads pg_stat_activity and uses no sleep-based synchronization.
    deadline = monotonic() + 15
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as observer:
        while monotonic() < deadline:
            if observer.execute(text("SELECT wait_event_type FROM pg_stat_activity WHERE pid=:pid"), {"pid": pid}).scalar() == "Lock":
                return
    pytest.fail("PostgreSQL worker never waited for the owner row lock")


def test_upload_row_lock_wins_deletion_waits_and_purge_absorbs_write(pg_database, real_store):
    factory, engine = pg_database
    with factory() as db:
        subject = db.get(User, 2).auth_subject
    writing, release, attempting = Event(), Event(), Event()
    deletion_pid = []
    def write():
        writing.set()
        assert release.wait(20)
        real_store.add(ids=["late"], embeddings=[[0., 1., 0.]], documents=["fixture"], metadatas=[{"owner_user_id": 2}])
    def delete():
        with factory() as db:
            deletion_pid.append(db.execute(text("SELECT pg_backend_pid()")).scalar())
            attempting.set()
            lifecycle.delete_user_lifecycle(db, 2, 1)
    with ThreadPoolExecutor(max_workers=2) as pool:
        upload = pool.submit(accounts.write_rag_for_account_instance, 2, subject, write)
        assert writing.wait(10)
        deletion = pool.submit(delete)
        try:
            assert attempting.wait(10)
            wait_for_database_lock(engine, deletion_pid[0])
            with factory() as db:
                assert db.get(User, 2).deletion_state == "active"
        finally:
            release.set()
        upload.result(timeout=20)
        deletion.result(timeout=20)
    assert_empty(real_store)
    with factory() as db:
        assert db.get(User, 2) is None


def test_deletion_row_lock_wins_upload_waits_then_rejects(pg_database, real_store):
    factory, engine = pg_database
    with factory() as db:
        subject = db.get(User, 2).auth_subject
    attempting = Event()
    upload_pid = []
    @event.listens_for(engine, "before_cursor_execute")
    def observe(connection, cursor, statement, parameters, context, executemany):
        if "FOR UPDATE" in statement and "auth_subject =" in statement:
            upload_pid.append(connection.connection.driver_connection.info.backend_pid)
            attempting.set()
    try:
        with factory() as deleting, ThreadPoolExecutor(max_workers=1) as pool:
            owner = deleting.query(User).filter(User.id == 2).with_for_update().one()
            owner.deletion_state = "deleting"
            owner.is_active = False
            owner.deletion_started_at = lifecycle.utc_now()
            deleting.flush()
            upload = pool.submit(accounts.write_rag_for_account_instance, 2, subject, lambda: pytest.fail("late RAG write"))
            try:
                assert attempting.wait(10)
                wait_for_database_lock(engine, upload_pid[0])
            finally:
                deleting.commit()
            with pytest.raises(accounts.StaleRAGAccountError):
                upload.result(timeout=20)
            lifecycle.delete_user_lifecycle(deleting, 2, 1)
    finally:
        event.remove(engine, "before_cursor_execute", observe)
    assert_empty(real_store)
