"""DTOs for Teacher Agent practice-set drafts."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

PracticeDifficulty = Literal["easy", "medium", "hard", "mixed", "L1", "L2", "L3", "L4", "L5"]
PracticeQuestionDifficulty = Literal["easy", "medium", "hard", "L1", "L2", "L3", "L4", "L5"]
PracticeQuestionType = Literal["choice", "fill", "solution", "true_false", "选择", "填空", "解答", "判断"]


class PracticeDraftCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question_count: int = Field(5, ge=1, le=10)
    question_types: list[PracticeQuestionType] = Field(default_factory=lambda: ["choice"])
    difficulty: PracticeDifficulty = "medium"
    knowledge_points: list[str] = Field(default_factory=list, max_length=12)
    student_id: int | None = None
    use_student_context: bool = False
    use_knowledge_base: bool = False
    additional_requirements: str | None = Field(None, max_length=1000)

    @field_validator("knowledge_points")
    @classmethod
    def clean_knowledge_points(cls, value: list[str]) -> list[str]:
        cleaned = []
        for item in value or []:
            text = str(item or "").strip()
            if text and text not in cleaned:
                cleaned.append(text[:80])
        return cleaned


class PracticeQuestionDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_question_id: str = Field(..., min_length=1, max_length=64)
    question_type: PracticeQuestionType
    stem: str = Field(..., min_length=1, max_length=3000)
    options: list[str] = Field(default_factory=list, max_length=8)
    answer: str = Field(..., min_length=1, max_length=2000)
    explanation: str = Field(..., min_length=1, max_length=3000)
    knowledge_points: list[str] = Field(..., min_length=1, max_length=12)
    difficulty: PracticeQuestionDifficulty
    score: float = Field(..., gt=0, le=100)
    source_basis: list[str] = Field(default_factory=list, max_length=8)


class PracticeSetDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(..., min_length=1, max_length=255)
    summary: str = Field(..., min_length=1, max_length=1000)
    grade: str | None = Field(None, max_length=64)
    student_summary: str | None = Field(None, max_length=1000)
    knowledge_points: list[str] = Field(default_factory=list, max_length=12)
    difficulty_distribution: dict[str, int] = Field(default_factory=dict)
    questions: list[PracticeQuestionDraft] = Field(..., min_length=1, max_length=10)
    warnings: list[str] = Field(default_factory=list, max_length=20)
    safety_mode: Literal["draft_only"] = "draft_only"


class PracticeDraftUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_version: int = Field(..., ge=1)
    content: PracticeSetDraft


class PracticeDraftConfirm(BaseModel):
    model_config = ConfigDict(extra="forbid")

    idempotency_key: str = Field(..., min_length=8, max_length=128)
    expected_artifact_version: int = Field(..., ge=1)


class AgentArtifactResponse(BaseModel):
    id: int
    user_id: int
    agent_run_id: int
    artifact_type: str
    status: str
    version: int
    title: str
    content_json: dict
    validation_json: dict
    context_summary_json: dict | None = None
    student_id: int | None = None
    knowledge_point: str | None = None
    created_at: datetime
    updated_at: datetime
    confirmed_at: datetime | None = None
    cancelled_at: datetime | None = None

    model_config = {"from_attributes": True}


class AgentActionResponse(BaseModel):
    id: int
    user_id: int
    agent_run_id: int
    artifact_id: int
    action_type: str
    status: str
    idempotency_key: str
    payload_hash: str
    expected_artifact_version: int
    result_json: dict | None = None
    error_code: str | None = None
    error_message: str | None = None
    created_at: datetime
    confirmed_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    cancelled_at: datetime | None = None

    model_config = {"from_attributes": True}


class PreparePracticeSaveResponse(BaseModel):
    action: AgentActionResponse
    confirmation_summary: dict
