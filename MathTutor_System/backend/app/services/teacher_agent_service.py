"""Controlled LangGraph workflow for the read-only Teacher Agent."""
from __future__ import annotations

import asyncio
import re
from datetime import UTC, datetime
from typing import TypedDict

from fastapi import HTTPException
from langgraph.graph import END, START, StateGraph
from sqlalchemy.orm import Session

from app.core.deps import LLMConfig
from app.models.agent_run import AgentRun
from app.models.student import Student
from app.models.user import User
from app.schemas.agent_dto import TeacherAgentPlan, TeacherAgentRunCreate, TeacherIntent
from app.services.agent_tool_registry import (
    MAX_TOOL_CALLS_PER_RUN,
    available_read_tools,
    execute_tool,
    validate_candidate_tools,
)
from app.services.teacher_agent_planner import LLMTeacherAgentPlanner, TeacherAgentPlanner


class AgentState(TypedDict, total=False):
    run_id: int
    db: Session
    request: TeacherAgentRunCreate
    user: User
    llm_config: LLMConfig
    planner: TeacherAgentPlanner
    intent: TeacherIntent
    selected_tools: list[dict]
    tool_results: dict
    tool_logs: list
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
    planner: TeacherAgentPlanner | None = None,
) -> AgentRun:
    row = create_agent_run(db, user, request)
    graph = _build_graph()
    try:
        row.status = "running"
        db.commit()
        state = graph.invoke(
            {
                "run_id": row.id,
                "db": db,
                "request": request,
                "user": user,
                "llm_config": llm_config,
                "planner": planner or LLMTeacherAgentPlanner(),
            }
        )
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
    workflow.add_node("validate_candidate_tools", _validate_candidate_tools)
    workflow.add_node("execute_read_tools", _execute_read_tools)
    workflow.add_node("compose_structured_plan", _compose_structured_plan)
    workflow.add_node("validate_plan", _validate_plan)
    workflow.add_edge(START, "validate_request")
    workflow.add_conditional_edges("validate_request", _continue_or_end, {"continue": "extract_structured_intent", "end": END})
    workflow.add_conditional_edges("extract_structured_intent", _continue_or_end, {"continue": "resolve_student_context", "end": END})
    workflow.add_conditional_edges("resolve_student_context", _continue_or_end, {"continue": "validate_candidate_tools", "end": END})
    workflow.add_conditional_edges("validate_candidate_tools", _continue_or_end, {"continue": "execute_read_tools", "end": END})
    workflow.add_edge("execute_read_tools", "compose_structured_plan")
    workflow.add_conditional_edges("compose_structured_plan", _continue_or_end, {"continue": "validate_plan", "end": END})
    workflow.add_edge("validate_plan", END)
    return workflow.compile()


def _validate_request(state: AgentState) -> AgentState:
    req = state["request"]
    if not req.goal.strip():
        state["missing_fields"] = [{"field": "goal", "message": "Please describe the teaching goal."}]
    return state


def _extract_structured_intent(state: AgentState) -> AgentState:
    try:
        intent = _run_async(
            state["planner"].extract_intent(
                state["request"],
                available_read_tools(),
                state["llm_config"],
            )
        )
        state["intent"] = _sanitize_intent(intent, state["request"])
    except Exception as exc:
        state["error_code"] = "intent_extraction_failed"
        state["error_message"] = _sanitize_text(str(exc), 300)
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
            if row.name and (row.name in req.goal or row.name == intent.student_name):
                matches.append(row)
        if len(matches) == 1:
            req.student_id = matches[0].id
        elif len(matches) > 1:
            missing.append({"field": "student_id", "message": "Multiple students match. Please choose one."})
        else:
            missing.append({"field": "student_id", "message": "Please choose a student for student-specific analysis."})
    missing.extend(intent.missing_fields or [])
    state["missing_fields"] = _unique_missing(missing)
    return state


