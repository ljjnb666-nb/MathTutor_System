"""
PHASE 2B-2B：bootstrap_database 启动迁移状态调和测试（BOOT-DB-01..07）。

覆盖七类数据库状态（A 全新 / B 正常 Alembic / C 无版本表但 schema 等价上一代 head /
D 新 metadata 建库 / E 更早历史库）以及三类 fail-closed 行为（混合 owner schema /
残缺 agent_runs / 缺失 owner 元数据）。
补标记的前提是正向验证 schema 签名（列 + 索引 + FK 元数据）；表存在绝不作为迁移
已应用的证据。全部使用隔离临时 SQLite 文件库。
"""
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text

from app.models.base import Base

BACKEND_DIR = Path(__file__).resolve().parents[1]
TEST_TMP_DIR = Path(__file__).resolve().parent / ".tmp_bootstrap_db_reconcile"
OWNER_REVISION = "b7e2c94f6a15"
OWNER_TABLES = ("questions", "question_bank", "exams")


@pytest.fixture
def case_dir(request):
    """每个测试一个仓库内独立临时目录（规避系统 %TEMP% 的 pytest tmp_path 权限问题）。"""
    if TEST_TMP_DIR.exists():
        shutil.rmtree(TEST_TMP_DIR, ignore_errors=True)
    TEST_TMP_DIR.mkdir(parents=True, exist_ok=True)
    case_path = Path(tempfile.mkdtemp(dir=TEST_TMP_DIR))
    request.addfinalizer(lambda: shutil.rmtree(TEST_TMP_DIR, ignore_errors=True))
    return case_path

PRE_OWNER_TABLE_DDL = {
    "questions": """
        CREATE TABLE questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER,
            content TEXT NOT NULL,
            options TEXT,
            answer TEXT NOT NULL,
            analysis TEXT NOT NULL,
            knowledge_point VARCHAR(255) NOT NULL,
            difficulty VARCHAR(10) NOT NULL,
            question_type VARCHAR(64) NOT NULL,
            source VARCHAR(64) NOT NULL,
            created_at DATETIME
        )
    """,
    "question_bank": """
        CREATE TABLE question_bank (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER,
            content TEXT NOT NULL,
            options TEXT,
            answer TEXT NOT NULL,
            analysis TEXT NOT NULL,
            question_type VARCHAR(64) NOT NULL,
            difficulty VARCHAR(16) NOT NULL,
            knowledge_point VARCHAR(255) NOT NULL,
            source VARCHAR(64) NOT NULL,
            tags TEXT,
            images TEXT,
            content_hash VARCHAR(64) NOT NULL,
            created_at DATETIME
        )
    """,
    "exams": """
        CREATE TABLE exams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title VARCHAR(256) NOT NULL,
            student_id INTEGER,
            questions TEXT,
            created_at DATETIME,
            assignment_date DATE,
            graded_at DATETIME,
            grade_summary TEXT,
            grade_results TEXT
        )
    """,
    "users": """
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username VARCHAR(128) NOT NULL UNIQUE,
            hashed_password VARCHAR(256) NOT NULL,
            is_active BOOLEAN NOT NULL,
            role VARCHAR(32) NOT NULL,
            created_at DATETIME
        )
    """,
    "students": """
        CREATE TABLE students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            name VARCHAR(128) NOT NULL,
            grade VARCHAR(64) NOT NULL,
            class_name VARCHAR(64) NOT NULL,
            tags TEXT,
            performance_score INTEGER,
            created_at DATETIME,
            login_code VARCHAR(32),
            hashed_password VARCHAR(256)
        )
    """,
    "agent_runs": """
        CREATE TABLE agent_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            goal TEXT NOT NULL,
            status VARCHAR(32) NOT NULL,
            intent_json JSON,
            context_snapshot_json JSON,
            selected_tools_json JSON,
            tool_calls_json JSON,
            plan_json JSON,
            missing_fields_json JSON,
            warnings_json JSON,
            error_code VARCHAR(64),
            error_message VARCHAR(512),
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            completed_at DATETIME,
            FOREIGN KEY(user_id) REFERENCES users (id)
        )
    """,
    "plans": """
        CREATE TABLE plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code VARCHAR(32) NOT NULL UNIQUE,
            name VARCHAR(64) NOT NULL,
            max_students INTEGER NOT NULL,
            features TEXT,
            sort_order INTEGER NOT NULL,
            price_monthly FLOAT,
            price_yearly FLOAT
        )
    """,
    "subscriptions": """
        CREATE TABLE subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            plan_id INTEGER NOT NULL,
            status VARCHAR(32) NOT NULL,
            period_start DATETIME,
            period_end DATETIME,
            created_at DATETIME,
            updated_at DATETIME
        )
    """,
}


