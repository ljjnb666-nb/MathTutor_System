r"""
将 user_id 为空的学生挂到指定用户（如 LJJ）。
若 students 表尚无 user_id 列，会先执行迁移添加该列。
用法（在 backend 目录下执行）：
  .venv\Scripts\python.exe scripts/assign_orphan_students.py
  或
  .venv\Scripts\python.exe scripts/assign_orphan_students.py  --username LJJ
"""
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.models.base import SessionLocal
from app.models.student import Student
from app.models.user import User

TARGET_USERNAME = "LJJ"


def ensure_user_id_column(db) -> None:
    """若 students 表没有 user_id 列则添加（SQLite 兼容）。"""
    if db.get_bind().dialect.name != "sqlite":
        return
    r = db.execute(text("PRAGMA table_info(students)"))
    rows = r.fetchall()
    has_user_id = any(row[1] == "user_id" for row in rows)
    if not has_user_id:
        db.execute(text("ALTER TABLE students ADD COLUMN user_id INTEGER"))
        db.commit()
        print("已在 students 表上添加 user_id 列。")


def main() -> None:
    db = SessionLocal()
    try:
        ensure_user_id_column(db)
        user = db.query(User).filter(User.username == TARGET_USERNAME).first()
        if not user:
            print(f"用户 {TARGET_USERNAME!r} 不存在，请先创建该用户或修改脚本中的 TARGET_USERNAME。")
            return
        count = db.query(Student).filter(Student.user_id.is_(None)).update(
            {Student.user_id: user.id},
            synchronize_session=False,
        )
        db.commit()
        print(f"已将 {count} 条无归属学生挂到用户 {TARGET_USERNAME!r} (id={user.id})。")
    except Exception as e:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