def _validate_candidate_tools(state: AgentState) -> AgentState:
    if state.get("missing_fields") or state.get("error_code"):
        state["selected_tools"] = []
        return state
    req = state["request"]
    intent = state["intent"]
    names = validate_candidate_tools(intent.candidate_tools, requires_rag=bool(intent.requires_rag or req.use_knowledge_base))
    state["selected_tools"] = [{"name": name, "args": _args_for_tool(name, req, intent)} for name in names[:MAX_TOOL_CALLS_PER_RUN]]
    return state


def _execute_read_tools(state: AgentState) -> AgentState:
    db = _db_from_state(state)
    logs = []
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
    if _looks_like_write_goal(req.goal):
        warnings.append("Requested write or payment action was not executed. This version only drafts a future plan.")
    try:
        plan = _run_async(
            state["planner"].compose_plan(
                req,
                intent,
                _sanitize_tool_results(results),
                state["llm_config"],
            )
        )
        plan.warnings = _dedupe([*(plan.warnings or []), *warnings])
        plan.safety_mode = "read_only"
        for step in plan.steps:
            step.requires_confirmation = False
        state["warnings"] = plan.warnings
        state["plan"] = plan
    except Exception as exc:
        state["error_code"] = "plan_composition_failed"
        state["error_message"] = _sanitize_text(str(exc), 300)
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
        if log.risk_level != "LOW" or log.error_code in {"tool_not_allowed", "risk_not_allowed"}:
            state["error_code"] = "unsafe_tool"
            state["error_message"] = "Only LOW risk tools are allowed."
            return state
    if plan.safety_mode != "read_only" or any(step.requires_confirmation for step in plan.steps):
        state["error_code"] = "unsafe_plan"
        state["error_message"] = "Plan failed read-only safety validation."
        return state
    if contains_completed_write_claim(plan):
        state["error_code"] = "unsafe_plan"
        state["error_message"] = "Plan contains a completed write action."
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


def _continue_or_end(state: AgentState) -> str:
    if state.get("error_code") or state.get("missing_fields"):
        return "end"
    return "continue"


def _sanitize_intent(intent: TeacherIntent, req: TeacherAgentRunCreate) -> TeacherIntent:
    data = intent.model_dump()
    data.pop("user_id", None)
    data.pop("owner_user_id", None)
    if req.knowledge_point and req.knowledge_point not in data.get("knowledge_points", []):
        data["knowledge_points"] = [*data.get("knowledge_points", []), req.knowledge_point]
    if req.use_knowledge_base:
        data["requires_rag"] = True
    return TeacherIntent.model_validate(data)


def _args_for_tool(name: str, req: TeacherAgentRunCreate, intent: TeacherIntent) -> dict:
    kp = req.knowledge_point or (intent.knowledge_points[0] if intent.knowledge_points else None)
    args: dict = {}
    if name in {
        "get_owned_student_profile",
        "get_student_weak_points",
        "get_student_recent_mistakes",
        "get_student_mastery",
        "get_student_trend",
    }:
        args["student_id"] = req.student_id
        args["knowledge_point"] = kp
    if name == "get_student_trend":
        args["weeks"] = 8
    if name == "search_owned_rag":
        args["query"] = req.goal
        args["knowledge_point"] = kp
    return {key: value for key, value in args.items() if value is not None}


def _sanitize_tool_results(results: dict) -> dict:
    cleaned = {}
    for name, value in (results or {}).items():
        cleaned[name] = _sanitize_value(value)
    return cleaned


def _sanitize_value(value):
    if isinstance(value, str):
        return _sanitize_text(value, 1000)
    if isinstance(value, list):
        return [_sanitize_value(item) for item in value[:20]]
    if isinstance(value, dict):
        return {
            key: _sanitize_value(val)
            for key, val in value.items()
            if key not in {"api_key", "authorization", "hashed_password", "login_code"}
        }
    return value


def _sanitize_text(value: str, max_len: int) -> str:
    blocked = ["x-llm-api-key", "authorization", "api_key", "hashed_password", "login_code"]
    cleaned = value or ""
    for key in blocked:
        cleaned = cleaned.replace(key, "[redacted]")
    return cleaned[:max_len]


def _dedupe(items: list[str]) -> list[str]:
    out = []
    for item in items:
        if item and item not in out:
            out.append(item)
    return out


