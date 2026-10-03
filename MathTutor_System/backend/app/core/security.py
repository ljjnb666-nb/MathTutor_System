"""Password hashing and JWT helpers."""
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.core.config import _DEFAULT_SECRET_KEY, SECRET_KEY, settings

logger = logging.getLogger(__name__)

# Single definition lives in app.core.config; aliased here for callers/tests.
_DEFAULT_SECRET = _DEFAULT_SECRET_KEY
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

MIN_PASSWORD_CHARS = 8
# bcrypt truncates input at 72 bytes; longer secrets silently degrade.
MAX_PASSWORD_UTF8_BYTES = 72
MIN_SECRET_KEY_UTF8_BYTES = 32

if settings.is_production:
    if not SECRET_KEY.strip() or SECRET_KEY == _DEFAULT_SECRET:
        raise RuntimeError("SECRET_KEY must be set to a non-default value in production.")
    if len(SECRET_KEY.encode("utf-8")) < MIN_SECRET_KEY_UTF8_BYTES:
        # Never include the configured value or its length in the error.
        raise RuntimeError(
            "SECRET_KEY too short: production requires at least "
            f"{MIN_SECRET_KEY_UTF8_BYTES} UTF-8 bytes."
        )
elif SECRET_KEY == _DEFAULT_SECRET:
    # Visibility only: never print the key itself, only the fact that it is the default.
    logger.warning(
        "Using the default development SECRET_KEY. Set SECRET_KEY in .env before deploying "
        "outside local development."
    )


class PasswordPolicyError(ValueError):
    """Raised when a new password violates the single password policy."""


def validate_password_for_hash(password: str) -> str:
    """唯一的新密码 policy authority：至少 8 个字符，且 UTF-8 编码不超过 72 bytes（bcrypt 边界）。"""
    if not isinstance(password, str) or not password.strip():
        raise PasswordPolicyError("密码不能为空")
    if len(password) < MIN_PASSWORD_CHARS:
        raise PasswordPolicyError(f"密码长度至少 {MIN_PASSWORD_CHARS} 个字符")
    if len(password.encode("utf-8")) > MAX_PASSWORD_UTF8_BYTES:
        raise PasswordPolicyError(f"密码过长（UTF-8 编码不能超过 {MAX_PASSWORD_UTF8_BYTES} 字节）")
    return password


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        plain = plain_password.encode("utf-8")
        hashed = hashed_password.encode("utf-8") if isinstance(hashed_password, str) else hashed_password
        return bcrypt.checkpw(plain, hashed)
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    validated = validate_password_for_hash(password)
    return bcrypt.hashpw(validated.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(UTC) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
