"""
管理员/教师 User 的 Pydantic DTO：登录、创建、响应、Token
"""
from datetime import datetime

from pydantic import BaseModel, Field


class Token(BaseModel):
    """登录成功返回的 JWT"""

    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    """创建新管理员"""

    username: str = Field(..., min_length=1, max_length=128, description="登录名")
    password: str = Field(..., min_length=6, max_length=128, description="明文密码")
    role: str = Field(default="teacher", description="角色：teacher | admin")


class UserResponse(BaseModel):
    """用户信息响应（不含密码）；列表时可选带 plan_code、period_end（当前套餐及到期日）。"""

    id: int
    username: str
    is_active: bool
    role: str
    created_at: datetime
    plan_code: str | None = None
    period_end: datetime | None = None

    model_config = {"from_attributes": True}


class UserSubscriptionUpdate(BaseModel):
    """管理员为用户设置套餐"""

    plan_code: str = Field(..., description="套餐 code：free / basic / pro")
    period_days: int | None = Field(None, ge=1, le=3650, description="有效天数（仅付费套餐），不传则默认 30")


class BatchSubscriptionUpdate(BaseModel):
    """批量设置套餐或批量续期"""

    user_ids: list[int] = Field(..., min_length=1, description="用户 ID 列表")
    plan_code: str | None = Field(None, description="套餐 code；不传则仅续期（延长 period_days）")
    period_days: int | None = Field(None, ge=1, le=3650, description="有效天数；仅续期时为延长天数，设套餐时为新周期天数（默认 30）")
