"""PHASE 2B-5A migration, DB invariants, and retry/downgrade preservation."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from uuid import UUID, uuid4

import pytest
from tests.schema_history import drop_student_auth_subject

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import *  # noqa: F403,F401
from app.models.base import Base
from app.models.user import User

BACKEND_DIR = Path(__file__).resolve().parents[1]
PRE_AUTH = "f2b9c7a41d63"
AUTH_HEAD = "a6c8e2f91b40"
LIFECYCLE_HEAD = "d9b5d0137a20"
HEAD = "e1b5d0198a30"


def run_alembic(url, *args):
    env = {**os.environ, "DATABASE_URL": url}
    result = subprocess.run([sys.executable, "-m", "alembic", *args], cwd=BACKEND_DIR,
                            env=env, capture_output=True, text=True, timeout=180)
    assert result.returncode == 0, result.stdout + result.stderr
    return result


def build_pre_auth(engine):
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        drop_student_auth_subject(connection)
        connection.execute(text("ALTER TABLE users DROP COLUMN deletion_started_at"))
        connection.execute(text("ALTER TABLE users DROP COLUMN deletion_state"))
        connection.execute(text("DROP INDEX ix_users_auth_subject"))
        connection.execute(text("ALTER TABLE users DROP COLUMN auth_subject"))
        connection.execute(text(
            "INSERT INTO users (id, username, hashed_password, role, is_active, created_at) VALUES "
            "(1, 'legacy-admin', 'preserved-hash-a', 'admin', true, '2026-09-01 12:00:00'), "
            "(2, 'legacy-teacher', 'preserved-hash-b', 'teacher', false, '2026-09-02 12:00:00')"
        ))


def assert_subject_schema(engine):
    inspector = inspect(engine)
    column = next(column for column in inspector.get_columns("users") if column["name"] == "auth_subject")
    assert not column["nullable"]
    assert column["type"].length == 36
    assert any(index["name"] == "ix_users_auth_subject" and index["unique"]
               and index["column_names"] == ["auth_subject"] for index in inspector.get_indexes("users"))


def core_rows(engine):
    with engine.connect() as connection:
        return connection.execute(text(
            "SELECT id, username, hashed_password, role, is_active, created_at FROM users ORDER BY id"
        )).all()


def subjects(engine):
    with engine.connect() as connection:
        values = connection.execute(text("SELECT auth_subject FROM users ORDER BY id")).scalars().all()
    assert len(values) == len(set(values))
    assert all(UUID(value).version == 4 and str(UUID(value)) == value for value in values)
    return values


def exercise_upgrade_downgrade(engine, url):
    build_pre_auth(engine)
    before = core_rows(engine)
    run_alembic(url, "stamp", PRE_AUTH)
    run_alembic(url, "upgrade", "head")
    assert_subject_schema(engine)
    first_subjects = subjects(engine)
    assert len(first_subjects) == 2
    assert core_rows(engine) == before
    # A no-op upgrade must not rotate existing subjects or revoke sessions.
    run_alembic(url, "upgrade", "head")
    assert subjects(engine) == first_subjects
    for value in (None, first_subjects[0]):
        with pytest.raises(IntegrityError), engine.begin() as connection:
            connection.execute(text(
                "INSERT INTO users (username, auth_subject, hashed_password, role, is_active, created_at) "
                "VALUES ('invalid-subject', :subject, 'x', 'teacher', true, CURRENT_TIMESTAMP)"
            ), {"subject": value})
    run_alembic(url, "downgrade", PRE_AUTH)
    assert "auth_subject" not in {column["name"] for column in inspect(engine).get_columns("users")}
    assert "ix_users_auth_subject" not in {index["name"] for index in inspect(engine).get_indexes("users")}
    assert core_rows(engine) == before
    run_alembic(url, "upgrade", "head")
    assert_subject_schema(engine)
    assert set(subjects(engine)).isdisjoint(first_subjects)
    assert core_rows(engine) == before


@pytest.fixture
def migration_dir():
    # Follow the existing migration suites; Windows system TEMP can be restricted.
    with tempfile.TemporaryDirectory(prefix=".tmp_auth_subject_", dir=BACKEND_DIR / "tests") as directory:
        yield Path(directory)


def test_sqlite_upgrade_backfill_constraints_downgrade_and_retry(migration_dir):
    url = f"sqlite:///{(migration_dir / 'migration.sqlite').as_posix()}"
    engine = create_engine(url)
    try:
        exercise_upgrade_downgrade(engine, url)
    finally:
        engine.dispose()


def test_fresh_metadata_and_orm_generate_unique_uuid4_subjects():
    engine = create_engine("sqlite:///:memory:")
    try:
        Base.metadata.create_all(engine)
        assert_subject_schema(engine)
        with Session(engine) as db:
            db.add_all([User(username=name, hashed_password="x") for name in ("first", "second")])
            db.commit()
        assert len(subjects(engine)) == 2
        with Session(engine) as db:
            user = db.query(User).filter(User.username == "first").one()
            original = user.auth_subject
            user.hashed_password = "".join(["changed", "-", "password"])
            user.role = "admin"
            db.commit()
            assert user.auth_subject == original
    finally:
        engine.dispose()


def test_alembic_has_exactly_one_head():
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    scripts = ScriptDirectory.from_config(config)
    assert scripts.get_heads() == [HEAD]
    assert scripts.get_revision(HEAD).down_revision == LIFECYCLE_HEAD
    assert scripts.get_revision(LIFECYCLE_HEAD).down_revision == AUTH_HEAD
    assert scripts.get_revision(AUTH_HEAD).down_revision == PRE_AUTH


@pytest.mark.skipif(not os.getenv("TUTORPRO_TEST_POSTGRES_URL"), reason="NOT_RUN_ENV_UNAVAILABLE")
def test_postgresql_auth_subject_migration_in_isolated_schema():
    root_url = os.environ["TUTORPRO_TEST_POSTGRES_URL"]
    schema = "auth_subject_" + uuid4().hex
    root_engine = create_engine(root_url)
    isolated_engine = None
    try:
        with root_engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        url = make_url(root_url).update_query_dict({"options": f"-csearch_path={schema}"}).render_as_string(hide_password=False)
        isolated_engine = create_engine(url)
        exercise_upgrade_downgrade(isolated_engine, url)
    finally:
        if isolated_engine is not None:
            isolated_engine.dispose()
        with root_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        root_engine.dispose()
