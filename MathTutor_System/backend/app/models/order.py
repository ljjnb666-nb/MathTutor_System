"""
Payment order model.
"""
from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String

from app.models.base import Base, created_at_column, pk_column


class Order(Base):
    __tablename__ = "orders"

    id = pk_column()
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    plan_id = Column(Integer, ForeignKey("plans.id"), nullable=False, index=True)
    amount = Column(Float, nullable=False)
    currency = Column(String(8), default="CNY", nullable=False)
    status = Column(String(32), default="pending", nullable=False)
    payment_method = Column(String(32), nullable=True)
    period_months = Column(Integer, default=1, nullable=False)
    out_trade_no = Column(String(128), unique=True, index=True, nullable=False)
    third_party_trade_no = Column(String(128), nullable=True)
    paid_at = Column(DateTime, nullable=True)
    created_at = created_at_column()
