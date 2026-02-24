"""
排课 Pydantic DTO：创建、更新、响应（含每周重复）
"""
from datetime import date, datetime

from pydantic import BaseModel, Field


class ScheduleCreate(BaseModel):
    """新增排课"""

    student_id: int = Field(..., description="学生 ID")
    schedule_date: date = Field(..., description="上课日期 YYYY-MM-DD（重复时为生效起始日）")
    start_time: str = Field(..., min_length=4, max_length=8, description="开始时间 HH:MM")
    end_time: str = Field(..., min_length=4, max_length=8, description="结束时间 HH:MM")
    subject: str | None = Field(None, max_length=128, description="主题/科目")
    note: str | None = Field(None, max_length=512, description="备注")
    recurrence_weekdays: list[int] | None = Field(
        None,
        description="每周重复的星期，如 [0,2,4] 表示周一三五；不传或空为单次。0=周一 6=周日",
    )


class ScheduleUpdate(BaseModel):
    """修改排课（部分字段可选）"""

    schedule_date: date | None = None
    start_time: str | None = Field(None, min_length=4, max_length=8)
    end_time: str | None = Field(None, min_length=4, max_length=8)
    subject: str | None = None
    note: str | None = None
    recurrence_weekdays: list[int] | None = None  # 空列表表示改为单次


class ScheduleResponse(BaseModel):
    """排课响应（列表为展开后的每条 occurrence，含是否重复）"""

    id: int
    user_id: int
    student_id: int
    student_name: str | None = None
    schedule_date: date  # 单次为原日期，重复为当次 occurrence 日期
    start_time: str
    end_time: str
    subject: str | None = None
    note: str | None = None
    is_recurring: bool = False  # 是否来自每周重复规则
    recurrence_weekdays: list[int] | None = None  # 仅当 is_recurring 时有值
    created_at: datetime | None = None  # 列表展开时可能不填

    model_config = {"from_attributes": True}
