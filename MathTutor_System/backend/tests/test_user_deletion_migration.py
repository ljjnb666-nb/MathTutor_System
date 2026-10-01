"""2B-5D migration preservation and fail-closed bootstrap reconciliation."""
import os
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.models.base import Base
from app.models.user import User
from tests.test_user_auth_subject_migration import run_alembic
from tests.test_bootstrap_db_reconciliation import _run_bootstrap

PREVIOUS = "a6c8e2f91b40"
HEAD = "d9b5d0137a20"


@pytest.fixture(params=["sqlite", "postgres"])
def migration_db(request, tmp_path):
    if request.param == "sqlite":
        url = f"sqlite:///{(tmp_path / 'migration.db').as_posix()}"
        engine = create_engine(url)
        yield engine, url
        engine.dispose()
        return
    root_url = os.getenv("TUTORPRO_TEST_POSTGRES_URL")
    if not root_url:
        pytest.skip("NOT_RUN_ENV_UNAVAILABLE: TUTORPRO_TEST_POSTGRES_URL")
    root = create_engine(root_url)
    schema = "phase2b5d_migration_" + uuid4().hex
    with root.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    url = make_url(root_url).update_query_dict({"options": f"-csearch_path={schema}"}).render_as_string(hide_password=False)
    engine = create_engine(url)
    try:
        yield engine, url
    finally:
        engine.dispose()
        with root.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        root.dispose()


def previous_schema(engine):
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add_all([User(id=i, username=f"user-{i}", hashed_password="preserved", is_active=i == 1) for i in (1, 2)])
        db.commit()
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE users DROP COLUMN deletion_started_at"))
        connection.execute(text("ALTER TABLE users DROP COLUMN deletion_state"))


def core(engine):
    with engine.connect() as connection:
        return connection.execute(text("SELECT id, auth_subject, username, hashed_password, is_active, created_at FROM users ORDER BY id")).all()


def test_upgrade_downgrade_reupgrade_preserves_core_and_disabled_accounts(migration_db):
    engine, url = migration_db
    previous_schema(engine)
    before = core(engine)
    run_alembic(url, "stamp", PREVIOUS)
    for cycle in range(2):
        run_alembic(url, "upgrade", "head")
        assert core(engine) == before
        with engine.connect() as connection:
            assert connection.execute(text("SELECT deletion_state, deletion_started_at FROM users")).all() == [("active", None)] * 2
        if cycle == 0:
            run_alembic(url, "downgrade", PREVIOUS)
            assert core(engine) == before
            assert not {"deletion_state", "deletion_started_at"} & {c["name"] for c in inspect(engine).get_columns("users")}


def test_pre_deletion_unversioned_bootstrap_runs_actual_migration(tmp_path):
    path = tmp_path / "previous.db"
    engine = create_engine(f"sqlite:///{path.as_posix()}")
    previous_schema(engine)
    before = core(engine)
    result = _run_bootstrap(path)
    assert result.returncode == 0, result.stderr
    assert f"{PREVIOUS} -> {HEAD}" in result.stderr
    assert core(engine) == before
    with engine.connect() as connection:
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar() == HEAD
    engine.dispose()


@pytest.mark.parametrize("corruption", ["state_only", "time_only", "invalid", "null", "active_timestamp", "deleting_active", "deleting_no_timestamp"])
def test_partial_or_invalid_current_schema_bootstrap_fails_closed(tmp_path, corruption):
    path = tmp_path / "invalid.db"
    engine = create_engine(f"sqlite:///{path.as_posix()}")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add(User(username="user", hashed_password="x"))
        db.commit()
    with engine.begin() as connection:
        if corruption == "state_only":
            connection.execute(text("ALTER TABLE users DROP COLUMN deletion_started_at"))
        elif corruption == "time_only":
            connection.execute(text("ALTER TABLE users DROP COLUMN deletion_state"))
        elif corruption == "null":
            connection.execute(text("ALTER TABLE users DROP COLUMN deletion_state"))
            connection.execute(text("ALTER TABLE users ADD COLUMN deletion_state VARCHAR(16)"))
        else:
            update = {
                "invalid": "deletion_state='failed'",
                "active_timestamp": "deletion_started_at=CURRENT_TIMESTAMP",
                "deleting_active": "deletion_state='deleting', deletion_started_at=CURRENT_TIMESTAMP",
                "deleting_no_timestamp": "deletion_state='deleting', is_active=false",
            }[corruption]
            connection.execute(text(f"UPDATE users SET {update}"))
    result = _run_bootstrap(path)
    assert result.returncode != 0
    assert "BootstrapDatabaseError" in result.stderr
    assert "alembic_version" not in inspect(engine).get_table_names()
    engine.dispose()
