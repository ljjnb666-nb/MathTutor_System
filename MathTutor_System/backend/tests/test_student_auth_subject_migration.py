"""RB01 schema/backfill, downgrade and previous-head bootstrap verification."""
import os
import subprocess
import sys
from uuid import UUID, uuid4

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.base import Base
from app.models import User, Student, MistakeRecord
from app.services.user_admin_service import utc_now
from tests.schema_history import drop_student_auth_subject
from tests.test_user_deletion_migration import migration_db
from tests.test_user_auth_subject_migration import run_alembic, BACKEND_DIR

PREVIOUS = "d9b5d0137a20"
HEAD = "e1b5d0198a30"


def run_bootstrap(url):
    return subprocess.run([sys.executable, "scripts/bootstrap_database.py"], cwd=BACKEND_DIR,
                          env={**os.environ, "DATABASE_URL": url}, capture_output=True,
                          text=True, encoding="utf-8", errors="replace", timeout=180)


def old_schema(engine):
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add_all([User(id=1, username="active", hashed_password="x"),
                    User(id=2, username="deleting", hashed_password="y", is_active=False,
                         deletion_state="deleting", deletion_started_at=utc_now())])
        db.flush()
        db.add_all([Student(id=i, user_id=i if i < 3 else None, name=f"student-{i}", grade="8",
                            class_name="1", tags=["fixture"], performance_score=71,
                            login_code=f"code-{i}", hashed_password=f"hash-{i}") for i in (1, 2, 3)])
        db.flush()
        db.add(MistakeRecord(student_id=1, topic="algebra", source="exam", content="fixture"))
        db.commit()
    with engine.begin() as connection:
        drop_student_auth_subject(connection)


def core(engine):
    with engine.connect() as connection:
        return (
            connection.execute(text("SELECT id, user_id, name, grade, class_name, tags, performance_score, created_at, login_code, hashed_password FROM students ORDER BY id")).all(),
            connection.execute(text("SELECT id, auth_subject, username, hashed_password, is_active, deletion_state, deletion_started_at FROM users ORDER BY id")).all(),
            connection.execute(text("SELECT id, student_id, topic, content FROM mistake_records ORDER BY id")).all(),
        )


def assert_student_signature(engine):
    inspector = inspect(engine)
    column = next(c for c in inspector.get_columns("students") if c["name"] == "auth_subject")
    assert column["nullable"] is False and column["type"].length == 36
    assert any(i["name"] == "ix_students_auth_subject" and i["unique"]
               and i["column_names"] == ["auth_subject"] for i in inspector.get_indexes("students"))
    with engine.connect() as connection:
        subjects = connection.execute(text("SELECT auth_subject FROM students ORDER BY id")).scalars().all()
    assert len(set(subjects)) == len(subjects)
    assert all(str(UUID(s)) == s and UUID(s).version == 4 for s in subjects)
    return subjects


def test_student_auth_migration_backfill_downgrade_reupgrade_preserves_all_core(migration_db):
    engine, url = migration_db
    old_schema(engine)
    before = core(engine)
    run_alembic(url, "stamp", PREVIOUS)
    run_alembic(url, "upgrade", "head")
    subjects = assert_student_signature(engine)
    assert len(subjects) == 3 and core(engine) == before
    run_alembic(url, "upgrade", "head")
    assert assert_student_signature(engine) == subjects
    for value in (None, subjects[0]):
        with pytest.raises(IntegrityError), engine.begin() as connection:
            connection.execute(text("INSERT INTO students (id, user_id, name, grade, class_name, tags, performance_score, created_at, auth_subject) VALUES (4, 1, 'invalid', '8', '1', '[]', 60, CURRENT_TIMESTAMP, :subject)"), {"subject": value})
    run_alembic(url, "downgrade", PREVIOUS)
    assert core(engine) == before
    assert "auth_subject" not in {c["name"] for c in inspect(engine).get_columns("students")}
    assert "ix_students_auth_subject" not in {i["name"] for i in inspect(engine).get_indexes("students")}
    run_alembic(url, "upgrade", "head")
    assert set(assert_student_signature(engine)).isdisjoint(subjects)
    assert core(engine) == before


