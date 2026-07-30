"""
Current subscription state for a user.
"""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.models.base import Base, created_at_column, pk_column, updated_at_column


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = pk_column()
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True, unique=True)
    plan_id = Column(Integer, ForeignKey("plans.id"), nullable=False, index=True)
    status = Column(String(32), default="active", nullable=False)
    period_start = Column(DateTime, nullable=True)
    period_end = Column(DateTime, nullable=True)
    created_at = created_at_column()
    updated_at = updated_at_column()

    user = relationship("User", backref="subscription", foreign_keys=[user_id])
    plan = relationship("Plan", backref="subscriptions", foreign_keys=[plan_id])
