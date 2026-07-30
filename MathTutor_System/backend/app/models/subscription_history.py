"""
Audit trail for subscription changes.
"""
from sqlalchemy import Column, DateTime, ForeignKey, Integer
from sqlalchemy.orm import relationship

from app.models.base import Base, created_at_column, pk_column


class SubscriptionHistory(Base):
    __tablename__ = "subscription_history"

    id = pk_column()
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    plan_id = Column(Integer, ForeignKey("plans.id"), nullable=False, index=True)
    period_start = Column(DateTime, nullable=True)
    period_end = Column(DateTime, nullable=True)
    created_at = created_at_column()

    user = relationship("User", backref="subscription_histories", foreign_keys=[user_id])
    plan = relationship("Plan", backref="subscription_histories", foreign_keys=[plan_id])
