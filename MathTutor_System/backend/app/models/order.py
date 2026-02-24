"""
订单 Order 模型（预留）：支付接入时使用，支付宝/微信回调更新
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String

from app.models.base import Base


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    plan_id = Column(Integer, ForeignKey("plans.id"), nullable=False, index=True)
    amount = Column(Float, nullable=False)
    currency = Column(String(8), default="CNY", nullable=False)
    status = Column(String(32), default="pending", nullable=False)  # pending | paid | failed | refunded
    payment_method = Column(String(32), nullable=True)  # alipay | wechat
    period_months = Column(Integer, default=1, nullable=False)  # 购买月数，用于回调时续期
    out_trade_no = Column(String(128), unique=True, index=True, nullable=False)
    third_party_trade_no = Column(String(128), nullable=True)
    paid_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
