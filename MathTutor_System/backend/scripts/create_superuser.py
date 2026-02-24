r"""
初始化超级用户脚本：在空数据库中创建 admin / 123456 账号。
用法（在 backend 目录下执行）：
  python scripts/create_superuser.py
  或
  .venv\Scripts\python.exe scripts/create_superuser.py
"""
import sys
from pathlib import Path

# 确保 backend 在路径中，便于 import app
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.core.security import get_password_hash
from app.models.base import SessionLocal, engine, Base
from app.models.user import User


def main() -> None:
    # 确保 users 表存在
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == "admin").first()
        if existing:
            print("用户 admin 已存在，跳过创建。")
            return
        user = User(
            username="admin",
            hashed_password=get_password_hash("123456"),
            is_active=True,
            role="admin",
        )
        db.add(user)
        db.commit()
        print("已创建超级用户: username=admin, password=123456")
    except Exception as e:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
