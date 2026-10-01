"""Apply Alembic migrations and seed required reference data.

Deterministic reconciliation of historical databases that were created by
Base.metadata without an alembic_version table (create_superuser.py legacy
behavior). Unknown / mixed migration states fail closed instead of guessing.
Revision stamping for unversioned databases requires positive schema
signature verification (application tables + columns + indexes + FK
metadata); table presence alone is never treated as proof of an applied
migration.
"""

from pathlib import Path
import sys
from uuid import UUID

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text
from sqlalchemy.engine import Inspector

from app.core.db_seed import seed_default_data
from app.models import *  # noqa: F403,F401
from app.models.agent_run import AgentRun
from app.models.base import Base, engine

BASELINE_REVISION = "388fe57f097c"
AGENT_RUNS_REVISION = "7f1f4d9a2c10"
PRE_DELETION_REVISION = "a6c8e2f91b40"
PRE_AUTH_SUBJECT_REVISION = "f2b9c7a41d63"
OWNER_TABLES = ("questions", "question_bank", "exams")
POST_AGENT_RUNS_TABLES = frozenset(("agent_artifacts", "agent_actions"))

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


def _base_schema_signature_problems(inspector: Inspector, *, previous_head: bool, pre_auth_subject: bool = False, pre_deletion: bool = False) -> list[str]:
    """应用基础 schema（agent_runs 除外）缺失的表/列清单；空列表表示签名匹配。

    期望签名从 Base.metadata 派生，避免校验器与 ORM 漂移：
      previous_head=True  -> 7f1f4d9a2c10 时代签名：owner 三表排除 owner_user_id
                             （owner 列由 owner 状态逻辑单独处理）
      previous_head=False -> 当前 head 签名（含 owner 列；owner 索引/FK 另行校验）
    仅要求"期望的必须存在"；遗留多余列不阻断（不做严格相等比较）。
    """
    tables = set(inspector.get_table_names())
    problems: list[str] = []
    for name, table in sorted(Base.metadata.tables.items()):
        if name == "agent_runs":
            continue
        if previous_head and name in POST_AGENT_RUNS_TABLES:
            # These tables were introduced by e4f7a1b9c2d8 after the legacy
            # revisions being signature-checked here. Do not require them
            # before reconciliation has a chance to apply that migration.
            continue
        expected_columns = {column.name for column in table.columns}
        # auth_subject was introduced after both supported historical signatures.
        if name == "users" and (previous_head or pre_auth_subject or pre_deletion):
            expected_columns.difference_update({"deletion_state", "deletion_started_at"})
        if name == "users" and (previous_head or pre_auth_subject):
            expected_columns.discard("auth_subject")
        if previous_head and name in OWNER_TABLES:
            expected_columns.discard("owner_user_id")
        if name not in tables:
            problems.append(f"missing table: {name}")
            continue
        columns = {column["name"] for column in inspector.get_columns(name)}
        missing_columns = sorted(expected_columns - columns)
        if missing_columns:
            problems.append(f"{name}: missing columns: {', '.join(missing_columns)}")
    return problems


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


def _auth_subject_signature_problems(inspector: Inspector) -> list[str]:
    columns = {column["name"]: column for column in inspector.get_columns("users")}
    column = columns.get("auth_subject")
    if column is None:
        return ["users: auth_subject column is missing"]
    problems = []
    if column["nullable"] or getattr(column["type"], "length", None) != 36:
        problems.append("users: auth_subject must be NOT NULL VARCHAR(36)")
    indexes = inspector.get_indexes("users")
    if not any(index["name"] == "ix_users_auth_subject" and index.get("unique")
               and index["column_names"] == ["auth_subject"] for index in indexes):
        problems.append("users: unique index ix_users_auth_subject is missing")
    with engine.connect() as connection:
        subjects = connection.execute(text("SELECT auth_subject FROM users")).scalars().all()
    try:
        valid = all(isinstance(subject, str) and str(UUID(subject)) == subject for subject in subjects)
    except ValueError:
        valid = False
    if not valid or len(set(subjects)) != len(subjects):
        problems.append("users: auth_subject data contains NULL, invalid UUID, or duplicate values")
    return problems


def _deletion_signature_problems(inspector: Inspector) -> list[str]:
    columns = {column["name"]: column for column in inspector.get_columns("users")}
    if not {"deletion_state", "deletion_started_at"} <= columns.keys():
        return ["users: partial deletion lifecycle schema"]
    problems = []
    if columns["deletion_state"]["nullable"] or getattr(columns["deletion_state"]["type"], "length", None) != 16:
        problems.append("users: deletion_state must be NOT NULL VARCHAR(16)")
    with engine.connect() as connection:
        invalid = connection.execute(text("SELECT count(*) FROM users WHERE deletion_state IS NULL OR deletion_state NOT IN ('active', 'deleting') OR (deletion_state = 'deleting' AND (is_active IS NULL OR is_active != false OR deletion_started_at IS NULL)) OR (deletion_state = 'active' AND deletion_started_at IS NOT NULL)")).scalar()
    if invalid:
        problems.append("users: invalid deletion lifecycle data")
    return problems


