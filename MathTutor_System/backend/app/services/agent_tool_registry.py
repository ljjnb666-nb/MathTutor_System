"""Read-only tool registry for the Teacher Agent."""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Callable

from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.config import RAG_TOP_K
from app.core.deps import LLMConfig
from app.core.subscription import get_current_subscription, require_feature
from app.models.mistake import MistakeRecord
from app.models.schedule import Schedule
from app.models.student import Student
from app.models.user import User
from app.schemas.agent_dto import AgentToolCallLog
from app.services.topic_service import split_topics

MAX_TOOL_CALLS_PER_RUN = 8


class ToolArgs(BaseModel):
    student_id: int | None = None
    knowledge_point: str | None = Field(None, max_length=128)
    query: str | None = Field(None, max_length=500)


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    description: str
    risk_level: str
    input_schema: type[BaseModel]
    executor: Callable


def _owned_student(db: Session, user_id: int, student_id: int) -> Student:
    row = db.get(Student, student_id)
    if row is None or row.user_id != user_id:
        raise HTTPException(status_code=404, detail="Student not found")
    return row


def _student_summary(row: Student) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "grade": row.grade,
        "class_name": row.class_name,
        "tags": list(row.tags or [])[:10],
        "performance_score": row.performance_score,
    }


def list_owned_students(db: Session, user: User, args: ToolArgs, llm_config: LLMConfig) -> dict:
    rows = db.query(Student).filter(Student.user_id == user.id).order_by(Student.created_at.desc()).limit(50).all()
    return {"students": [_student_summary(row) for row in rows], "count": len(rows)}


def get_owned_student_profile(db: Session, user: User, args: ToolArgs, llm_config: LLMConfig) -> dict:
    if args.student_id is None:
        return {"missing_fields": [{"field": "student_id", "message": "Please choose a student."}]}
    return {"student": _student_summary(_owned_student(db, user.id, args.student_id))}


def get_student_weak_points(db: Session, user: User, args: ToolArgs, llm_config: LLMConfig) -> dict:
    if args.student_id is None:
        return {"weak_points": []}
    _owned_student(db, user.id, args.student_id)
    rows = db.query(MistakeRecord).filter(MistakeRecord.student_id == args.student_id, MistakeRecord.status == "pending").all()
    weak: set[str] = set()
    for row in rows:
        weak |= split_topics(row.topic)
    return {"weak_points": sorted(weak)[:20], "pending_mistake_count": len(rows)}


def get_student_recent_mistakes(db: Session, user: User, args: ToolArgs, llm_config: LLMConfig) -> dict:
    if args.student_id is None:
        return {"mistakes": [], "count": 0}
    _owned_student(db, user.id, args.student_id)
    rows = (
        db.query(MistakeRecord)
        .filter(MistakeRecord.student_id == args.student_id)
        .order_by(MistakeRecord.created_at.desc())
        .limit(8)
        .all()
    )
    return {
        "count": len(rows),
        "mistakes": [
            {"id": row.id, "topic": row.topic, "status": row.status, "content_preview": (row.content or "")[:120]}
            for row in rows
        ],
    }


def get_student_mastery(db: Session, user: User, args: ToolArgs, llm_config: LLMConfig) -> dict:
    if args.student_id is None:
        return {"weak_points": [], "mastered_points": []}
    _owned_student(db, user.id, args.student_id)
    pending = db.query(MistakeRecord).filter(MistakeRecord.student_id == args.student_id, MistakeRecord.status == "pending").all()
    mastered = db.query(MistakeRecord).filter(MistakeRecord.student_id == args.student_id, MistakeRecord.status == "mastered").all()
    weak = set().union(*(split_topics(row.topic) for row in pending)) if pending else set()
    mastered_points = set().union(*(split_topics(row.topic) for row in mastered)) if mastered else set()
    return {"weak_points": sorted(weak), "mastered_points": sorted(mastered_points - weak)}


def get_student_trend(db: Session, user: User, args: ToolArgs, llm_config: LLMConfig) -> dict:
    if args.student_id is None:
        return {"new_mistakes": 0, "mastered": 0}
    _owned_student(db, user.id, args.student_id)
    return {
        "new_mistakes": db.query(func.count(MistakeRecord.id)).filter(MistakeRecord.student_id == args.student_id).scalar() or 0,
        "mastered": db.query(func.count(MistakeRecord.id)).filter(
            MistakeRecord.student_id == args.student_id,
            MistakeRecord.status == "mastered",
        ).scalar()
        or 0,
    }


def get_teacher_schedule(db: Session, user: User, args: ToolArgs, llm_config: LLMConfig) -> dict:
    rows = db.query(Schedule).filter(Schedule.user_id == user.id).order_by(Schedule.schedule_date.desc()).limit(10).all()
    return {
        "count": len(rows),
        "items": [
            {
                "student_id": row.student_id,
                "date": row.schedule_date.isoformat(),
                "start_time": row.start_time,
                "end_time": row.end_time,
                "subject": row.subject,
            }
            for row in rows
        ],
    }


