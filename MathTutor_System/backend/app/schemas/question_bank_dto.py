"""
题库收藏 Pydantic DTO
"""
from datetime import datetime

from pydantic import BaseModel, Field


class BankCollectRequest(BaseModel):
    """收藏题目入题库请求（来自 Gen 或 Mistake）"""

    content: str = Field(..., description="题干，含 LaTeX")
    options: list[str] = Field(default_factory=list, description="选项数组（选择题）")
    answer: str = Field(..., description="答案")
    analysis: str = Field(default="", description="解析")
    question_type: str = Field(..., description="题型：选择/填空/解答 或 choice/fill/solution")
    difficulty: str = Field(..., description="难度 L1-L5")
    knowledge_point: str = Field(..., description="知识点")
    source: str = Field(..., description="来源，如 AI生成、错题录入")
    student_id: int | None = Field(None, description="学生 ID，空为通用题库")
    tags: list[str] = Field(default_factory=list, description="标签，如 压轴题、易错题")
    images: list[str] = Field(default_factory=list, description="题目附图 data URL 列表")


class BankItemRead(BaseModel):
    """题库条目响应"""
    id: int
    owner_user_id: int | None = None
    student_id: int | None = None
    content: str
    options: list[str]
    answer: str
    analysis: str
    question_type: str
    difficulty: str
    knowledge_point: str
    source: str
    tags: list[str] = Field(default_factory=list)
    images: list[str] = Field(default_factory=list, description="题目附图 data URL 列表")
    created_at: datetime

    model_config = {"from_attributes": True}


class BankCollectResponse(BaseModel):
    """收藏接口响应：含条目与是否为新录入（用于查重反馈）"""
    data: BankItemRead
    created: bool = True
