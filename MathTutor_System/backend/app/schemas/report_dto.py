"""
课后报告生成器：请求与响应模型。
"""
from pydantic import BaseModel, Field


class AfterClassCommentRequest(BaseModel):
    """课后评语生成请求：今日状态 + 关键词；或草稿由 AI 修饰。"""

    focus_level: int = Field(ge=1, le=5, description="专注度 1-5 星")
    mastery_level: int = Field(ge=1, le=5, description="掌握度 1-5 星")
    keywords: list[str] = Field(default_factory=list, max_length=4, description="1-2 个关键词，如：粗心、有进步")
    student_name: str | None = Field(default=None, max_length=32, description="学生姓名，可选，用于评语中称呼")
    draft: str | None = Field(default=None, max_length=2000, description="老师写的草稿，若提供则由 AI 修饰成可发给家长的评语")
    template: str | None = Field(default=None, max_length=3000, description="修饰模板：一段范文或结构示例，AI 将按此风格与结构修饰草稿")


class AfterClassCommentResponse(BaseModel):
    """课后评语生成响应。"""

    comment: str = Field(description="100-200 字的温和、专业且具体的评语，供复制发送给家长")


# ---------- 可视化学习报告 ----------


class WeakPointItem(BaseModel):
    """待攻克项：知识点 + 问题描述。"""

    point: str = Field(description="知识点或能力点名称")
    description: str | None = Field(default=None, description="问题描述，如：逻辑偏差、计算易错")


class LearningReportParseRequest(BaseModel):
    """可视化学习报告：从一段描述中解析出结构化数据。"""

    draft: str = Field(max_length=2000, description="老师对当日学情的描述，如：今日掌握了A，但在B上出现逻辑偏差，预计还需3课时攻克")


class LearningReportParseResponse(BaseModel):
    """解析后的学习报告结构，供前端可视化展示。"""

    mastered: list[str] = Field(default_factory=list, description="今日已掌握的知识点/能力点")
    weak_points: list[WeakPointItem] = Field(default_factory=list, description="存在问题或待攻克的知识点及描述")
    estimated_hours: int = Field(ge=0, le=99, default=0, description="预计还需多少课时可攻克弱项")
