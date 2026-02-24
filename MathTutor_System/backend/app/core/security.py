"""
密码哈希与 JWT Token 工具（管理员/教师认证）
使用 bcrypt 直接哈希，避免 passlib 与新版 bcrypt 不兼容。
"""
import logging
import os
from datetime import datetime, timedelta
from typing import Any

import bcrypt
from jose import JWTError, jwt

# Config: JWT 与密码
_DEFAULT_SECRET = "math-tutor-dev-secret-change-in-production"
SECRET_KEY = os.getenv("SECRET_KEY", _DEFAULT_SECRET)
ALGORITHM = "HS256"

# 生产环境若仍使用默认 SECRET_KEY 则打日志警告
if SECRET_KEY == _DEFAULT_SECRET and (
    os.getenv("ENV") == "production" or os.getenv("DEBUG", "1").lower() in ("0", "false")
):
    logging.warning(
        "SECRET_KEY 未设置，正在使用默认值。生产环境请在 .env 或环境变量中设置 SECRET_KEY。"
    )
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 小时


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证明文密码与 bcrypt 哈希是否一致。"""
    try:
        p = plain_password.encode("utf-8")
        h = hashed_password.encode("utf-8") if isinstance(hashed_password, str) else hashed_password
        return bcrypt.checkpw(p, h)
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    """生成 bcrypt 密码哈希。"""
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt(),
    ).decode("utf-8")


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    """使用 python-jose 生成 JWT access_token。"""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any] | None:
    """解码 JWT，失败返回 None。"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None
