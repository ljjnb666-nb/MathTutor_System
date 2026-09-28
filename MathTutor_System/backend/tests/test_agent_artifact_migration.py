import os
import shutil
import subprocess
import sys
from pathlib import Path

from sqlalchemy import create_engine, inspect, text

from app.models.agent_run import AgentRun
from app.models.base import Base
from app.models.plan import Plan
from app.models.question_bank import QuestionBank
from app.models.student import Student
from app.models.subscription import Subscription
from app.models.user import User

BACKEND_DIR = Path(__file__).resolve().parents[1]
TEST_TMP_DIR = Path(__file__).resolve().parent / ".tmp_alembic_agent_artifacts"
BASE_REVISION = "b7e2c94f6a15"
ARTIFACT_REVISION = "e4f7a1b9c2d8"


def test_fresh_bootstrap_import_registers_practice_lifecycle_models():
    """The production bootstrap import graph must populate these tables in a new interpreter."""
    source = """
from scripts import bootstrap_database

required = {"agent_artifacts", "agent_actions"}
registered = set(bootstrap_database.Base.metadata.tables)
missing = sorted(required - registered)
if missing:
    raise SystemExit(f"missing ORM tables after production bootstrap import: {missing}")
print("\\n".join(sorted(required)))
"""
    result = subprocess.run(
        [sys.executable, "-c", source],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "agent_artifacts" in result.stdout
    assert "agent_actions" in result.stdout


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


def _assert_practice_delete_rules(inspector):
    expected = {
        ("agent_runs", "user_id", "users"): "CASCADE",
        ("agent_artifacts", "user_id", "users"): "CASCADE",
        ("agent_artifacts", "agent_run_id", "agent_runs"): "CASCADE",
        ("agent_actions", "user_id", "users"): "CASCADE",
        ("agent_actions", "agent_run_id", "agent_runs"): "CASCADE",
        ("agent_actions", "artifact_id", "agent_artifacts"): "CASCADE",
    }
    for (table, column, referred_table), ondelete in expected.items():
        foreign_key = next(
            fk for fk in inspector.get_foreign_keys(table)
            if fk["constrained_columns"] == [column] and fk["referred_table"] == referred_table
        )
        assert foreign_key["options"].get("ondelete") == ondelete, (table, column, foreign_key)


def _assert_practice_delete_rules_downgraded(inspector):
    for table, column, referred_table in (
        ("agent_runs", "user_id", "users"),
        ("agent_artifacts", "user_id", "users"),
        ("agent_artifacts", "agent_run_id", "agent_runs"),
        ("agent_actions", "user_id", "users"),
        ("agent_actions", "agent_run_id", "agent_runs"),
        ("agent_actions", "artifact_id", "agent_artifacts"),
    ):
        foreign_key = next(
            fk for fk in inspector.get_foreign_keys(table)
            if fk["constrained_columns"] == [column] and fk["referred_table"] == referred_table
        )
        assert foreign_key["options"].get("ondelete") is None, (table, column, foreign_key)


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
    _run_alembic("upgrade", "head", db_url=db_url)

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
    _assert_practice_delete_rules(inspector)
    with engine.connect() as conn:
        assert conn.execute(
            text("select goal from agent_runs where id = :run_id"), {"run_id": 1}
        ).scalar_one() == "goal"

    _run_alembic("downgrade", ARTIFACT_REVISION, db_url=db_url)
    inspector = inspect(engine)
    assert "agent_artifacts" in inspector.get_table_names()
    assert "agent_actions" in inspector.get_table_names()
    _assert_practice_delete_rules_downgraded(inspector)
    _run_alembic("upgrade", "head", db_url=db_url)
    _assert_practice_delete_rules(inspect(engine))

    _run_alembic("downgrade", BASE_REVISION, db_url=db_url)
    inspector = inspect(engine)
    assert "agent_artifacts" not in inspector.get_table_names()
    assert "agent_actions" not in inspector.get_table_names()
    with engine.connect() as conn:
        assert conn.execute(
            text("select username from users where id = :user_id"), {"user_id": 1}
        ).scalar_one() == "teacher-a"

    _run_alembic("upgrade", "head", db_url=db_url)
    inspector = inspect(engine)
    assert "agent_artifacts" in inspector.get_table_names()
    assert "agent_actions" in inspector.get_table_names()
    _assert_practice_delete_rules(inspector)
    engine.dispose()


def test_fresh_bootstrap_schema_matches_migrated_schema(request):
    """Fresh deployments bootstrap the schema from ORM metadata (bootstrap_database.py)
    and stamp head; existing deployments migrate. This pins ORM schema and migrated
    schema to be identical at the convergence head."""
    if TEST_TMP_DIR.exists():
        shutil.rmtree(TEST_TMP_DIR)
    TEST_TMP_DIR.mkdir(parents=True)
    request.addfinalizer(lambda: shutil.rmtree(TEST_TMP_DIR, ignore_errors=True))

    migrated_path = TEST_TMP_DIR / "migrated.sqlite"
    bootstrapped_path = TEST_TMP_DIR / "bootstrapped.sqlite"

    # Existing main-head deployment: schema from ORM metadata at main, then migrate up.
    migrated_url = f"sqlite:///{migrated_path.as_posix()}"
    main_engine = create_engine(migrated_url)
    main_engine_tables = [
        User.__table__,
        Plan.__table__,
        Subscription.__table__,
        Student.__table__,
        AgentRun.__table__,
        QuestionBank.__table__,
    ]
    Base.metadata.create_all(main_engine, tables=main_engine_tables)
    _run_alembic("stamp", BASE_REVISION, db_url=migrated_url)
    _run_alembic("upgrade", "head", db_url=migrated_url)

    # Fresh deployment: bootstrap creates the full current schema, stamps head directly.
    bootstrapped_url = f"sqlite:///{bootstrapped_path.as_posix()}"
    bootstrap_engine = create_engine(bootstrapped_url)
    Base.metadata.create_all(bootstrap_engine)
    _run_alembic("stamp", "head", db_url=bootstrapped_url)

    m_ins = inspect(main_engine)
    b_ins = inspect(bootstrap_engine)
    for table in ("agent_artifacts", "agent_actions"):
        m_cols = {c["name"]: c for c in m_ins.get_columns(table)}
        b_cols = {c["name"]: c for c in b_ins.get_columns(table)}
        assert set(m_cols) == set(b_cols), f"{table}: ORM/migration column drift: {set(m_cols) ^ set(b_cols)}"
        m_idx = {i["name"] for i in m_ins.get_indexes(table)}
        b_idx = {i["name"] for i in b_ins.get_indexes(table)}
        assert m_idx == b_idx, f"{table}: index drift: {m_idx ^ b_idx}"
    assert "question_bank" in b_ins.get_table_names()
    _assert_practice_delete_rules(m_ins)
    _assert_practice_delete_rules(b_ins)
    qbank_fk = next(
        fk for fk in b_ins.get_foreign_keys("question_bank")
        if fk["constrained_columns"] == ["owner_user_id"]
    )
    assert qbank_fk["options"].get("ondelete") is None
    main_engine.dispose()
    bootstrap_engine.dispose()
