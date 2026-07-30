"""
Teacher/admin account model.
"""
from sqlalchemy import Boolean, Column, String

from app.models.base import Base, created_at_column, pk_column


class User(Base):
    __tablename__ = "users"

    id = pk_column()
    username = Column(String(128), unique=True, index=True, nullable=False)
    hashed_password = Column(String(256), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    role = Column(String(32), default="teacher", nullable=False)  # teacher | admin
    created_at = created_at_column()