# 7f1f4d9a2c10 一并创建的 agent_runs 索引；PRE_OWNER_TABLE_DDL 之外单独建。
AGENT_RUNS_INDEX_DDL = (
    "CREATE INDEX ix_agent_runs_user_id ON agent_runs (user_id)",
    "CREATE INDEX ix_agent_runs_status ON agent_runs (status)",
)

# 残缺 agent_runs：仅 6 列、无 JSON/结果列、无索引、无 FK —— 不得被视为 7f1f4d9a2c10。
TRUNCATED_AGENT_RUNS_DDL = """
    CREATE TABLE agent_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        goal TEXT NOT NULL,
        status VARCHAR(32) NOT NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL
    )
"""


def _run_bootstrap(db_path: Path) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite:///{db_path.as_posix()}"
    return subprocess.run(
        [sys.executable, "scripts/bootstrap_database.py"],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=180,
    )


def _read_version(db_path: Path) -> str | None:
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    try:
        with engine.connect() as conn:
            return conn.execute(text("select version_num from alembic_version")).scalar_one()
    finally:
        engine.dispose()


def _owner_columns_present(db_path: Path) -> dict[str, bool]:
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    try:
        inspector = inspect(engine)
        return {
            table: "owner_user_id" in {c["name"] for c in inspector.get_columns(table)}
            for table in OWNER_TABLES
        }
    finally:
        engine.dispose()


def test_boot_db_01_fresh_new_metadata_db_stamps_head_without_replaying(case_dir):
    """STATE D：新 Base.metadata 建库（无 alembic_version）-> 只补 head 标记，不重放迁移。"""
    db_path = case_dir / "state_d.sqlite"
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    Base.metadata.create_all(engine)  # 含全部 owner 列，但无 alembic_version
    engine.dispose()

    proc = _run_bootstrap(db_path)

    assert proc.returncode == 0, proc.stderr
    assert _read_version(db_path) == OWNER_REVISION
    assert all(_owner_columns_present(db_path).values())


def test_boot_db_02_legacy_previous_head_schema_upgrades_owner_migration(case_dir):
    """STATE C：等价上一代 head 的遗留库（有完整 agent_runs、无版本表）-> 补 7f1f4d9a2c10 后升级 owner 迁移。"""
    db_path = case_dir / "state_c.sqlite"
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    with engine.begin() as conn:
        for table in ("users", "students", "questions", "question_bank", "exams", "agent_runs", "plans", "subscriptions"):
            conn.execute(text(PRE_OWNER_TABLE_DDL[table]))
        for statement in AGENT_RUNS_INDEX_DDL:
            conn.execute(text(statement))
    engine.dispose()

    proc = _run_bootstrap(db_path)

    assert proc.returncode == 0, proc.stderr
    assert _read_version(db_path) == OWNER_REVISION
    assert all(_owner_columns_present(db_path).values())


def test_boot_db_03_pre_agent_runs_baseline_runs_both_migrations(case_dir):
    """STATE E：更早历史库（无 agent_runs、无版本表）-> 从 baseline 补标记，agent_runs 与 owner 迁移先后执行。"""
    db_path = case_dir / "state_e.sqlite"
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    with engine.begin() as conn:
        for table in ("users", "students", "questions", "question_bank", "exams", "plans", "subscriptions"):
            conn.execute(text(PRE_OWNER_TABLE_DDL[table]))
    engine.dispose()

    proc = _run_bootstrap(db_path)

    assert proc.returncode == 0, proc.stderr
    assert _read_version(db_path) == OWNER_REVISION
    assert all(_owner_columns_present(db_path).values())
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    assert "agent_runs" in inspect(engine).get_table_names()
    engine.dispose()


def test_boot_db_04_partial_owner_schema_fails_closed(case_dir):
    """混合 owner schema -> fail closed：非零退出、给出明确错误、不做静默标记。"""
    db_path = case_dir / "state_partial.sqlite"
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    with engine.begin() as conn:
        for table in ("users", "students", "questions", "question_bank", "exams", "plans", "subscriptions"):
            conn.execute(text(PRE_OWNER_TABLE_DDL[table]))
        # questions 已带 owner 列，其余两表没有：无法判定迁移状态
        conn.execute(text("ALTER TABLE questions ADD COLUMN owner_user_id INTEGER"))
    engine.dispose()

    proc = _run_bootstrap(db_path)

    assert proc.returncode != 0
    assert "Partial owner schema" in proc.stderr
    assert not _alembic_version_exists(db_path)