def _unique_missing(items: list[dict]) -> list[dict]:
    seen = set()
    out = []
    for item in items:
        field = item.get("field")
        if field and field not in seen:
            seen.add(field)
            out.append(item)
    return out


def _looks_like_write_goal(goal: str) -> bool:
    lowered = (goal or "").lower()
    return any(word in lowered for word in ["publish", "delete", "pay", "charge", "save", "发布", "删除", "购买", "支付", "扣费", "保存试卷"])


def _run_async(coro):
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    raise RuntimeError("Teacher Agent synchronous runner cannot execute inside an active event loop.")


def _db_from_state(state: AgentState) -> Session:
    return state["db"]  # type: ignore[index]


def contains_completed_write_claim(plan: TeacherAgentPlan) -> bool:
    """Detect explicit claims that a write action has already completed."""
    text = " ".join(_plan_text_fields(plan)).lower()
    english_patterns = [
        r"\b(?:i|we)\s+have\s+(?:just\s+)?(?:created|saved|deleted|published|charged|paid|sent|updated)\b",
        r"\b(?:assistant|agent|system)\s+(?:has\s+)?(?:created|saved|deleted|published|charged|paid|sent|updated)\b",
        r"\b(?:the\s+)?(?:assistant|agent|system)\s+created\b.+\bfor\s+you\b",
        r"\b(?:exam|questions?|student|homework|assignment|notice|report|payment)\s+has\s+been\s+(?:created|saved|deleted|published|charged|paid|sent|updated|completed)\b",
        r"\bpayment\s+has\s+been\s+completed\b",
        r"\b(?:deleted|published|saved|sent|updated)\s+successfully\b",
    ]
    chinese_patterns = [
        r"(?:\u6211|\u7cfb\u7edf|\u52a9\u624b|agent|ai)\s*(?:\u5df2|\u5df2\u7ecf)\s*(?:\u4e3a\u4f60|\u4e3a\u60a8|\u4e3a\u8be5\u73ed)?\s*(?:\u521b\u5efa|\u751f\u6210\u5e76\u4fdd\u5b58|\u4fdd\u5b58|\u5220\u9664|\u53d1\u5e03|\u53d1\u9001|\u4fee\u6539|\u66f4\u65b0|\u652f\u4ed8|\u6263\u8d39|\u8d2d\u4e70)",
        r"(?:\u5df2|\u5df2\u7ecf)\s*\u4e3a(?:\u4f60|\u60a8|\u8be5\u73ed|.{0,12})\s*(?:\u521b\u5efa|\u751f\u6210\u5e76\u4fdd\u5b58|\u4fdd\u5b58|\u5220\u9664|\u53d1\u5e03|\u53d1\u9001|\u4fee\u6539|\u66f4\u65b0|\u6263\u8d39|\u8d2d\u4e70)",
        r"(?:\u8bd5\u5377|\u9898\u76ee|\u4f5c\u4e1a|\u901a\u77e5|\u5b66\u751f|\u6570\u636e|\u62a5\u544a)\s*(?:\u5df2|\u5df2\u7ecf)\s*(?:\u88ab)?\s*(?:\u521b\u5efa|\u751f\u6210\u5e76\u4fdd\u5b58|\u4fdd\u5b58|\u5220\u9664|\u53d1\u5e03|\u53d1\u9001|\u4fee\u6539|\u66f4\u65b0)",
        r"(?:\u5df2|\u5df2\u7ecf)\s*\u5b8c\u6210\s*(?:\u652f\u4ed8|\u6263\u8d39|\u8d2d\u4e70)",
        r"(?:\u5df2|\u5df2\u7ecf)\s*\u4ece.{0,12}\u6263\u8d39",
    ]
    return any(re.search(pattern, text) for pattern in english_patterns + chinese_patterns)


def _plan_text_fields(plan: TeacherAgentPlan) -> list[str]:
    fields = [plan.title, plan.summary, " ".join(plan.expected_outputs or []), " ".join(plan.warnings or [])]
    for step in plan.steps:
        fields.extend([step.title, step.description, step.basis])
    return [str(item or "") for item in fields]
