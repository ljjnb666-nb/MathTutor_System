"""Teacher Agent practice artifact and confirmed action workflow."""
from __future__ import annotations

import hashlib
import json
import secrets
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import LLMConfig
from app.core.subscription import get_current_subscription, require_feature
from app.models.agent_artifact import AgentAction, AgentArtifact
from app.models.agent_run import AgentRun
from app.models.question_bank import QuestionBank
from app.models.student import Student
from app.models.user import User
from app.schemas.practice_draft_dto import PracticeDraftCreate, PracticeDraftConfirm, PracticeDraftUpdate, PracticeSetDraft
from app.services.practice_draft_generator import LLMPracticeDraftGenerator, PracticeDraftGenerator
from app.services.practice_draft_validator import validate_practice_draft
from app.services.question_bank_service import SaveQuestionToBankItem, save_questions_to_bank

ARTIFACT_TYPE_PRACTICE_SET = "practice_set"
ACTION_SAVE_PRACTICE_SET = "save_practice_set_to_question_bank"
TERMINAL_ARTIFACT_STATUSES = {"saved", "cancelled"}


def get_practice_draft_generator() -> PracticeDraftGenerator:
    return LLMPracticeDraftGenerator()


async def create_practice_artifact(
    db: Session,
    user: User,
    run_id: int,
    request: PracticeDraftCreate,
    llm_config: LLMConfig,
    generator: PracticeDraftGenerator | None = None,
) -> AgentArtifact:
    run = _get_owned_completed_run(db, user, run_id)
    _require_student_owned_if_set(db, user, request.student_id)
    if request.use_knowledge_base:
        sub = get_current_subscription(user, db)
        require_feature(sub, "rag", user)
    context_summary = _build_context_summary(db, user, run, request)
    draft = await (generator or LLMPracticeDraftGenerator()).generate(
        teacher_goal=run.goal,
        intent=run.intent_json or {},
        request=request,
        context_summary=context_summary,
        llm_config=llm_config,
    )
    validation = validate_practice_draft(draft, request)
    status = "ready_for_confirmation" if validation["valid"] else "draft"
    artifact = AgentArtifact(
        user_id=user.id,
        agent_run_id=run.id,
        artifact_type=ARTIFACT_TYPE_PRACTICE_SET,
        status=status,
        version=1,
        title=draft.title,
        content_json=draft.model_dump(),
        validation_json=validation,
        context_summary_json=context_summary,
        student_id=request.student_id,
        knowledge_point=", ".join(request.knowledge_points)[:255] if request.knowledge_points else run.context_snapshot_json.get("knowledge_point") if isinstance(run.context_snapshot_json, dict) else None,
    )
    db.add(artifact)
    db.commit()
    db.refresh(artifact)
    return artifact


def get_artifact_or_404(db: Session, user: User, artifact_id: int) -> AgentArtifact:
    row = db.get(AgentArtifact, artifact_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return row


def update_practice_artifact(db: Session, user: User, artifact_id: int, request: PracticeDraftUpdate) -> AgentArtifact:
    artifact = get_artifact_or_404(db, user, artifact_id)
    if artifact.status in TERMINAL_ARTIFACT_STATUSES:
        raise HTTPException(status_code=409, detail="Artifact cannot be edited in its current status")
    if artifact.version != request.expected_version:
        raise HTTPException(status_code=409, detail="Practice draft has changed. Refresh and retry.")
    validation = validate_practice_draft(request.content, _request_from_artifact(artifact))
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail={"message": "Practice draft validation failed", "validation": validation})
    artifact.content_json = request.content.model_dump()
    artifact.validation_json = validation
    artifact.title = request.content.title
    artifact.version += 1
    artifact.status = "ready_for_confirmation"
    db.commit()
    db.refresh(artifact)
    return artifact


