"""
套餐 Plan 模型：免费版 / 基础版 / 专业版等
"""
from sqlalchemy import Column, Float, Integer, String
from sqlalchemy.dialects.sqlite import JSON

from app.models.base import Base


class Plan(Base):
    __tablename__ = "plans"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(32), unique=True, index=True, nullable=False)  # free | basic | pro
    name = Column(String(64), nullable=False)
    max_students = Column(Integer, nullable=False)
    features = Column(JSON, default=dict, nullable=False)  # e.g. {"magic_ppt": true, "rag": true}
    sort_order = Column(Integer, default=0, nullable=False)
    price_monthly = Column(Float, nullable=True)
    price_yearly = Column(Float, nullable=True)
