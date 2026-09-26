"""Apply Alembic migrations and seed required reference data.

Deterministic reconciliation of historical databases that were created by
Base.metadata without an alembic_version table (create_superuser.py legacy
behavior). Unknown / mixed migration states fail closed instead of guessing.
"""

from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from app.core.db_seed import seed_default_data
from app.models import *  # noqa: F403,F401
from app.models.base import Base, engine

BASELINE_REVISION = "388fe57f097c"
AGENT_RUNS_REVISION = "7f1f4d9a2c10"
OWNER_TABLES = ("questions", "question_bank", "exams")


class BootstrapDatabaseError(RuntimeError):
    """数据库迁移状态无法确定性识别；拒绝继续，需人工迁移。"""


def _build_alembic_config() -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    return config


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
        # STATE C：schema 等价于 7f1f4d9a2c10 -> 补标记后升级，owner 迁移正常执行。
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