def prepare_practice_save(db: Session, user: User, artifact_id: int) -> tuple[AgentAction, dict]:
    artifact = get_artifact_or_404(db, user, artifact_id)
    _assert_ready_artifact(db, user, artifact)
    action = AgentAction(
        user_id=user.id,
        agent_run_id=artifact.agent_run_id,
        artifact_id=artifact.id,
        action_type=ACTION_SAVE_PRACTICE_SET,
        status="pending_confirmation",
        idempotency_key=secrets.token_urlsafe(24),
        payload_hash=_payload_hash(artifact.content_json),
        expected_artifact_version=artifact.version,
        result_json=None,
    )
    db.add(action)
    db.commit()
    db.refresh(action)
    return action, _confirmation_summary(artifact)


def get_action_or_404(db: Session, user: User, action_id: int) -> AgentAction:
    row = db.get(AgentAction, action_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Action not found")
    return row


def cancel_action(db: Session, user: User, action_id: int) -> AgentAction:
    action = get_action_or_404(db, user, action_id)
    if action.status != "pending_confirmation":
        raise HTTPException(status_code=409, detail="Only pending actions can be cancelled")
    now = _now()
    action.status = "cancelled"
    action.cancelled_at = now
    db.commit()
    db.refresh(action)
    return action


def confirm_action(db: Session, user: User, action_id: int, request: PracticeDraftConfirm) -> AgentAction:
    action = get_action_or_404(db, user, action_id)
    if action.idempotency_key != request.idempotency_key:
        existing = (
            db.query(AgentAction)
            .filter(
                AgentAction.user_id == user.id,
                AgentAction.action_type == ACTION_SAVE_PRACTICE_SET,
                AgentAction.idempotency_key == request.idempotency_key,
            )
            .first()
        )
        if existing and existing.status == "completed":
            return existing
        raise HTTPException(status_code=409, detail="Idempotency key does not match this action")
    if action.status == "completed":
        return action
    if action.status != "pending_confirmation":
        raise HTTPException(status_code=409, detail="Action is not pending confirmation")
    artifact = get_artifact_or_404(db, user, action.artifact_id)
    if artifact.status == "saved":
        raise HTTPException(status_code=409, detail="Artifact has already been saved")
    if action.expected_artifact_version != request.expected_artifact_version or artifact.version != request.expected_artifact_version:
        raise HTTPException(status_code=409, detail="Artifact version has changed")

    now = _now()
    action.status = "executing"
    action.confirmed_at = now
    action.started_at = now
    db.flush()
    try:
        _assert_ready_artifact(db, user, artifact)
        draft = PracticeSetDraft.model_validate(artifact.content_json)
        validation = validate_practice_draft(draft, _request_from_artifact(artifact))
        if not validation["valid"]:
            raise HTTPException(status_code=409, detail={"message": "Practice draft validation failed", "validation": validation})
        rows = save_questions_to_bank(db, user, _bank_items_from_draft(artifact, draft), dedupe=False)
        question_ids = [row.id for row in rows]
        result = {
            "question_ids": question_ids,
            "question_count": len(question_ids),
            "target": "question_bank",
            "artifact_id": artifact.id,
            "artifact_version": artifact.version,
        }
        artifact.status = "saved"
        artifact.confirmed_at = now
        artifact.validation_json = validation
        action.status = "completed"
        action.result_json = result
        action.completed_at = now
        db.commit()
        db.refresh(action)
        return action
    except Exception as exc:
        db.rollback()
        action = db.get(AgentAction, action_id)
        if action is None:
            raise
        action.status = "failed"
        action.error_code = "save_failed"
        action.error_message = _sanitize_error(exc)
        action.completed_at = _now()
        db.commit()
        db.refresh(action)
        if isinstance(exc, HTTPException):
            raise exc
        raise HTTPException(status_code=500, detail="Practice save failed")


def _get_owned_completed_run(db: Session, user: User, run_id: int) -> AgentRun:
    run = db.get(AgentRun, run_id)
    if run is None or run.user_id != user.id:
        raise HTTPException(status_code=404, detail="Agent run not found")
    if run.status != "completed":
        raise HTTPException(status_code=409, detail="Agent run must be completed")
    return run


def _require_student_owned_if_set(db: Session, user: User, student_id: int | None) -> None:
    if student_id is None:
        return
    student = db.get(Student, student_id)
    if student is None or student.user_id != user.id:
        raise HTTPException(status_code=404, detail="Student not found")


def _assert_ready_artifact(db: Session, user: User, artifact: AgentArtifact) -> None:
    if artifact.user_id != user.id:
        raise HTTPException(status_code=404, detail="Artifact not found")
    if artifact.artifact_type != ARTIFACT_TYPE_PRACTICE_SET:
        raise HTTPException(status_code=409, detail="Unsupported artifact type")
    if artifact.status != "ready_for_confirmation":
        raise HTTPException(status_code=409, detail="Artifact is not ready for confirmation")
    if not (artifact.validation_json or {}).get("valid"):
        raise HTTPException(status_code=409, detail="Artifact validation has not passed")
    run = db.get(AgentRun, artifact.agent_run_id)
    if run is None or run.user_id != user.id:
        raise HTTPException(status_code=404, detail="Agent run not found")
    _require_student_owned_if_set(db, user, artifact.student_id)


def _build_context_summary(db: Session, user: User, run: AgentRun, request: PracticeDraftCreate) -> dict:
    summary: dict = {
        "agent_run_id": run.id,
        "intent_type": (run.intent_json or {}).get("intent_type") if isinstance(run.intent_json, dict) else None,
        "goal_preview": run.goal[:180],
        "sources": ["teacher_goal", "agent_run_intent"],
    }
    if request.student_id is not None:
        student = db.get(Student, request.student_id)
        if student is not None and student.user_id == user.id:
            summary["student"] = {
                "id": student.id,
                "name": student.name,
                "grade": student.grade,
                "summary": f"{student.name} / {student.grade or 'unknown grade'}",
            }
            summary["sources"].append("owned_student_summary")
    if request.use_knowledge_base:
        summary["rag"] = {"used": True, "summary": "Owned RAG may be used by generator; raw chunks are not persisted."}
        summary["sources"].append("owned_knowledge_base")
    return summary


def _request_from_artifact(artifact: AgentArtifact) -> PracticeDraftCreate:
    content = artifact.content_json or {}
    return PracticeDraftCreate(
        question_count=len(content.get("questions") or []),
        question_types=list({q.get("question_type", "choice") for q in content.get("questions", [])}) or ["choice"],
        difficulty="mixed",
        knowledge_points=list(content.get("knowledge_points") or []),
        student_id=artifact.student_id,
        use_student_context=artifact.student_id is not None,
        use_knowledge_base=False,
    )


def _bank_items_from_draft(artifact: AgentArtifact, draft: PracticeSetDraft) -> list[SaveQuestionToBankItem]:
    items = []
    for question in draft.questions:
        items.append(
            SaveQuestionToBankItem(
                content=question.stem,
                options=question.options,
                answer=question.answer,
                analysis=question.explanation,
                question_type=question.question_type,
                difficulty=question.difficulty,
                knowledge_point=", ".join(question.knowledge_points)[:255],
                source="TeacherAgentPracticeDraft",
                student_id=artifact.student_id,
                tags=["teacher_agent", f"artifact:{artifact.id}"],
            )
        )
    return items


def _confirmation_summary(artifact: AgentArtifact) -> dict:
    draft = PracticeSetDraft.model_validate(artifact.content_json)
    qtypes: dict[str, int] = {}
    total_score = 0.0
    kps: set[str] = set()
    for question in draft.questions:
        qtypes[question.question_type] = qtypes.get(question.question_type, 0) + 1
        total_score += float(question.score)
        kps.update(question.knowledge_points)
    return {
        "question_count": len(draft.questions),
        "question_type_distribution": qtypes,
        "knowledge_points": sorted(kps),
        "total_score": total_score,
        "target_question_bank": "question_bank",
        "artifact_version": artifact.version,
        "will_create": ["formal question_bank items"],
        "will_not": ["publish homework", "create exam", "send notifications", "charge payment", "create PPTX"],
    }


def _payload_hash(payload: dict) -> str:
    return hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


def _now():
    return datetime.now(UTC).replace(tzinfo=None)


def _sanitize_error(exc: Exception) -> str:
    text = str(getattr(exc, "detail", None) or exc)
    for marker in ["api_key", "authorization", "x-llm-api-key"]:
        text = text.replace(marker, "[redacted]")
    return text[:512]
