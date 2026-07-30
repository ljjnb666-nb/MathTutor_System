import os
import shutil
import subprocess
import sys
from pathlib import Path

from sqlalchemy import create_engine, inspect, text

from app.models.base import Base
from app.models.user import User

BACKEND_DIR = Path(__file__).resolve().parents[1]
TEST_TMP_DIR = Path(__file__).resolve().parent / ".tmp_alembic_agent_runs"
BASELINE_REVISION = "388fe57f097c"
AGENT_RUNS_REVISION = "7f1f4d9a2c10"


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


def test_agent_runs_migration_upgrade_downgrade_retry_preserves_users(request):
    if TEST_TMP_DIR.exists():
        shutil.rmtree(TEST_TMP_DIR)
    TEST_TMP_DIR.mkdir(parents=True)
    request.addfinalizer(lambda: shutil.rmtree(TEST_TMP_DIR, ignore_errors=True))
    db_path = TEST_TMP_DIR / "agent_runs_migration.sqlite"
    db_url = f"sqlite:///{db_path.as_posix()}"

    engine = create_engine(db_url)
    Base.metadata.create_all(engine, tables=[User.__table__])
    with engine.begin() as conn:
        conn.execute(
            text(
                "insert into users (id, username, hashed_password, is_active, role, created_at) "
                "values (1, 'teacher-a', 'x', 1, 'teacher', CURRENT_TIMESTAMP)"
            )
        )

    _run_alembic("stamp", BASELINE_REVISION, db_url=db_url)
    _run_alembic("upgrade", AGENT_RUNS_REVISION, db_url=db_url)

    inspector = inspect(engine)
    assert "agent_runs" in inspector.get_table_names()
    assert {"ix_agent_runs_user_id", "ix_agent_runs_status"}.issubset(
        {index["name"] for index in inspector.get_indexes("agent_runs")}
    )
    foreign_keys = inspector.get_foreign_keys("agent_runs")
    assert any(fk["referred_table"] == "users" and fk["referred_columns"] == ["id"] for fk in foreign_keys)
    with engine.connect() as conn:
        assert conn.execute(text("select username from users where id = 1")).scalar_one() == "teacher-a"

    _run_alembic("downgrade", BASELINE_REVISION, db_url=db_url)
    inspector = inspect(engine)
    assert "agent_runs" not in inspector.get_table_names()
    with engine.connect() as conn:
        assert conn.execute(text("select username from users where id = 1")).scalar_one() == "teacher-a"

    _run_alembic("upgrade", AGENT_RUNS_REVISION, db_url=db_url)
    inspector = inspect(engine)
    assert "agent_runs" in inspector.get_table_names()
