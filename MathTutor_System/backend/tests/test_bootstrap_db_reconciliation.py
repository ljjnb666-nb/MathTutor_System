"""
PHASE 2B-2B：bootstrap_database 启动迁移状态调和测试（BOOT-DB-01..09）。

有效状态：A 全新 / B 正常 Alembic / C 无版本表且 schema 等价上一代 head /
D 新 metadata 建库 / E 基础 schema 完整但早于 agent_runs。
fail-closed：混合 owner schema、残缺 agent_runs、缺失 owner 索引/FK 元数据、
缺失基础应用表、缺失基础应用列。

有效 State C / E 夹具由当前 ORM 塑形：Base.metadata 建库后移除 owner 三表的
owner_user_id 列（本 PR 相对上一代 head 仅新增这些列/索引/FK），得到真实、完整的
上一代 head schema，避免手工 DDL 子集造成的夹具漂移。补标记的前提是正向验证
schema 签名（应用表 + 列 + 索引 + FK 元数据）；表存在绝不作为迁移已应用的证据。
全部使用隔离临时 SQLite 文件库，不触碰真实数据库。
"""
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest
from sqlalchemy import MetaData, Table, create_engine, inspect, text

from app.models.base import Base

BACKEND_DIR = Path(__file__).resolve().parents[1]
TEST_TMP_DIR = Path(__file__).resolve().parent / ".tmp_bootstrap_db_reconcile"
BASELINE_REVISION = "388fe57f097c"
AGENT_RUNS_REVISION = "7f1f4d9a2c10"
OWNER_REVISION = "b7e2c94f6a15"
def _current_head_revision() -> str:
    """Current alembic head so head assertions survive new migrations."""
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    return ScriptDirectory.from_config(cfg).get_current_head()


HEAD_REVISION = _current_head_revision()
OWNER_TABLES = ("questions", "question_bank", "exams")

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


@pytest.fixture
def case_dir(request):
    """每个测试一个仓库内独立临时目录（规避系统 %TEMP% 的 pytest tmp_path 权限问题）。"""
    if TEST_TMP_DIR.exists():
        shutil.rmtree(TEST_TMP_DIR, ignore_errors=True)
    TEST_TMP_DIR.mkdir(parents=True, exist_ok=True)
    case_path = Path(tempfile.mkdtemp(dir=TEST_TMP_DIR))
    request.addfinalizer(lambda: shutil.rmtree(TEST_TMP_DIR, ignore_errors=True))
    return case_path


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


def _run_alembic(*args: str, db_url: str) -> None:
    env = os.environ.copy()
    env["DATABASE_URL"] = db_url
    result = subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=180,
    )
    assert result.returncode == 0, f"alembic {' '.join(args)} failed: {result.stderr}"


def _rebuild_table_without_owner_column(engine, table: Table) -> None:
    """把 owner 表重建为上一代形态（去掉 owner_user_id 列），列集合仍由 Base.metadata 派生。

    不能用 ALTER TABLE DROP COLUMN（SQLite 拒绝删除被 FK 引用的列），也不走 alembic
    downgrade（b7 的 batch drop_constraint 需要具名 FK，而 create_all 产物是无名 FK）。
    表是空的，INSERT..SELECT 仅为保持构造对任意行数都确定。
    """
    reduced = Table(f"{table.name}__rebuild", MetaData())
    for column in table.columns:
        if column.name == "owner_user_id":
            continue
        copied = column._copy()
        copied.index = False
        copied.unique = False
        reduced.append_column(copied)
    reduced.create(engine)
    columns = ", ".join(f'"{column.name}"' for column in reduced.columns)
    with engine.begin() as conn:
        conn.execute(
            text(f'INSERT INTO "{reduced.name}" ({columns}) SELECT {columns} FROM "{table.name}"')
        )
        conn.execute(text(f'DROP TABLE "{table.name}"'))
        conn.execute(text(f'ALTER TABLE "{reduced.name}" RENAME TO "{table.name}"'))


def _build_previous_head_schema(db_path: Path, *, keep_version_table: bool) -> None:
    """当前 Base.metadata 建库后移除后代增量 -> 权威的上一代 head（7f1f4d9a2c10）schema。

    相对上一代 head 的增量 = e4f7a1b9c2d8 新建的 agent_artifacts/agent_actions 两表 +
    owner 三表的 owner_user_id（列/索引/FK）。移除这些即等价于上一代 head 的完整
    应用 schema。keep_version_table=True 时补一个 7f1f4d9a2c10 版本表（STATE B 世界）。
    """
    db_url = f"sqlite:///{db_path.as_posix()}"
    engine = create_engine(db_url)
    Base.metadata.create_all(engine)
    engine.dispose()
    _drop_tables(db_path, "agent_actions", "agent_artifacts")
    engine = create_engine(db_url)
    for name in OWNER_TABLES:
        _rebuild_table_without_owner_column(engine, Base.metadata.tables[name])
    engine.dispose()
    if keep_version_table:
        _run_alembic("stamp", AGENT_RUNS_REVISION, db_url=db_url)


def _drop_tables(db_path: Path, *tables: str) -> None:
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    with engine.begin() as conn:
        for table in tables:
            conn.execute(text(f"DROP TABLE {table}"))
    engine.dispose()


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