@pytest.mark.parametrize("versioned", [False, True], ids=["unversioned", "versioned"])
def test_bootstrap_previous_student_auth_head_runs_real_migration(migration_db, versioned):
    engine, url = migration_db
    old_schema(engine)
    before = core(engine)
    if versioned:
        run_alembic(url, "stamp", PREVIOUS)
    result = run_bootstrap(url)
    assert result.returncode == 0, result.stderr
    assert f"{PREVIOUS} -> {HEAD}" in result.stderr
    assert_student_signature(engine)
    assert core(engine) == before
    with engine.connect() as connection:
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar() == HEAD


def test_fresh_metadata_generates_uuid4_and_enforces_constraints(migration_db):
    engine, _ = migration_db
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add(User(id=1, username="owner", hashed_password="x"))
        db.flush()
        db.add_all([Student(user_id=1, name=name, grade="8", class_name="1") for name in ("one", "two")])
        db.commit()
    values = assert_student_signature(engine)
    assert len(values) == 2
    with Session(engine) as db:
        db.add(Student(user_id=1, name="duplicate", grade="8", class_name="1", auth_subject=values[0]))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()


@pytest.mark.parametrize("versioned", [False, True])
def test_bootstrap_current_head_verifies_student_signature(migration_db, versioned):
    engine, url = migration_db
    Base.metadata.create_all(engine)
    if versioned:
        run_alembic(url, "stamp", HEAD)
    result = run_bootstrap(url)
    assert result.returncode == 0, result.stderr
    assert_student_signature(engine)


@pytest.mark.parametrize("corruption", ["nullable", "missing-index", "null", "duplicate", "invalid", "noncanonical", "wrong-length"])
@pytest.mark.parametrize("versioned", [False, True])
def test_partial_student_auth_bootstrap_fails_closed(migration_db, corruption, versioned):
    engine, url = migration_db
    old_schema(engine)
    if versioned:
        run_alembic(url, "stamp", HEAD)
    with engine.begin() as connection:
        length = 35 if corruption == "wrong-length" else 36
        nullable = "" if corruption in ("nullable", "null", "duplicate", "invalid", "noncanonical") else " NOT NULL"
        subject = str(uuid4())
        # Constant here is only a corrupted fixture, never a backfill implementation.
        connection.execute(text(f"ALTER TABLE students ADD COLUMN auth_subject VARCHAR({length}){nullable} DEFAULT '{subject[:length]}'"))
        for sid in (1, 2, 3):
            connection.execute(text("UPDATE students SET auth_subject=:subject WHERE id=:sid"), {"subject": str(uuid4())[:length], "sid": sid})
        if corruption == "null":
            connection.execute(text("UPDATE students SET auth_subject=NULL WHERE id=1"))
        elif corruption == "duplicate":
            connection.execute(text("UPDATE students SET auth_subject=:subject"), {"subject": subject})
        elif corruption in ("invalid", "noncanonical"):
            value = "invalid" if corruption == "invalid" else subject.upper()
            connection.execute(text("UPDATE students SET auth_subject=:subject WHERE id=1"), {"subject": value})
        if corruption not in ("missing-index", "duplicate"):
            connection.execute(text("CREATE UNIQUE INDEX ix_students_auth_subject ON students(auth_subject)"))
    result = run_bootstrap(url)
    assert result.returncode != 0
    assert "BootstrapDatabaseError" in result.stderr and "students:" in result.stderr
    with engine.connect() as connection:
        if versioned:
            assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar() == HEAD
        else:
            assert "alembic_version" not in inspect(connection).get_table_names()
