"""Deterministic validation for practice-set drafts."""
from __future__ import annotations

from collections import Counter
from difflib import SequenceMatcher

from app.schemas.practice_draft_dto import PracticeDraftCreate, PracticeSetDraft

ALLOWED_TYPES = {"choice", "fill", "solution", "true_false", "选择", "填空", "解答", "判断"}
ALLOWED_DIFFICULTIES = {"easy", "medium", "hard", "L1", "L2", "L3", "L4", "L5"}
ALLOWED_SOURCE_BASIS = {
    "teacher_goal",
    "agent_run_intent",
    "student_profile",
    "weak_point",
    "recent_mistake",
    "mastery",
    "learning_trend",
    "owned_knowledge_base",
    "teacher_edit",
}
BAD_TEXT_MARKERS = {
    "api_key",
    "authorization",
    "system prompt",
    "developer message",
    "tool call",
    "execute_sql",
    "write_file",
    "create_exam",
    "publish_exam",
    "saved to question bank",
    "already saved",
    "完整RAG",
    "完整 Prompt",
    "已经保存到题库",
    "已保存到题库",
}
INVALID_FILL_ANSWERS = {"略", "见解析", "参考解析", "答案略"}
TRUE_FALSE_ANSWERS = {"true", "false", "正确", "错误", "对", "错", "是", "否"}


def validate_practice_draft(draft: PracticeSetDraft, request: PracticeDraftCreate | None = None) -> dict:
    errors: list[dict] = []
    warnings: list[dict] = []
    questions = list(draft.questions or [])
    if request and len(questions) != request.question_count:
        errors.append({"code": "question_count_mismatch", "message": "Question count does not match request."})
    if draft.safety_mode != "draft_only":
        errors.append({"code": "unsafe_safety_mode", "message": "Practice draft must remain draft_only."})
    available_sources = {"teacher_goal", "agent_run_intent", "teacher_edit"}
    if request:
        if request.student_id is not None:
            available_sources.add("student_profile")
        if request.student_id is not None and request.use_student_context:
            available_sources.update({"weak_point", "recent_mistake", "mastery", "learning_trend"})
        if request.use_knowledge_base:
            available_sources.add("owned_knowledge_base")

    ids = [q.client_question_id for q in questions]
    for qid, count in Counter(ids).items():
        if count > 1:
            errors.append({"code": "duplicate_client_question_id", "message": f"Duplicate client question id: {qid}"})

    stems: list[str] = []
    requested_kps = set(request.knowledge_points if request else [])
    covered_kps: set[str] = set()
    difficulties = Counter()
    total_score = 0.0
    for index, question in enumerate(questions):
        prefix = f"questions[{index}]"
        stem = (question.stem or "").strip()
        if not stem:
            errors.append({"code": "empty_stem", "path": prefix, "message": "Question stem cannot be empty."})
        if len(stem) > 3000:
            errors.append({"code": "stem_too_long", "path": prefix, "message": "Question stem is too long."})
        if question.question_type not in ALLOWED_TYPES:
            errors.append({"code": "invalid_question_type", "path": prefix, "message": "Question type is not allowed."})
        if question.difficulty not in ALLOWED_DIFFICULTIES:
            errors.append({"code": "invalid_difficulty", "path": prefix, "message": "Difficulty is not allowed."})
        for source in question.source_basis:
            if source not in ALLOWED_SOURCE_BASIS:
                errors.append({"code": "invalid_source_basis", "path": prefix, "message": f"Source basis is not allowed: {source}"})
            elif source not in available_sources:
                errors.append({"code": "unavailable_source_basis", "path": prefix, "message": f"Source basis was not available: {source}"})
        if question.score <= 0:
            errors.append({"code": "invalid_score", "path": prefix, "message": "Score must be greater than zero."})
        if not question.knowledge_points:
            errors.append({"code": "missing_knowledge_points", "path": prefix, "message": "Knowledge points cannot be empty."})
        if not (question.answer or "").strip():
            errors.append({"code": "empty_answer", "path": prefix, "message": "Answer cannot be empty."})
        if not (question.explanation or "").strip():
            errors.append({"code": "empty_explanation", "path": prefix, "message": "Explanation cannot be empty."})
        if _contains_bad_text(" ".join([stem, question.answer, question.explanation, " ".join(question.source_basis)])):
            errors.append({"code": "unsafe_text", "path": prefix, "message": "Question contains unsafe internal or completed-write text."})

        if question.question_type in {"choice", "选择"}:
            opts = [str(opt or "").strip() for opt in question.options]
            if len(opts) < 2 or len(opts) > 6:
                errors.append({"code": "invalid_choice_option_count", "path": prefix, "message": "Choice questions need 2-6 options."})
            if len(set(opts)) != len(opts):
                errors.append({"code": "duplicate_choice_options", "path": prefix, "message": "Choice options cannot repeat."})
            labels = {chr(ord("A") + i) for i in range(len(opts))}
            normalized_answer = question.answer.strip().upper().rstrip(".:：、").strip()
            if question.answer.strip() not in opts and normalized_answer not in labels:
                errors.append({"code": "invalid_choice_answer", "path": prefix, "message": "Choice answer must match an option or valid option label."})
        if question.question_type in {"fill", "填空"} and question.answer.strip() in INVALID_FILL_ANSWERS:
            errors.append({"code": "invalid_fill_answer", "path": prefix, "message": "Fill answer is not specific."})
        if question.question_type in {"true_false", "判断"} and question.answer.strip().lower() not in TRUE_FALSE_ANSWERS:
            errors.append({"code": "invalid_true_false_answer", "path": prefix, "message": "True/false answer is invalid."})

        for previous in stems:
            ratio = SequenceMatcher(None, previous, stem).ratio()
            if previous == stem:
                errors.append({"code": "duplicate_stem", "path": prefix, "message": "Duplicate question stem."})
            elif ratio >= 0.92:
                warnings.append({"code": "similar_stem", "path": prefix, "message": "Question stem is highly similar to another item."})
        stems.append(stem)
        covered_kps.update(question.knowledge_points)
        difficulties[question.difficulty] += 1
        total_score += float(question.score)

    if request and requested_kps and not requested_kps.intersection(covered_kps):
        errors.append({"code": "knowledge_points_not_covered", "message": "Requested knowledge points are not covered."})
    if not draft.knowledge_points and not covered_kps:
        errors.append({"code": "empty_set_knowledge_points", "message": "Practice set knowledge points cannot be empty."})
    if _contains_bad_text(" ".join([draft.title, draft.summary, " ".join(draft.warnings)])):
        errors.append({"code": "unsafe_set_text", "message": "Practice set contains unsafe internal or completed-write text."})
    if request and request.difficulty != "mixed":
        mismatched = [key for key in difficulties if key != request.difficulty]
        if mismatched and request.difficulty in {"easy", "medium", "hard"}:
            warnings.append({"code": "difficulty_distribution_mismatch", "message": "Difficulty distribution differs from request."})

    return {
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
        "question_count": len(questions),
        "total_score": total_score,
        "difficulty_distribution": dict(difficulties),
        "knowledge_points": sorted(covered_kps),
    }


def _contains_bad_text(text: str) -> bool:
    lowered = (text or "").lower()
    return any(marker.lower() in lowered for marker in BAD_TEXT_MARKERS)
