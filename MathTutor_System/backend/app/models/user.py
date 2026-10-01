"""
Teacher/admin account model.
"""
from sqlalchemy import Boolean, Column, DateTime, String
from uuid import uuid4

from app.models.base import Base, created_at_column, pk_column


USER_DELETION_ACTIVE = "active"
USER_DELETION_DELETING = "deleting"


class User(Base):
    __tablename__ = "users"

    id = pk_column()
    # Immutable account-instance identity; numeric primary keys may be recycled.
    auth_subject = Column(String(36), nullable=False, unique=True, index=True, default=lambda: str(uuid4()))
    username = Column(String(128), unique=True, index=True, nullable=False)
    hashed_password = Column(String(256), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    deletion_state = Column(String(16), nullable=False, default=USER_DELETION_ACTIVE, server_default=USER_DELETION_ACTIVE)
    deletion_started_at = Column(DateTime, nullable=True)
    role = Column(String(32), default="teacher", nullable=False)  # teacher | admin
    created_at = created_at_column()
