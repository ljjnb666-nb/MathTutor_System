"""
Student model scoped to an owning teacher/admin user.
"""
from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from uuid import uuid4

from app.models.base import Base, created_at_column, json_list_column, pk_column


class Student(Base):
    __tablename__ = "students"

    id = pk_column()
    # Immutable credential identity; integer primary keys may be recycled.
    auth_subject = Column(String(36), nullable=False, unique=True, index=True, default=lambda: str(uuid4()))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    name = Column(String(128), nullable=False)
    grade = Column(String(64), nullable=False)
    class_name = Column(String(64), nullable=False)
    tags = json_list_column()
    performance_score = Column(Integer, default=60, nullable=False)
    created_at = created_at_column()
    login_code = Column(String(32), unique=True, nullable=True, index=True)
    hashed_password = Column(String(256), nullable=True)

    owner = relationship("User", backref="students", foreign_keys=[user_id])
