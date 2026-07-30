"""Controlled LangGraph workflow for the read-only Teacher Agent."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import TypedDict

from fastapi import HTTPException
from langgraph.graph import END, START, StateGraph
from sqlalchemy.orm import Session

from app.core.deps import LLMConfig
from app.models.agent_run import AgentRun
from app.models.student import Student
from app.models.user import User
from app.schemas.agent_dto import (
    AgentToolCallLog,
    TeacherAgentPlan,
    TeacherAgentPlanStep,
    TeacherAgentRunCreate,
    TeacherIntent,
)
from app.services.agent_tool_registry import MAX_TOOL_CALLS_PER_RUN, execute_tool


class AgentState(TypedDict, total=False):
    run_id: int
    db: Session
    request: TeacherAgentRunCreate
    user: User
    llm_config: LLMConfig
    intent: TeacherIntent
    selected_tools: list[dict]
    tool_results: dict
    tool_logs: list[AgentToolCallLog]
    plan: TeacherAgentPlan
    missing_fields: list[dict]
    warnings: list[str]
    error_code: str
    error_message: str


READ_ONLY_WARNING = "Current version is read-only. It creates a teaching plan only and performs no business writes."


def create_agent_run(db: Session, user: User, request: TeacherAgentRunCreate) -> AgentRun:
    row = AgentRun(user_id=user.id, goal=request.goal, status="created")
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_agent_runs(db: Session, user: User, limit: int = 20) -> list[AgentRun]:
    safe_limit = max(1, min(limit, 50))
    return (
        db.query(AgentRun)
        .filter(AgentRun.user_id == user.id)
        .order_by(AgentRun.created_at.desc())
        .limit(safe_limit)
        .all()
    )


def get_agent_run_or_404(db: Session, user: User, run_id: int) -> AgentRun:
    row = db.get(AgentRun, run_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Agent run not found")
    return row


def run_teacher_agent(
    db: Session,
    user: User,
    request: TeacherAgentRunCreate,
    llm_config: LLMConfig,
) -> AgentRun:
    row = create_agent_run(db, user, request)
    graph = _build_graph()
    try:
        row.status = "running"
        db.commit()
        state = graph.invoke({"run_id": row.id, "db": db, "request": request, "user": user, "llm_config": llm_config})
        row = db.get(AgentRun, row.id)
        if state.get("error_code"):
            _persist_failed(db, row, state["error_code"], state.get("error_message") or "Agent failed")
        elif state.get("missing_fields"):
            _persist_needs_input(db, row, state)
        else:
            _persist_completed(db, row, state)
        db.refresh(row)
        return row
    except Exception as exc:
        row = db.get(AgentRun, row.id)
        _persist_failed(db, row, "workflow_error", str(exc)[:240])
        db.refresh(row)
        return row


def _build_graph():
    workflow = StateGraph(AgentState)
    workflow.add_node("validate_request", _validate_request)
    workflow.add_node("extract_structured_intent", _extract_structured_intent)
    workflow.add_node("resolve_student_context", _resolve_student_context)
    workflow.add_node("select_allowed_read_tools", _select_allowed_read_tools)
    workflow.add_node("execute_read_tools", _execute_read_tools)
    workflow.add_node("compose_structured_plan", _compose_structured_plan)
    workflow.add_node("validate_plan", _validate_plan)
    workflow.add_edge(START, "validate_request")
    workflow.add_edge("validate_request", "extract_structured_intent")
    workflow.add_edge("extract_structured_intent", "resolve_student_context")
    workflow.add_edge("resolve_student_context", "select_allowed_read_tools")
    workflow.add_edge("select_allowed_read_tools", "execute_read_tools")
    workflow.add_edge("execute_read_tools", "compose_structured_plan")
    workflow.add_edge("compose_structured_plan", "validate_plan")
    workflow.add_edge("validate_plan", END)
    return workflow.compile()


def _validate_request(state: AgentState) -> AgentState:
    req = state["request"]
    if not req.goal.strip():
        state["missing_fields"] = [{"field": "goal", "message": "Please describe the teaching goal."}]
    return state


def _extract_structured_intent(state: AgentState) -> AgentState:
    req = state["request"]
    goal = req.goal.lower()
    intent_type = "general_teaching"
    if any(word in goal for word in ["review", "复习", "錯", "错题"]):
        intent_type = "review_plan"
    elif any(word in goal for word in ["practice", "练习"]):
        intent_type = "practice_plan"
    elif any(word in goal for word in ["exam", "试卷", "考试"]):
        intent_type = "exam_preparation_plan"
    elif any(word in goal for word in ["analysis", "分析", "薄弱"]):
        intent_type = "student_analysis"
    elif any(word in goal for word in ["lesson", "备课", "导入课"]):
        intent_type = "lesson_preparation"
    needs_student = req.student_id is not None or any(word in goal for word in ["student", "学生", "错题", "薄弱"])
    knowledge_points = [req.knowledge_point.strip()] if req.knowledge_point and req.knowledge_point.strip() else []
    if "函数" in req.goal and "函数" not in knowledge_points:
        knowledge_points.append("函数")
    if "勾股" in req.goal and "勾股定理" not in knowledge_points:
        knowledge_points.append("勾股定理")
    state["intent"] = TeacherIntent(
        intent_type=intent_type,
        knowledge_points=knowledge_points,
        requested_outputs=["teaching_plan"],
        requires_student_context=needs_student,
        requires_rag=req.use_knowledge_base,
    )
    return state


def _resolve_student_context(state: AgentState) -> AgentState:
    db = _db_from_state(state)
    req = state["request"]
    user = state["user"]
    intent = state["intent"]
    missing = list(state.get("missing_fields") or [])
    if req.student_id is not None:
        row = db.get(Student, req.student_id)
        if row is None or row.user_id != user.id:
            state["error_code"] = "student_not_found"
            state["error_message"] = "Student not found"
            return state
    elif intent.requires_student_context:
        matches = []
        for row in db.query(Student).filter(Student.user_id == user.id).all():
            if row.name and row.name in req.goal:
                matches.append(row)
        if len(matches) == 1:
            req.student_id = matches[0].id
        elif len(matches) > 1:
            missing.append({"field": "student_id", "message": "Multiple students match. Please choose one."})
        else:
            missing.append({"field": "student_id", "message": "Please choose a student for student-specific analysis."})
    state["missing_fields"] = missing
    return state


def _select_allowed_read_tools(state: AgentState) -> AgentState:
    req = state["request"]
    if state.get("missing_fields") or state.get("error_code"):
        state["selected_tools"] = []
        return state
    tools = [{"name": "list_owned_students", "args": {}}]
    if req.student_id is not None:
        args = {"student_id": req.student_id, "knowledge_point": req.knowledge_point}
        tools.extend(
            [
                {"name": "get_owned_student_profile", "args": args},
                {"name": "get_student_weak_points", "args": args},
                {"name": "get_student_recent_mistakes", "args": args},
                {"name": "get_student_mastery", "args": args},
                {"name": "get_student_trend", "args": args},
            ]
        )
    tools.append({"name": "get_teacher_schedule", "args": {}})
    if req.use_knowledge_base:
        tools.append(
            {
                "name": "search_owned_rag",
                "args": {"query": req.goal, "knowledge_point": req.knowledge_point},
            }
        )
    tools.append({"name": "summarize_available_context", "args": {}})
    state["selected_tools"] = tools[:MAX_TOOL_CALLS_PER_RUN]
    return state


def _execute_read_tools(state: AgentState) -> AgentState:
    db = _db_from_state(state)
    logs: list[AgentToolCallLog] = []
    results = {}
    for item in state.get("selected_tools") or []:
        log, result = execute_tool(db, state["user"], item["name"], item.get("args") or {}, state["llm_config"])
        logs.append(log)
        if result is not None:
            results[item["name"]] = result
    state["tool_logs"] = logs
    state["tool_results"] = results
    return state


def _compose_structured_plan(state: AgentState) -> AgentState:
    req = state["request"]
    intent = state["intent"]
    results = state.get("tool_results") or {}
    warnings = [READ_ONLY_WARNING]
    if req.use_knowledge_base and "search_owned_rag" not in results:
        warnings.append("Knowledge base was requested but no owned RAG context was available or allowed.")
    if any(word in req.goal for word in ["发布", "删除", "购买", "支付", "扣费", "保存试卷"]):
        warnings.append("Requested write or payment action was not executed. This version only drafts a future plan.")
    weak = (results.get("get_student_weak_points") or {}).get("weak_points") or []
    mistakes_count = (results.get("get_student_recent_mistakes") or {}).get("count") or 0
    steps = [
        TeacherAgentPlanStep(
            step_id="1",
            title="Clarify objective",
            description=f"Plan around: {req.goal}",
            basis="Teacher request",
            future_action="Confirm concrete teaching objective before any future write workflow.",
        ),
        TeacherAgentPlanStep(
            step_id="2",
            title="Use available evidence",
            description=f"Use weak points {weak[:5]} and {mistakes_count} recent mistakes as planning evidence.",
            basis="Owned student data and read-only summaries",
            future_action="Generate draft materials in a future confirmed workflow.",
        ),
        TeacherAgentPlanStep(
            step_id="3",
            title="Draft teaching flow",
            description="Start with diagnosis, explain key misconception, practice two graduated examples, then assign review suggestions.",
            basis="Read-only agent synthesis",
            future_action="Teacher reviews and decides whether to create actual questions or assignments later.",
        ),
    ]
    state["warnings"] = warnings
    state["plan"] = TeacherAgentPlan(
        title="Read-only teaching plan",
        summary="A structured plan was generated without modifying business data.",
        intent_type=intent.intent_type,
        resolved_context={
            "student_id": req.student_id,
            "knowledge_point": req.knowledge_point,
            "use_knowledge_base": req.use_knowledge_base,
        },
        evidence_summary={
            "weak_points": weak[:10],
            "recent_mistake_count": mistakes_count,
            "rag_sources": (results.get("search_owned_rag") or {}).get("sources", []),
        },
        steps=steps,
        expected_outputs=["teaching_plan"],
        missing_fields=state.get("missing_fields") or [],
        warnings=warnings,
        safety_mode="read_only",
    )
    return state


def _validate_plan(state: AgentState) -> AgentState:
    if state.get("error_code") or state.get("missing_fields"):
        return state
    plan = state.get("plan")
    if plan is None:
        state["error_code"] = "plan_missing"
        state["error_message"] = "Plan was not generated."
        return state
    for log in state.get("tool_logs") or []:
        if log.risk_level != "LOW":
            state["error_code"] = "unsafe_tool"
            state["error_message"] = "Only LOW risk tools are allowed."
            return state
    return state


def _persist_completed(db: Session, row: AgentRun, state: AgentState) -> None:
    now = datetime.now(UTC).replace(tzinfo=None)
    row.status = "completed"
    row.intent_json = state["intent"].model_dump()
    row.context_snapshot_json = _context_snapshot(state)
    row.selected_tools_json = state.get("selected_tools") or []
    row.tool_calls_json = [log.model_dump() for log in state.get("tool_logs") or []]
    row.plan_json = state["plan"].model_dump()
    row.missing_fields_json = []
    row.warnings_json = state.get("warnings") or []
    row.completed_at = now
    db.commit()


def _persist_needs_input(db: Session, row: AgentRun, state: AgentState) -> None:
    now = datetime.now(UTC).replace(tzinfo=None)
    row.status = "needs_input"
    row.intent_json = state.get("intent").model_dump() if state.get("intent") else {}
    row.context_snapshot_json = _context_snapshot(state)
    row.selected_tools_json = []
    row.tool_calls_json = []
    row.missing_fields_json = state.get("missing_fields") or []
    row.warnings_json = [READ_ONLY_WARNING]
    row.completed_at = now
    db.commit()


def _persist_failed(db: Session, row: AgentRun, code: str, message: str) -> None:
    row.status = "failed"
    row.error_code = code[:64]
    row.error_message = _sanitize_text(message, 300)
    row.completed_at = datetime.now(UTC).replace(tzinfo=None)
    db.commit()


def _context_snapshot(state: AgentState) -> dict:
    req = state["request"]
    return {
        "student_id": req.student_id,
        "knowledge_point": req.knowledge_point,
        "use_knowledge_base": req.use_knowledge_base,
    }


def _sanitize_text(value: str, max_len: int) -> str:
    blocked = ["x-llm-api-key", "authorization", "api_key", "hashed_password", "login_code"]
    cleaned = value or ""
    for key in blocked:
        cleaned = cleaned.replace(key, "[redacted]")
    return cleaned[:max_len]


def _db_from_state(state: AgentState) -> Session:
    # The synchronous endpoint owns the DB session lifetime; LangGraph only passes it through.
    return state["db"]  # type: ignore[index]