def search_owned_rag(db: Session, user: User, args: ToolArgs, llm_config: LLMConfig) -> dict:
    sub = get_current_subscription(user, db)
    require_feature(sub, "rag", user)
    query = (args.query or args.knowledge_point or "").strip()
    if not query:
        return {"context": "", "sources": [], "warning": "No RAG query was provided."}
    from app.services.rag_service import get_rag_service

    context, sources = get_rag_service(llm_config).search_context_for_chat_with_sources_owned(
        user.id, query, knowledge_point=args.knowledge_point, n_results=RAG_TOP_K
    )
    return {"context_preview": context[:800], "sources": sources[:5]}


def summarize_available_context(db: Session, user: User, args: ToolArgs, llm_config: LLMConfig) -> dict:
    return {"summary": "Read-only context was summarized from owned students, mistakes, schedule, and optional RAG."}


TOOL_REGISTRY: dict[str, ToolDefinition] = {
    "list_owned_students": ToolDefinition("list_owned_students", "List current teacher's students", "LOW", ToolArgs, list_owned_students),
    "get_owned_student_profile": ToolDefinition("get_owned_student_profile", "Get one owned student profile", "LOW", ToolArgs, get_owned_student_profile),
    "get_student_weak_points": ToolDefinition("get_student_weak_points", "Summarize weak knowledge points", "LOW", ToolArgs, get_student_weak_points),
    "get_student_recent_mistakes": ToolDefinition("get_student_recent_mistakes", "Summarize recent mistakes", "LOW", ToolArgs, get_student_recent_mistakes),
    "get_student_mastery": ToolDefinition("get_student_mastery", "Summarize mastery", "LOW", ToolArgs, get_student_mastery),
    "get_student_trend": ToolDefinition("get_student_trend", "Summarize learning trend", "LOW", ToolArgs, get_student_trend),
    "get_teacher_schedule": ToolDefinition("get_teacher_schedule", "Read current teacher schedule", "LOW", ToolArgs, get_teacher_schedule),
    "search_owned_rag": ToolDefinition("search_owned_rag", "Search current teacher RAG", "LOW", ToolArgs, search_owned_rag),
    "summarize_available_context": ToolDefinition("summarize_available_context", "Summarize collected context", "LOW", ToolArgs, summarize_available_context),
}

FORBIDDEN_TOOL_NAMES = {
    "save_question",
    "create_exam",
    "update_exam",
    "delete_exam",
    "publish_exam",
    "create_schedule",
    "update_student",
    "delete_student",
    "build_pptx",
    "create_order",
    "update_subscription",
    "execute_sql",
    "write_file",
}


def execute_tool(db: Session, user: User, name: str, raw_args: dict, llm_config: LLMConfig) -> tuple[AgentToolCallLog, dict | None]:
    start = time.perf_counter()
    safe_args = {k: v for k, v in (raw_args or {}).items() if k in ToolArgs.model_fields}
    if name in FORBIDDEN_TOOL_NAMES or name not in TOOL_REGISTRY:
        return (
            AgentToolCallLog(
                tool_name=name,
                status="failed",
                safe_arguments=safe_args,
                duration_ms=0,
                error_code="tool_not_allowed",
                error_message="Tool is not allowed in read-only mode.",
            ),
            None,
        )
    tool = TOOL_REGISTRY[name]
    if tool.risk_level != "LOW":
        return (
            AgentToolCallLog(
                tool_name=name,
                status="failed",
                safe_arguments=safe_args,
                duration_ms=0,
                error_code="risk_not_allowed",
                error_message="Only LOW risk tools are allowed.",
            ),
            None,
        )
    try:
        args = tool.input_schema.model_validate(safe_args)
        result = tool.executor(db, user, args, llm_config)
        duration = int((time.perf_counter() - start) * 1000)
        return (
            AgentToolCallLog(
                tool_name=name,
                status="success",
                safe_arguments=args.model_dump(exclude_none=True),
                result_summary=_sanitize_result(result),
                duration_ms=duration,
            ),
            result,
        )
    except HTTPException as exc:
        duration = int((time.perf_counter() - start) * 1000)
        return (
            AgentToolCallLog(
                tool_name=name,
                status="failed",
                safe_arguments=safe_args,
                duration_ms=duration,
                error_code=str(exc.status_code),
                error_message=str(exc.detail)[:160],
            ),
            None,
        )
    except Exception:
        duration = int((time.perf_counter() - start) * 1000)
        return (
            AgentToolCallLog(
                tool_name=name,
                status="failed",
                safe_arguments=safe_args,
                duration_ms=duration,
                error_code="tool_error",
                error_message="Tool execution failed.",
            ),
            None,
        )


def _sanitize_result(result: dict | str | None) -> dict | str | None:
    if result is None:
        return None
    if isinstance(result, str):
        return result[:500]
    cleaned = {}
    for key, value in result.items():
        if key in {"api_key", "authorization", "hashed_password", "login_code"}:
            continue
        if isinstance(value, str):
            cleaned[key] = value[:500]
        elif isinstance(value, list):
            cleaned[key] = value[:10]
        else:
            cleaned[key] = value
    return cleaned
