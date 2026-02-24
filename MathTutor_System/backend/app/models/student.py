"""
学生 SQLAlchemy Model（按 user_id 归属隔离）
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import relationship

from app.models.base import Base


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)  # 归属教师/管理员，NULL 表示历史数据
    name = Column(String(128), nullable=False)
    grade = Column(String(64), nullable=False)
    class_name = Column(String(64), nullable=False)
    tags = Column(JSON, default=list, nullable=False)  # e.g. ["数学课代表", "几何弱项"]
    performance_score = Column(Integer, default=60, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    # 学生端登录：登录码唯一，密码可选（NULL 表示仅用登录码）
    login_code = Column(String(32), unique=True, nullable=True, index=True)
    hashed_password = Column(String(256), nullable=True)

    owner = relationship("User", backref="students", foreign_keys=[user_id])
