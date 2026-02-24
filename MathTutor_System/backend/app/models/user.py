"""
管理员/教师 User 模型（与 Student 区分：User 为系统登录账号）
"""
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String

from app.models.base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(128), unique=True, index=True, nullable=False)
    hashed_password = Column(String(256), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    role = Column(String(32), default="teacher", nullable=False)  # teacher | admin
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
