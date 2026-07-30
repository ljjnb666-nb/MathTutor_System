import os
import shutil
import subprocess
import sys
from pathlib import Path

from sqlalchemy import create_engine, inspect, text

from app.models.agent_run import AgentRun
from app.models.base import Base
from app.models.student import Student
from app.models.user import User

BACKEND_DIR = Path(__file__).resolve().parents[1]
TEST_TMP_DIR = Path(__file__).resolve().parent / ".tmp_alembic_agent_artifacts"
BASE_REVISION = "7f1f4d9a2c10"
ARTIFACT_REVISION = "b4d8e2c9a713"


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


def test_agent_artifact_action_migration_upgrade_downgrade_retry_preserves_existing_data(request):
    if TEST_TMP_DIR.exists():
        shutil.rmtree(TEST_TMP_DIR)
    TEST_TMP_DIR.mkdir(parents=True)
    request.addfinalizer(lambda: shutil.rmtree(TEST_TMP_DIR, ignore_errors=True))
    db_path = TEST_TMP_DIR / "agent_artifacts_migration.sqlite"
    db_url = f"sqlite:///{db_path.as_posix()}"

    engine = create_engine(db_url)
    Base.metadata.create_all(engine, tables=[User.__table__, Student.__table__, AgentRun.__table__])
    with engine.begin() as conn:
        conn.execute(
            text(
                "insert into users (id, username, hashed_password, is_active, role, created_at) "
                "values (1, 'teacher-a', 'x', 1, 'teacher', CURRENT_TIMESTAMP)"
            )
        )
        conn.execute(
            text(
                "insert into agent_runs (id, user_id, goal, status, created_at, updated_at) "
                "values (1, 1, 'goal', 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            )
        )

    _run_alembic("stamp", BASE_REVISION, db_url=db_url)
    _run_alembic("upgrade", ARTIFACT_REVISION, db_url=db_url)

    inspector = inspect(engine)
    assert "agent_artifacts" in inspector.get_table_names()
    assert "agent_actions" in inspector.get_table_names()
    action_indexes = {index["name"] for index in inspector.get_indexes("agent_actions")}
    assert "ix_agent_actions_user_id" in action_indexes
    action_uniques = {item["name"] for item in inspector.get_unique_constraints("agent_actions")}
    assert "uq_agent_actions_user_action_idempotency" in action_uniques
    artifact_fks = inspector.get_foreign_keys("agent_artifacts")
    assert any(fk["referred_table"] == "agent_runs" for fk in artifact_fks)
    assert any(fk["referred_table"] == "users" for fk in artifact_fks)
    with engine.connect() as conn:
        assert conn.execute(text("select goal from agent_runs where id = 1")).scalar_one() == "goal"

    _run_alembic("downgrade", BASE_REVISION, db_url=db_url)
    inspector = inspect(engine)
    assert "agent_artifacts" not in inspector.get_table_names()
    assert "agent_actions" not in inspector.get_table_names()
    with engine.connect() as conn:
        assert conn.execute(text("select username from users where id = 1")).scalar_one() == "teacher-a"

    _run_alembic("upgrade", ARTIFACT_REVISION, db_url=db_url)
    inspector = inspect(engine)
    assert "agent_artifacts" in inspector.get_table_names()
    assert "agent_actions" in inspector.get_table_names()
