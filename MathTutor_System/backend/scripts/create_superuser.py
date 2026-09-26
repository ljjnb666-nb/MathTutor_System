r"""
首次部署管理员引导脚本：在空数据库中按环境变量创建初始管理员。

用法（在 backend 目录下执行）：
  BOOTSTRAP_ADMIN_PASSWORD=<密码> python scripts/create_superuser.py

环境变量：
  BOOTSTRAP_ADMIN_USERNAME  可选，默认 admin（用户名不是秘密，可覆盖）
  BOOTSTRAP_ADMIN_PASSWORD  必填；未设置或长度不在 12-128 之间时拒绝创建

安全约定：
  - 密码只能来自环境变量，源码不含任何固定密码
  - 幂等：同名用户已存在时跳过，绝不修改已有账号的密码
  - 任何输出（stdout/stderr/异常信息）都不包含密码明文
"""
import os
import sys
from pathlib import Path

BOOTSTRAP_PASSWORD_MIN_LENGTH = 12
BOOTSTRAP_PASSWORD_MAX_LENGTH = 128
DEFAULT_BOOTSTRAP_USERNAME = "admin"

# 确保 backend 在路径中，便于 import app
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.core.security import get_password_hash  # noqa: E402
from app.models.base import SessionLocal, engine, Base  # noqa: E402
from app.models.user import User  # noqa: E402


class BootstrapConfigError(RuntimeError):
    """Bootstrap 凭证缺失或无效；错误信息为固定文案，不包含敏感值。"""


def resolve_bootstrap_credentials() -> tuple[str, str]:
    raw_username = os.environ.get("BOOTSTRAP_ADMIN_USERNAME", "").strip()
    username = raw_username or DEFAULT_BOOTSTRAP_USERNAME

    password = os.environ.get("BOOTSTRAP_ADMIN_PASSWORD") or ""
    if not password:
        raise BootstrapConfigError(
            "Bootstrap admin password is required for first deployment. "
            "Set BOOTSTRAP_ADMIN_PASSWORD (12-128 characters) and retry."
        )
    if not BOOTSTRAP_PASSWORD_MIN_LENGTH <= len(password) <= BOOTSTRAP_PASSWORD_MAX_LENGTH:
        raise BootstrapConfigError(
            f"Bootstrap admin password must be {BOOTSTRAP_PASSWORD_MIN_LENGTH}-"
            f"{BOOTSTRAP_PASSWORD_MAX_LENGTH} characters long."
        )
    return username, password


def create_bootstrap_admin() -> tuple[str, str]:
    """校验凭证后创建初始管理员，返回 (动作, 用户名)，动作取值 created / exists。"""
    username, password = resolve_bootstrap_credentials()

    # 凭证校验通过后才建表，保证配置缺失时不留下“空库 + 无管理员”的中间状态
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == username).first()
        if existing:
            return "exists", username
        user = User(
            username=username,
            hashed_password=get_password_hash(password),
            is_active=True,
            role="admin",
        )
        db.add(user)
        db.commit()
        return "created", username
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> int:
    try:
        action, username = create_bootstrap_admin()
    except BootstrapConfigError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    if action == "exists":
        print(f"用户 {username} 已存在，跳过创建。")
    else:
        print(f"已创建初始管理员: username={username}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