def _practice_head_signature_problems(inspector: Inspector) -> list[str]:
    """Positive verification of the f2b9c7a41d63 indexes and cascade FK signature."""
    problems = []
    tables = set(inspector.get_table_names())
    for name in ("agent_runs", "agent_artifacts", "agent_actions"):
        if name not in tables:
            problems.append(f"missing table: {name}")
            continue
        table = Base.metadata.tables[name]
        indexes = {index["name"] for index in inspector.get_indexes(name)}
        for index in table.indexes:
            if index.name not in indexes:
                problems.append(f"{name}: missing index {index.name}")
        foreign_keys = inspector.get_foreign_keys(name)
        for fk in table.foreign_keys:
            if not any(item["constrained_columns"] == [fk.parent.name]
                       and item["referred_table"] == fk.column.table.name
                       and item["referred_columns"] == [fk.column.name]
                       and item.get("options", {}).get("ondelete") == fk.ondelete
                       for item in foreign_keys):
                problems.append(f"{name}: missing cascade foreign key for {fk.parent.name}")
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

    user_columns = {c["name"] for c in inspector.get_columns("users")} if "users" in tables else set()
    lifecycle_columns = {"deletion_state", "deletion_started_at"} & user_columns
    if lifecycle_columns:
        if len(lifecycle_columns) != 2 or "auth_subject" not in user_columns:
            raise BootstrapDatabaseError("users: partial or mixed deletion lifecycle schema")
        problems = _deletion_signature_problems(inspector)
        if problems:
            raise BootstrapDatabaseError("; ".join(problems))

    if "alembic_version" in tables:
        # STATE B：正常 Alembic 管理的数据库 -> 直接升级到 head。
        command.upgrade(config, "head")
        problems = _deletion_signature_problems(inspect(engine))
        if problems:
            raise BootstrapDatabaseError("; ".join(problems))
        return

    if "users" not in tables:
        raise BootstrapDatabaseError("Cannot reconcile legacy database: users is missing. Manual migration required.")

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
        # owner 列 + agent_runs 签名正确不代表完整：全部应用表/列与 owner 索引/FK 元数据
        # 也必须齐全，否则不得补 head 标记。
        has_auth_subject = "auth_subject" in {column["name"] for column in inspector.get_columns("users")}
        problems = (
            _agent_runs_signature_problems(inspector)
            + _owner_head_signature_problems(inspector)
            + _base_schema_signature_problems(inspector, previous_head=False, pre_auth_subject=not has_auth_subject, pre_deletion=not lifecycle_columns)
            + _practice_head_signature_problems(inspector)
            + (_auth_subject_signature_problems(inspector) if has_auth_subject else [])
            + (_deletion_signature_problems(inspector) if lifecycle_columns else [])
        )
        if problems:
            raise BootstrapDatabaseError(
                "Cannot stamp head: schema does not match head signature ("
                + "; ".join(problems)
                + "). Manual migration required."
            )
        if has_auth_subject and lifecycle_columns:
            command.stamp(config, "head")
        elif has_auth_subject:
            command.stamp(config, PRE_DELETION_REVISION)
            command.upgrade(config, "head")
        else:
            command.stamp(config, PRE_AUTH_SUBJECT_REVISION)
            command.upgrade(config, "head")
        return

    if any(owner_column_states.values()):
        # 混合 / 部分 owner schema：无法判定迁移状态，fail closed。
        missing = sorted(table for table, present in owner_column_states.items() if not present)
        raise BootstrapDatabaseError(
            "Partial owner schema detected "
            f"(missing owner_user_id in: {', '.join(missing)}). "
            "Manual migration required."
        )

    # 无 owner 列的无版本库：只能证明"早于 owner 迁移"，具体补哪个历史版本
    # 仍需正向验证完整应用基础 schema（agent_runs 除外）后才允许标记。
    previous_head_problems = _base_schema_signature_problems(inspector, previous_head=True)
    if lifecycle_columns:
        previous_head_problems.append("users: lifecycle columns are present in a mixed historical schema")
    if "users" in tables and "auth_subject" in {column["name"] for column in inspector.get_columns("users")}:
        previous_head_problems.append("users: auth_subject is present in a mixed historical schema")
    if "agent_runs" in tables:
        # STATE C：表存在不足以证明 7f1f4d9a2c10 已应用；签名完全一致才补标记后升级。
        if not _agent_runs_matches_previous_head(inspector):
            details = "; ".join(_agent_runs_signature_problems(inspector))
            raise BootstrapDatabaseError(
                "Cannot infer revision from table presence: agent_runs schema does not "
                f"match revision {AGENT_RUNS_REVISION} signature ({details}). "
                "Manual migration required."
            )
        if previous_head_problems:
            raise BootstrapDatabaseError(
                f"Cannot stamp revision {AGENT_RUNS_REVISION}: application schema does not "
                "match previous-head signature ("
                + "; ".join(previous_head_problems)
                + "). Manual migration required."
            )
        # schema 等价于 7f1f4d9a2c10 -> 补标记后升级，owner 迁移正常执行。
        command.stamp(config, AGENT_RUNS_REVISION)
    else:
        # STATE E：基础 schema 完整但早于 agent_runs -> 从 baseline 标记，
        # 由迁移补建 agent_runs 与 owner 列。schema 漂移的历史库一律 fail closed。
        if previous_head_problems:
            raise BootstrapDatabaseError(
                f"Cannot stamp revision {BASELINE_REVISION}: application schema does not "
                "match previous-head signature ("
                + "; ".join(previous_head_problems)
                + "). Manual migration required."
            )
        command.stamp(config, BASELINE_REVISION)
    command.upgrade(config, "head")


def main() -> None:
    _reconcile()
    seed_default_data()
    print("Database bootstrap complete.")


if __name__ == "__main__":
    main()
