import os
import shutil
import subprocess
import sys
from pathlib import Path

from sqlalchemy import create_engine, inspect, text

BACKEND_DIR = Path(__file__).resolve().parents[1]
TEST_TMP_DIR = Path(__file__).resolve().parent / ".tmp_alembic_question_bank_owner"
BASE_REVISION = "b4d8e2c9a713"
OWNER_REVISION = "c6f0a2d9e8b1"


def _run_alembic(*args: str, db_url: str) -> None:
    env = os.environ.copy()
    env["DATABASE_URL"] = db_url
    subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND_DIR,
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )


def test_question_bank_owner_migration_upgrade_downgrade_retry(request):
    if TEST_TMP_DIR.exists():
        shutil.rmtree(TEST_TMP_DIR)
    TEST_TMP_DIR.mkdir(parents=True)
    request.addfinalizer(lambda: shutil.rmtree(TEST_TMP_DIR, ignore_errors=True))
    db_path = TEST_TMP_DIR / "question_bank_owner.sqlite"
    db_url = f"sqlite:///{db_path.as_posix()}"

    engine = create_engine(db_url)
    with engine.begin() as conn:
        conn.exec_driver_sql(
            "create table users (id integer primary key, username varchar(64), hashed_password varchar(256), "
            "is_active boolean, role varchar(32), created_at datetime)"
        )
        conn.exec_driver_sql(
            "create table students (id integer primary key, user_id integer, name varchar(128), grade varchar(64), "
            "class_name varchar(64), tags JSON, performance_score integer, created_at datetime)"
        )
        conn.exec_driver_sql(
            "create table question_bank (id integer primary key, student_id integer, content text not null, options JSON, "
            "answer text not null, analysis text not null, question_type varchar(64) not null, difficulty varchar(16) not null, "
            "knowledge_point varchar(255) not null, source varchar(64) not null, tags JSON, images JSON, content_hash varchar(64) not null, created_at datetime not null)"
        )
        conn.exec_driver_sql(
            "create table agent_runs (id integer primary key, user_id integer not null, goal text not null, status varchar(32) not null, "
            "intent_json JSON, context_snapshot_json JSON, result_json JSON, error_code varchar(64), error_message varchar(512), created_at datetime not null, updated_at datetime not null, completed_at datetime)"
        )
        conn.exec_driver_sql(
            "create table agent_artifacts (id integer primary key, user_id integer not null, agent_run_id integer not null, artifact_type varchar(64) not null, "
            "status varchar(32) not null, version integer not null, title varchar(255) not null, content_json JSON not null, validation_json JSON not null, "
            "context_summary_json JSON, student_id integer, knowledge_point varchar(255), created_at datetime not null, updated_at datetime not null, confirmed_at datetime, cancelled_at datetime)"
        )
        conn.exec_driver_sql(
            "create table agent_actions (id integer primary key, user_id integer not null, agent_run_id integer not null, artifact_id integer not null, "
            "action_type varchar(96) not null, status varchar(32) not null, idempotency_key varchar(128) not null, payload_hash varchar(64) not null, "
            "expected_artifact_version integer not null, result_json JSON, error_code varchar(64), error_message varchar(512), created_at datetime not null, "
            "confirmed_at datetime, started_at datetime, completed_at datetime, cancelled_at datetime, "
            "constraint uq_agent_actions_user_action_idempotency unique (user_id, action_type, idempotency_key))"
        )
        conn.execute(
            text(
                "insert into users (id, username, hashed_password, is_active, role, created_at) "
                "values (1, 'teacher-a', 'x', 1, 'teacher', CURRENT_TIMESTAMP)"
            )
        )
        conn.execute(
            text(
                "insert into students (id, user_id, name, grade, class_name, tags, performance_score, created_at) "
                "values (10, 1, 'student-a', 'G7', 'Class 1', '[]', 60, CURRENT_TIMESTAMP)"
            )
        )
        conn.execute(
            text(
                "insert into question_bank "
                "(id, student_id, content, options, answer, analysis, question_type, difficulty, knowledge_point, source, tags, images, content_hash, created_at) "
                "values "
                "(100, 10, 'student question', '[]', 'A', '', '选择', 'L3', '函数', 'seed', '[]', '[]', 'hash-student', CURRENT_TIMESTAMP), "
                "(101, NULL, 'legacy public', '[]', 'B', '', '选择', 'L3', '函数', 'seed', '[]', '[]', 'hash-public', CURRENT_TIMESTAMP)"
            )
        )

    _run_alembic("stamp", BASE_REVISION, db_url=db_url)
    _run_alembic("upgrade", OWNER_REVISION, db_url=db_url)

    inspector = inspect(engine)
    columns = {column["name"] for column in inspector.get_columns("question_bank")}
    assert "owner_user_id" in columns
    assert "ix_question_bank_owner_user_id" in {index["name"] for index in inspector.get_indexes("question_bank")}
    assert "uq_agent_actions_artifact_action_version" in {
        item["name"] for item in inspector.get_unique_constraints("agent_actions")
    }
    with engine.connect() as conn:
        rows = dict(conn.execute(text("select id, owner_user_id from question_bank order by id")).all())
        assert rows[100] == 1
        assert rows[101] is None

    _run_alembic("downgrade", BASE_REVISION, db_url=db_url)
    inspector = inspect(engine)
    assert "owner_user_id" not in {column["name"] for column in inspector.get_columns("question_bank")}
    assert "uq_agent_actions_artifact_action_version" not in {
        item["name"] for item in inspector.get_unique_constraints("agent_actions")
    }

    _run_alembic("upgrade", OWNER_REVISION, db_url=db_url)
    inspector = inspect(engine)
    assert "owner_user_id" in {column["name"] for column in inspector.get_columns("question_bank")}
