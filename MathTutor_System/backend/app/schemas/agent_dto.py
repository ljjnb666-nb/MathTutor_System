"""DTOs for the read-only Teacher Agent."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


IntentType = Literal[
    "lesson_preparation",
    "review_plan",
    "practice_plan",
    "student_analysis",
    "exam_preparation_plan",
    "general_teaching",
]


class TeacherAgentRunCreate(BaseModel):
    goal: str = Field(..., min_length=1, max_length=1000)
    student_id: int | None = None
    knowledge_point: str | None = Field(None, max_length=128)
    use_knowledge_base: bool = False

    @field_validator("goal")
    @classmethod
    def clean_goal(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("goal cannot be empty")
        return cleaned


class TeacherIntent(BaseModel):
    intent_type: IntentType = "general_teaching"
    student_name: str | None = None
    knowledge_points: list[str] = Field(default_factory=list)
    grade: str | None = None
    class_name: str | None = None
    duration_minutes: int | None = Field(None, ge=1, le=240)
    difficulty: str | None = None
    requested_outputs: list[str] = Field(default_factory=list)
    requires_student_context: bool = False
    requires_rag: bool = False
    missing_fields: list[dict] = Field(default_factory=list)
    candidate_tools: list[str] = Field(default_factory=list)


class AgentToolCallLog(BaseModel):
    tool_name: str
    risk_level: Literal["LOW"] = "LOW"
    status: Literal["success", "skipped", "failed"]
    safe_arguments: dict = Field(default_factory=dict)
    result_summary: dict | str | None = None
    duration_ms: int = 0
    error_code: str | None = None
    error_message: str | None = None


class TeacherAgentPlanStep(BaseModel):
    step_id: str
    title: str
    description: str
    basis: str
    future_action: str | None = None
    requires_confirmation: bool = False


class TeacherAgentPlan(BaseModel):
    title: str
    summary: str
    intent_type: IntentType
    resolved_context: dict = Field(default_factory=dict)
    evidence_summary: dict = Field(default_factory=dict)
    steps: list[TeacherAgentPlanStep] = Field(default_factory=list, min_length=1, max_length=12)
    expected_outputs: list[str] = Field(default_factory=list)
    missing_fields: list[dict] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    safety_mode: Literal["read_only"] = "read_only"


class AgentRunResponse(BaseModel):
    id: int
    user_id: int
    goal: str
    status: Literal["created", "running", "needs_input", "completed", "failed"]
    intent_json: dict | None = None
    context_snapshot_json: dict | None = None
    selected_tools_json: list | None = None
    tool_calls_json: list | None = None
    plan_json: dict | None = None
    missing_fields_json: list | None = None
    warnings_json: list | None = None
    error_code: str | None = None
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}
