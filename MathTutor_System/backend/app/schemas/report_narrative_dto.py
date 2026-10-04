"""
Grounded narrative DTO（PHASE 2D-1B-3）。

契约要点：
- LLM 只返回 NarrativePlan（evidence id 选择 / action enum / closing style），
  schema extra="forbid" + 无任何自由文本 / 数字 / 事实字段 —— 模型在结构上
  无法编造事实，最终家长正文由 server deterministic renderer 唯一生成。
- GroundedNarrativeResponse 携带 grounding 元数据（系统数据 / 教师观察 / AI 组织
  三层 provenance）。
- 学科中立（SUBJECT_DIMENSION_REQUIRED 已登记）：不引入数学专用命名。
"""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.report_snapshot_dto import ReportPeriod

NarrativeClosingStyle = Literal["encouraging", "steady"]

NarrativeAction = Literal[
    "practice_target",
    "review_pending",
    "maintain_learning_habit",
    "support_classroom_focus",
    "continue_observation",
]


class TeacherObservationInput(BaseModel):
    """教师课堂观察输入；全部可选，可为 null（仅基于 system snapshot）。"""

    model_config = ConfigDict(extra="forbid")

    focus_level: int | None = Field(default=None, ge=1, le=5)
    mastery_level: int | None = Field(default=None, ge=1, le=5)
    keywords: list[str] = Field(default_factory=list)

    @field_validator("keywords")
    @classmethod
    def _clean_keywords(cls, value: list[str]) -> list[str]:
        cleaned = [keyword.strip() for keyword in value if isinstance(keyword, str) and keyword.strip()]
        if any(len(keyword) > 64 for keyword in cleaned):
            raise ValueError("每个关键词最多 64 个字符")
        if len(cleaned) > 4:
            raise ValueError("关键词最多 4 个")
        return cleaned


class GroundedNarrativeRequest(BaseModel):
    """grounded narrative v1 请求。

    明确不接受 draft / template / free_form_teacher_note：任意教师草稿的
    semantic preservation 无法在 v1 机械验证（TEACHER_DRAFT_PROVENANCE_REQUIRED
    已登记）；人工草稿路径仍由 legacy /after-class 提供。
    """

    model_config = ConfigDict(extra="forbid")

    teacher_observation: TeacherObservationInput | None = None


class NarrativeRecommendationPlan(BaseModel):
    """LLM 只能选择已存在的 basis_id + 系统 enum action，不能写建议文字。"""

    model_config = ConfigDict(extra="forbid")

    basis_id: str = Field(min_length=1)
    action: NarrativeAction


class GroundedNarrativePlan(BaseModel):
    """LLM 唯一允许的输出 schema（NarrativePlan v1）。

    不存在 comment / text / sentence / summary / number / score / percentage /
    topic / student_name 等任何 free-text factual output 字段。
    """

    model_config = ConfigDict(extra="forbid")

    version: Literal[1]
    system_fact_ids: list[str] = Field(default_factory=list, max_length=5)
    teacher_observation_ids: list[str] = Field(default_factory=list, max_length=4)
    recommendations: list[NarrativeRecommendationPlan] = Field(default_factory=list, max_length=2)
    closing_style: NarrativeClosingStyle

    @field_validator("system_fact_ids", "teacher_observation_ids")
    @classmethod
    def _reject_duplicate_ids(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("duplicate evidence id")
        return value

    @field_validator("recommendations")
    @classmethod
    def _reject_duplicate_basis(cls, value: list[NarrativeRecommendationPlan]) -> list[NarrativeRecommendationPlan]:
        basis_ids = [item.basis_id for item in value]
        if len(set(basis_ids)) != len(basis_ids):
            raise ValueError("duplicate recommendation basis_id")
        return value


class NarrativeGrounding(BaseModel):
    """三层 provenance：系统数据 / 教师观察 / AI 组织（供 B4 UI 展示）。"""

    system_fact_ids: list[str]
    teacher_observation_ids: list[str]
    recommendation_basis_ids: list[str]


class GroundedNarrativeResponse(BaseModel):
    """最终响应：正文是 deterministic renderer 的产物，附 grounding 元数据。

    不返回 raw snapshot / LLM raw output / prompt。
    """

    comment: str
    period: ReportPeriod
    grounding: NarrativeGrounding
