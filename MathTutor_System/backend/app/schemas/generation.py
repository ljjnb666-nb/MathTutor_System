"""
智能出题请求与题目项数据结构
"""
from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    """智能出题请求"""

    knowledge_point: str = Field(..., description="知识点")
    difficulty: str = Field(..., description="难度 L1-L5")
    question_type: str = Field(
        default="选择",
        description="题型：选择 / 填空 / 解答",
    )
    count: int = Field(default=3, ge=1, le=20, description="生成数量")
    scenario: str = Field(default="default", description="备课场景：default/specialized/sync/assessment/error_analysis")
    ref_content: str | None = Field(default=None, description="参考题目内容，用于专项突破/错题分析等场景")
    student_id: int | None = Field(default=None, description="学生 ID，生成题目归属该学生；空则为公共/模板题")
    use_knowledge_base: bool = Field(default=False, description="是否启用本地知识库，基于上传资料检索上下文再出题")


class WeakPointGenerateRequest(BaseModel):
    """按学生弱项一键出题请求（备课包）。"""

    student_id: int = Field(..., description="学生 ID，从其错题本 pending 弱项出题")
    count: int = Field(default=5, ge=1, le=15, description="生成题目数量")
    difficulty: str = Field(default="L3", description="难度 L1-L5")
    question_type: str = Field(default="综合", description="题型：选择/填空/解答/综合")
    use_knowledge_base: bool = Field(default=False, description="是否启用本地知识库")


class ExamGenerateRequest(BaseModel):
    """完整试卷生成请求：固定 8 选择 + 8 填空 + 12 解答，符合知识点与难度。"""

    knowledge_point: str = Field(..., description="知识点")
    difficulty: str = Field(..., description="难度 L1-L5")
    student_id: int | None = Field(default=None, description="学生 ID，题目归属该学生；空为公共题")
    use_knowledge_base: bool = Field(default=False, description="是否启用本地知识库检索上下文")


class QuestionItem(BaseModel):
    """单道题目项（题干要求包含 LaTeX）"""

    content: str = Field(..., description="题干，包含 LaTeX 公式")
    options: list[str] = Field(default_factory=list, description="选项（选择题时使用）")
    answer: str = Field(..., description="答案")
    analysis: str = Field(default="", description="解析")
    design_logic: str | None = Field(default=None, description="AI 改编/设计思路（参考题场景）")
    type_tag: str | None = Field(default=None, description="题目类型标签，如「陷阱题」「巩固题」")
    question_type: str | None = Field(default=None, description="题型：选择/填空/解答，综合生成时按实际题型填写")
    student_id: int | None = Field(default=None, description="学生 ID，归属该学生；空为公共题")