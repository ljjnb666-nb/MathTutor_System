"""
错题本 Pydantic DTO（Active Learning 版）
"""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

MistakeStatus = Literal["pending", "mastered"]


class MistakeCreate(BaseModel):
    """创建错题请求"""

    student_id: int = Field(..., description="学生 ID")
    topic: str = Field(..., description="知识点/主题，如 Function, Geometry")
    source: str = Field(..., description="来源，如 Midterm Exam")
    content: str = Field(..., description="题目文本")
    options: list[str] | None = Field(default=None, description="选择题选项列表（可选）")
    solution: str | None = Field(default=None, description="正确答案或关键步骤（可选）")


class MistakeResponse(BaseModel):
    """错题记录响应"""

    id: int
    student_id: int
    topic: str
    source: str
    content: str
    options: list | None = None  # 选择题选项列表
    solution: str | None
    status: str
    review_count: int
    next_review_date: date | None = None  # 下次复习日
    created_at: datetime
    mastered_at: datetime | None = None  # 标记为已掌握的时间，学情趋势用

    model_config = {"from_attributes": True}
