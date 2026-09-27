r"""探测数据库是否已初始化（存在 TutorPro 应用表）；docker-entrypoint 使用。

"Fresh / 未初始化"以 schema 状态为准，而不是数据库文件是否存在：
  - 数据库文件不存在 / 空文件 / 仅含无关表的 SQLite -> 未初始化（需要管理员 bootstrap）
  - 存在任一 Base.metadata 中的应用表             -> 已初始化（直接迁移启动）

退出码（供 shell 三分支判定）：
  0 = 已初始化（无需 bootstrap 密码）
  1 = 未初始化（entrypoint 必须先执行 create_superuser.py）
  2 = 探测本身失败（entrypoint 必须 fail closed，不得继续）
"""
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

EXIT_INITIALIZED = 0
EXIT_FRESH = 1
EXIT_ERROR = 2

_SQLITE_URL_PREFIX = "sqlite:///"


def _sqlite_file_path(database_url: str) -> str | None:
    """从 sqlite:/// URL 提取数据库文件路径；非 sqlite URL 返回 None。"""
    if not database_url.startswith(_SQLITE_URL_PREFIX):
        return None
    return database_url[len(_SQLITE_URL_PREFIX):] or None


def database_is_initialized() -> bool:
    from sqlalchemy import inspect

    from app.models.base import Base, engine

    tables = set(inspect(engine).get_table_names())
    return bool(tables & set(Base.metadata.tables))


def main() -> int:
    try:
        # sqlite 文件不存在时直接判定未初始化，避免探测连接顺手创建空文件。
        from app.core.config import DATABASE_URL

        db_file = _sqlite_file_path(DATABASE_URL)
        if db_file is not None and not Path(db_file).exists():
            return EXIT_FRESH
        return EXIT_INITIALIZED if database_is_initialized() else EXIT_FRESH
    except Exception as exc:
        print(f"ERROR: database schema probe failed: {exc}", file=sys.stderr)
        return EXIT_ERROR


if __name__ == "__main__":
    sys.exit(main())