def _alembic_version_exists(db_path: Path) -> bool:
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    try:
        return "alembic_version" in inspect(engine).get_table_names()
    finally:
        engine.dispose()


def test_boot_db_05_existing_alembic_db_standard_upgrade(case_dir):
    """STATE B：正常 Alembic 管理库（版本表在 baseline）-> 标准 upgrade head。"""
    db_path = case_dir / "state_b.sqlite"
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    with engine.begin() as conn:
        for table in ("users", "students", "questions", "question_bank", "exams", "agent_runs", "plans", "subscriptions"):
            conn.execute(text(PRE_OWNER_TABLE_DDL[table]))
        for statement in AGENT_RUNS_INDEX_DDL:
            conn.execute(text(statement))
        conn.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)"))
        conn.execute(text("INSERT INTO alembic_version (version_num) VALUES ('7f1f4d9a2c10')"))
    engine.dispose()

    proc = _run_bootstrap(db_path)

    assert proc.returncode == 0, proc.stderr
    assert _read_version(db_path) == OWNER_REVISION
    assert all(_owner_columns_present(db_path).values())


def test_boot_db_06_truncated_agent_runs_fails_closed_before_stamping(case_dir):
    """BOOT-DB-06：STATE C 变体 —— agent_runs 存在但 schema 残缺 -> fail closed，绝不补 7f1f4d9a2c10。"""
    db_path = case_dir / "state_c_truncated.sqlite"
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    with engine.begin() as conn:
        for table in ("users", "students", "questions", "question_bank", "exams", "plans", "subscriptions"):
            conn.execute(text(PRE_OWNER_TABLE_DDL[table]))
        conn.execute(text(TRUNCATED_AGENT_RUNS_DDL))
    engine.dispose()

    proc = _run_bootstrap(db_path)

    assert proc.returncode != 0
    assert "agent_runs schema does not match" in proc.stderr
    assert "7f1f4d9a2c10" in proc.stderr
    assert not _alembic_version_exists(db_path), "签名不匹配时不得创建/写入 alembic_version"
    assert not any(_owner_columns_present(db_path).values()), "不得静默执行 owner 迁移"


@pytest.mark.parametrize(
    "corruption",
    ["agent_runs_missing", "agent_runs_truncated", "owner_index_missing", "owner_fk_missing"],
)
def test_boot_db_07_head_stamp_requires_full_schema_signature(case_dir, corruption):
    """BOOT-DB-07：STATE D 变体 —— owner 列齐全但 agent_runs 或 owner 元数据残缺 -> fail closed。

    列存在不是 head schema 的证明：直接补 head 前必须正向验证 agent_runs 签名与
    owner 索引/FK 元数据，任一缺失都不得标记 alembic_version。
    """
    db_path = case_dir / f"state_d_corrupt_{corruption}.sqlite"
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    if corruption == "owner_fk_missing":
        with engine.begin() as conn:
            # agent_runs 完整；owner 列与索引在，但 ALTER TABLE 无法附加 FK 元数据
            for table in ("users", "students", "questions", "question_bank", "exams", "agent_runs", "plans", "subscriptions"):
                conn.execute(text(PRE_OWNER_TABLE_DDL[table]))
            for statement in AGENT_RUNS_INDEX_DDL:
                conn.execute(text(statement))
            for table in OWNER_TABLES:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN owner_user_id INTEGER"))
                conn.execute(text(f"CREATE INDEX ix_{table}_owner_user_id ON {table} (owner_user_id)"))
    else:
        Base.metadata.create_all(engine)
        with engine.begin() as conn:
            if corruption == "agent_runs_missing":
                conn.execute(text("DROP TABLE agent_runs"))
            elif corruption == "agent_runs_truncated":
                conn.execute(text("DROP TABLE agent_runs"))
                conn.execute(text(TRUNCATED_AGENT_RUNS_DDL))
            elif corruption == "owner_index_missing":
                conn.execute(text("DROP INDEX ix_questions_owner_user_id"))
    engine.dispose()

    proc = _run_bootstrap(db_path)

    assert proc.returncode != 0
    assert "Cannot stamp head" in proc.stderr
    assert not _alembic_version_exists(db_path), "head 签名校验失败时不得写入 alembic_version"
