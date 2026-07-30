"""Password hashing and JWT helpers."""
import os
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
from jose import JWTError, jwt

_DEFAULT_SECRET = "math-tutor-dev-secret-change-in-production"
SECRET_KEY = os.getenv("SECRET_KEY", _DEFAULT_SECRET)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

_is_production = os.getenv("ENV", "development").lower() == "production" or os.getenv("DEBUG", "1").lower() in (
    "0",
    "false",
)
if _is_production and (not SECRET_KEY.strip() or SECRET_KEY == _DEFAULT_SECRET):
    raise RuntimeError("SECRET_KEY must be set to a non-default value in production.")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        plain = plain_password.encode("utf-8")
        hashed = hashed_password.encode("utf-8") if isinstance(hashed_password, str) else hashed_password
        return bcrypt.checkpw(plain, hashed)
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


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