def _alembic_version_exists(db_path: Path) -> bool:
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    try:
        return "alembic_version" in inspect(engine).get_table_names()
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
    assert _read_version(db_path) == HEAD_REVISION
    assert all(_owner_columns_present(db_path).values())


def test_boot_db_02_legacy_previous_head_schema_upgrades_owner_migration(case_dir):
    """STATE C：等价上一代 head 的遗留库（完整应用 schema + 完整 agent_runs、无版本表）
    -> 补 7f1f4d9a2c10 后升级 owner 迁移。"""
    db_path = case_dir / "state_c.sqlite"
    _build_previous_head_schema(db_path, keep_version_table=False)

    proc = _run_bootstrap(db_path)

    assert proc.returncode == 0, proc.stderr
    assert _read_version(db_path) == HEAD_REVISION
    assert all(_owner_columns_present(db_path).values())


def test_boot_db_03_pre_agent_runs_baseline_runs_both_migrations(case_dir):
    """STATE E：基础 schema 完整但无 agent_runs、无版本表 -> 从 baseline 补标记，
    agent_runs 与 owner 迁移先后执行。"""
    db_path = case_dir / "state_e.sqlite"
    _build_previous_head_schema(db_path, keep_version_table=False)
    _drop_tables(db_path, "agent_runs")

    proc = _run_bootstrap(db_path)

    assert proc.returncode == 0, proc.stderr
    assert _read_version(db_path) == HEAD_REVISION
    assert all(_owner_columns_present(db_path).values())
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    assert "agent_runs" in inspect(engine).get_table_names()
    engine.dispose()


def test_boot_db_04_partial_owner_schema_fails_closed(case_dir):
    """混合 owner schema -> fail closed：非零退出、给出明确错误、不做静默标记。"""
    db_path = case_dir / "state_partial.sqlite"
    _build_previous_head_schema(db_path, keep_version_table=False)
    # questions 已带 owner 列，其余两表没有：无法判定迁移状态
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE questions ADD COLUMN owner_user_id INTEGER"))
    engine.dispose()

    proc = _run_bootstrap(db_path)

    assert proc.returncode != 0
    assert "Partial owner schema" in proc.stderr
    assert not _alembic_version_exists(db_path)


def test_boot_db_05_existing_alembic_db_standard_upgrade(case_dir):
    """STATE B：正常 Alembic 管理库（版本表在 7f1f4d9a2c10）-> 标准 upgrade head。"""
    db_path = case_dir / "state_b.sqlite"
    _build_previous_head_schema(db_path, keep_version_table=True)
    assert _read_version(db_path) == AGENT_RUNS_REVISION

    proc = _run_bootstrap(db_path)

    assert proc.returncode == 0, proc.stderr
    assert _read_version(db_path) == HEAD_REVISION
    assert all(_owner_columns_present(db_path).values())


def test_boot_db_06_truncated_agent_runs_fails_closed_before_stamping(case_dir):
    """BOOT-DB-06：STATE C 变体 —— agent_runs 存在但 schema 残缺 -> fail closed，绝不补 7f1f4d9a2c10。"""
    db_path = case_dir / "state_c_truncated.sqlite"
    _build_previous_head_schema(db_path, keep_version_table=False)
    _drop_tables(db_path, "agent_runs")
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    with engine.begin() as conn:
        conn.execute(text(TRUNCATED_AGENT_RUNS_DDL))
    engine.dispose()

    proc = _run_bootstrap(db_path)

    assert proc.returncode != 0
    assert "agent_runs schema does not match" in proc.stderr
    assert AGENT_RUNS_REVISION in proc.stderr
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
        # 完整上一代 schema（含完整 agent_runs）+ owner 列/索引齐全，但 ALTER TABLE
        # 无法附加 FK 元数据 -> 专门证明 owner FK 元数据缺失时不得补 head。
        _build_previous_head_schema(db_path, keep_version_table=False)
        with engine.begin() as conn:
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


def test_boot_db_08_missing_unrelated_application_table_fails_closed(case_dir):
    """BOOT-DB-08：STATE C 变体 —— 缺少一个与迁移无关的必需应用表（orders）
    -> 不完整的基础 schema 不得补任何历史版本标记。"""
    db_path = case_dir / "state_c_missing_orders.sqlite"
    _build_previous_head_schema(db_path, keep_version_table=False)
    _drop_tables(db_path, "orders")

    proc = _run_bootstrap(db_path)

    assert proc.returncode != 0
    assert "missing table: orders" in proc.stderr
    assert not _alembic_version_exists(db_path), "基础 schema 不完整时不得创建/写入 alembic_version"
    assert not any(_owner_columns_present(db_path).values()), "不得静默执行 owner 迁移"


def test_boot_db_09_missing_application_column_fails_closed(case_dir):
    """BOOT-DB-09：STATE C 变体 —— 应用表缺一个必需列（plans.features）
    -> 表存在不足以证明 schema 完整，必须 fail closed。"""
    db_path = case_dir / "state_c_missing_column.sqlite"
    _build_previous_head_schema(db_path, keep_version_table=False)
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE plans DROP COLUMN features"))
    engine.dispose()

    proc = _run_bootstrap(db_path)

    assert proc.returncode != 0
    assert "plans: missing columns: features" in proc.stderr
    assert not _alembic_version_exists(db_path), "列签名不匹配时不得创建/写入 alembic_version"
