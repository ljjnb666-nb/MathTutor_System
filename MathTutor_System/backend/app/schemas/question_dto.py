"""
题目 Pydantic DTO
"""
from datetime import datetime

from pydantic import BaseModel, Field


class GenerationRequest(BaseModel):
    """智能出题请求"""
    knowledge_point: str = Field(..., description="知识点，如：一次函数")
    difficulty: str = Field(..., description="难度等级 L1-L5")
    count: int = Field(default=3, ge=1, le=10, description="生成题目数量")


class QuestionResponse(BaseModel):
    """单道题目响应（智能出题用）"""
    body: str = Field(..., description="题干")
    options: list[str] = Field(default_factory=list, description="选项列表（选择题）")
    answer: str = Field(..., description="答案")
    analysis: str = Field(default="", description="解析")


# ---------- 题库 CRUD 用 DTO ----------


class QuestionCreate(BaseModel):
    """创建题目请求"""
    content: str = Field(..., description="题干，含 LaTeX")
    options: list[str] = Field(default_factory=list, description="选项数组")
    answer: str = Field(..., description="答案")
    analysis: str = Field(default="", description="解析")
    knowledge_point: str = Field(..., description="知识点")
    difficulty: str = Field(..., description="难度 L1-L5")
    question_type: str = Field(..., description="题型")
    source: str = Field(..., description="来源，如 AI生成 或 手动录入")
    student_id: int | None = Field(None, description="学生 ID，空为公共/模板题")


class QuestionRead(BaseModel):
    """题目查询响应"""
    id: int
    student_id: int | None = None
    content: str
    options: list[str]
    answer: str
    analysis: str
    knowledge_point: str
    difficulty: str
    question_type: str
    source: str
    created_at: datetime

    model_config = {"from_attributes": True}


class QuestionBatchCreate(BaseModel):
    """批量创建题目请求"""
    questions: list[QuestionCreate] = Field(..., description="题目列表")
