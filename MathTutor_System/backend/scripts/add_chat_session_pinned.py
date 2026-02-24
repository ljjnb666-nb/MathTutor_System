r"""
为 chat_sessions 表添加 pinned 列（用于固定会话功能）。
若表已存在且尚无 pinned 列则执行迁移；新建库无需运行。
用法（在 backend 目录下执行）：
  .venv\Scripts\python.exe scripts/add_chat_session_pinned.py
"""
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.models.base import SessionLocal


def main() -> None:
    db = SessionLocal()
    try:
        r = db.execute(text("PRAGMA table_info(chat_sessions)"))
        rows = r.fetchall()
        has_pinned = any(row[1] == "pinned" for row in rows)
        if has_pinned:
            print("chat_sessions 已有 pinned 列，无需迁移。")
            return
        db.execute(text("ALTER TABLE chat_sessions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0"))
        db.commit()
        print("已在 chat_sessions 表上添加 pinned 列。")
    finally:
        db.close()


if __name__ == "__main__":
    main()
