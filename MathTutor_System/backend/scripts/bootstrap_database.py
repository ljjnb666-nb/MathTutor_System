"""Apply Alembic migrations and seed required reference data.

Deterministic reconciliation of historical databases that were created by
Base.metadata without an alembic_version table (create_superuser.py legacy
behavior). Unknown / mixed migration states fail closed instead of guessing.
Revision stamping for unversioned databases requires positive schema
signature verification (columns + indexes + FK metadata); table presence
alone is never treated as proof of an applied migration.
"""

from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.engine import Inspector

from app.core.db_seed import seed_default_data
from app.models import *  # noqa: F403,F401
from app.models.agent_run import AgentRun
from app.models.base import Base, engine

BASELINE_REVISION = "388fe57f097c"
AGENT_RUNS_REVISION = "7f1f4d9a2c10"
OWNER_TABLES = ("questions", "question_bank", "exams")

# 7f1f4d9a2c10 的权威签名：列名取自 AgentRun.__table__，索引与 FK 显式声明。
# 表存在不等于迁移已应用；补标记前必须正向验证全部签名。
AGENT_RUNS_EXPECTED_COLUMNS = frozenset(AgentRun.__table__.columns.keys())
AGENT_RUNS_EXPECTED_INDEXES = frozenset(("ix_agent_runs_user_id", "ix_agent_runs_status"))


class BootstrapDatabaseError(RuntimeError):
    """数据库迁移状态无法确定性识别；拒绝继续，需人工迁移。"""


def _build_alembic_config() -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    return config


def _has_users_foreign_key(foreign_keys: list[dict], column: str) -> bool:
    # FK 按指向校验而非按约束名：create_all 产物的内联 FK 在 SQLite 中没有约束名。
    return any(
        fk.get("referred_table") == "users"
        and list(fk.get("referred_columns") or []) == ["id"]
        and column in (fk.get("constrained_columns") or [])
        for fk in foreign_keys
    )


def _agent_runs_signature_problems(inspector: Inspector) -> list[str]:
    """agent_runs 与 7f1f4d9a2c10 产物签名的差异；空列表表示完全匹配。"""
    if "agent_runs" not in set(inspector.get_table_names()):
        return ["table 'agent_runs' is missing"]
    problems: list[str] = []
    columns = {column["name"] for column in inspector.get_columns("agent_runs")}
    missing_columns = sorted(AGENT_RUNS_EXPECTED_COLUMNS - columns)
    if missing_columns:
        problems.append(f"missing columns: {', '.join(missing_columns)}")
    indexes = {index["name"] for index in inspector.get_indexes("agent_runs")}
    missing_indexes = sorted(AGENT_RUNS_EXPECTED_INDEXES - indexes)
    if missing_indexes:
        problems.append(f"missing indexes: {', '.join(missing_indexes)}")
    if not _has_users_foreign_key(inspector.get_foreign_keys("agent_runs"), "user_id"):
        problems.append("missing foreign key agent_runs.user_id -> users.id")
    return problems


def _agent_runs_matches_previous_head(inspector: Inspector) -> bool:
    """表存在不足以证明 7f1f4d9a2c10 已应用；列/索引/FK 签名全部一致才可补标记。"""
    return not _agent_runs_signature_problems(inspector)


def _owner_head_signature_problems(inspector: Inspector) -> list[str]:
    """owner 列/索引/FK 元数据与 head（b7e2c94f6a15）产物签名的差异。"""
    problems: list[str] = []
    for table in OWNER_TABLES:
        columns = {column["name"] for column in inspector.get_columns(table)}
        if "owner_user_id" not in columns:
            problems.append(f"{table}: column owner_user_id is missing")
            continue
        indexes = {index["name"] for index in inspector.get_indexes(table)}
        if f"ix_{table}_owner_user_id" not in indexes:
            problems.append(f"{table}: index ix_{table}_owner_user_id is missing")
        if not _has_users_foreign_key(inspector.get_foreign_keys(table), "owner_user_id"):
            problems.append(f"{table}: foreign key owner_user_id -> users.id is missing")
    return problems


def _reconcile() -> None:
    config = _build_alembic_config()
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    application_tables = tables & set(Base.metadata.tables)

    if not application_tables:
        # STATE A：全新数据库 -> 按最新 metadata 建库并标记为 head。
        Base.metadata.create_all(bind=engine)
        command.stamp(config, "head")
        return

    if "alembic_version" in tables:
        # STATE B：正常 Alembic 管理的数据库 -> 直接升级到 head。
        command.upgrade(config, "head")
        return

    # 无 alembic_version 的历史数据库（create_superuser / Base.metadata 直接建库）。
    owner_column_states = {}
    for table in OWNER_TABLES:
        if table not in tables:
            raise BootstrapDatabaseError(
                f"Cannot reconcile legacy database: expected table '{table}' is missing. "
                "Manual migration required."
            )
        columns = {column["name"] for column in inspector.get_columns(table)}
        owner_column_states[table] = "owner_user_id" in columns

    if all(owner_column_states.values()):
        # STATE D：由新 Base.metadata 建库，schema 已等同于 head -> 仅补标记，不重放迁移。
        # 列存在不等于 head schema：agent_runs 签名与 owner 索引/FK 元数据也必须齐全。
        problems = _agent_runs_signature_problems(inspector) + _owner_head_signature_problems(inspector)
        if problems:
            raise BootstrapDatabaseError(
                "Cannot stamp head: schema does not match head signature ("
                + "; ".join(problems)
                + "). Manual migration required."
            )
        command.stamp(config, "head")
        return

    if any(owner_column_states.values()):
        # 混合 / 部分 owner schema：无法判定迁移状态，fail closed。
        missing = sorted(table for table, present in owner_column_states.items() if not present)
        raise BootstrapDatabaseError(
            "Partial owner schema detected "
            f"(missing owner_user_id in: {', '.join(missing)}). "
            "Manual migration required."
        )

    if "agent_runs" in tables:
        # STATE C：表存在不足以证明 7f1f4d9a2c10 已应用；签名完全一致才补标记后升级。
        if not _agent_runs_matches_previous_head(inspector):
            details = "; ".join(_agent_runs_signature_problems(inspector))
            raise BootstrapDatabaseError(
                "Cannot infer revision from table presence: agent_runs schema does not "
                f"match revision {AGENT_RUNS_REVISION} signature ({details}). "
                "Manual migration required."
            )
        # schema 等价于 7f1f4d9a2c10 -> 补标记后升级，owner 迁移正常执行。
        command.stamp(config, AGENT_RUNS_REVISION)
    else:
        # STATE E：更早的历史库 -> 从 baseline 标记，补 agent_runs 与 owner 迁移。
        command.stamp(config, BASELINE_REVISION)
    command.upgrade(config, "head")


def main() -> None:
    _reconcile()
    seed_default_data()
    print("Database bootstrap complete.")


if __name__ == "__main__":
    main()
