"""
Subscription plan model.
"""
from sqlalchemy import Column, Float, Integer, String

from app.models.base import Base, json_dict_column, pk_column


class Plan(Base):
    __tablename__ = "plans"

    id = pk_column()
    code = Column(String(32), unique=True, index=True, nullable=False)
    name = Column(String(64), nullable=False)
    max_students = Column(Integer, nullable=False)
    features = json_dict_column()
    sort_order = Column(Integer, default=0, nullable=False)
    price_monthly = Column(Float, nullable=True)
    price_yearly = Column(Float, nullable=True)
