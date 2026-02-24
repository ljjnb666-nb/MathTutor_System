"""
套餐与订阅的 Pydantic DTO
"""
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class PlanResponse(BaseModel):
    id: int
    code: str
    name: str
    max_students: int
    features: dict[str, Any] = {}
    sort_order: int
    price_monthly: float | None = None
    price_yearly: float | None = None

    model_config = {"from_attributes": True}


class SubscriptionMeResponse(BaseModel):
    """GET /api/subscription/me 返回：当前套餐信息 + 已用学生数"""

    plan: PlanResponse | None = None
    status: str
    period_end: datetime | None = None
    student_count: int
    max_students: int


class SubscriptionHistoryItem(BaseModel):
    """订阅历史单条"""

    id: int
    user_id: int
    plan_code: str
    plan_name: str
    period_start: datetime | None
    period_end: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
