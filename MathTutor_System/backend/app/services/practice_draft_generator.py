"""Practice draft generation for Teacher Agent artifacts."""
from __future__ import annotations

import json
from typing import Protocol

from app.core.deps import LLMConfig
from app.schemas.practice_draft_dto import PracticeDraftCreate, PracticeQuestionDraft, PracticeSetDraft
from app.services.llm_client_service import call_llm_async
from app.services.question_json_parser import (
    escape_literal_newlines_in_json,
    extract_first_json_object,
    fix_json_invalid_escapes,
    strip_json_markdown,
    try_repair_single_json_object,
)


class PracticeDraftGenerator(Protocol):
    async def generate(
        self,
        *,
        teacher_goal: str,
        intent: dict,
        request: PracticeDraftCreate,
        context_summary: dict,
        llm_config: LLMConfig,
    ) -> PracticeSetDraft:
        ...


class LLMPracticeDraftGenerator:
    max_attempts = 3

    async def generate(
        self,
        *,
        teacher_goal: str,
        intent: dict,
        request: PracticeDraftCreate,
        context_summary: dict,
        llm_config: LLMConfig,
    ) -> PracticeSetDraft:
        if not (llm_config.api_key or "").strip():
            raise ValueError("LLM API key is required for practice draft generation.")
        last_error = "Unknown generation error"
        for _ in range(self.max_attempts):
            raw = await call_llm_async(
                _build_prompt(teacher_goal, intent, request, context_summary),
                llm_config,
                temperature=0.5,
                max_tokens=12000,
            )
            try:
                return PracticeSetDraft.model_validate(_parse_json_object(raw))
            except Exception as exc:
                last_error = str(exc)[:300]
        raise ValueError(f"Practice draft generation failed validation after retries: {last_error}")


class DeterministicFakePracticeDraftGenerator:
    async def generate(
        self,
        *,
        teacher_goal: str,
        intent: dict,
        request: PracticeDraftCreate,
        context_summary: dict,
        llm_config: LLMConfig,
    ) -> PracticeSetDraft:
        kps = request.knowledge_points or intent.get("knowledge_points") or ["linear functions"]
        qtypes = request.question_types or ["choice"]
        questions = []
        for i in range(request.question_count):
            qtype = qtypes[i % len(qtypes)]
            options = [f"Option {label} for item {i + 1}" for label in ["A", "B", "C", "D"]] if qtype in {"choice", "选择"} else []
            answer = options[1] if options else ("true" if qtype in {"true_false", "判断"} else f"Answer {i + 1}")
            questions.append(
                PracticeQuestionDraft(
                    client_question_id=f"q-{i + 1}",
                    question_type=qtype,
                    stem=f"{teacher_goal[:80]} practice question {i + 1} about {kps[i % len(kps)]}.",
                    options=options,
                    answer=answer,
                    explanation=f"Explanation for question {i + 1}.",
                    knowledge_points=[kps[i % len(kps)]],
                    difficulty=request.difficulty if request.difficulty != "mixed" else "medium",
                    score=10,
                    source_basis=["teacher_goal", "owned_context"],
                )
            )
        return PracticeSetDraft(
            title="Teacher Agent Practice Draft",
            summary="Deterministic practice draft for tests and local mock flows.",
            grade=str(intent.get("grade") or ""),
            student_summary=(context_summary.get("student") or {}).get("summary"),
            knowledge_points=kps,
            difficulty_distribution={request.difficulty: request.question_count},
            questions=questions,
            warnings=[],
            safety_mode="draft_only",
        )


def _build_prompt(teacher_goal: str, intent: dict, request: PracticeDraftCreate, context_summary: dict) -> str:
    schema_hint = {
        "title": "string",
        "summary": "string",
        "grade": "string or null",
        "student_summary": "short summary or null",
        "knowledge_points": ["string"],
        "difficulty_distribution": {"medium": 5},
        "questions": [
            {
                "client_question_id": "stable-id",
                "question_type": "choice|fill|solution|true_false",
                "stem": "question stem",
                "options": ["A", "B", "C", "D"],
                "answer": "answer text",
                "explanation": "solution explanation",
                "knowledge_points": ["string"],
                "difficulty": "easy|medium|hard|L1|L2|L3|L4|L5",
                "score": 10,
                "source_basis": ["teacher_goal", "weak_point", "recent_mistake", "owned_knowledge_base"],
            }
        ],
        "warnings": [],
        "safety_mode": "draft_only",
    }
    return (
        "Generate a draft-only middle-school math practice set. "
        "Do not claim the questions are saved. Do not include prompts, API keys, raw RAG text, SQL, file paths, or other teachers' data.\n"
        f"Teacher goal: {teacher_goal[:1000]}\n"
        f"Intent: {json.dumps(intent, ensure_ascii=False)[:1500]}\n"
        f"Request: {request.model_dump_json()}\n"
        f"Safe context summary: {json.dumps(context_summary, ensure_ascii=False)[:2000]}\n"
        f"Output JSON schema shape: {json.dumps(schema_hint, ensure_ascii=False)}"
    )


def _parse_json_object(raw: str) -> dict:
    cleaned = strip_json_markdown(raw or "")
    if not cleaned.strip():
        cleaned = raw or ""
    cleaned = escape_literal_newlines_in_json(cleaned)
    cleaned = fix_json_invalid_escapes(cleaned)
    attempts = [cleaned]
    extracted = extract_first_json_object(cleaned)
    if extracted:
        attempts.append(extracted)
    repaired = try_repair_single_json_object(cleaned)
    if repaired:
        attempts.append(repaired)
    for item in attempts:
        try:
            parsed = json.loads(item)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            continue
    raise ValueError("Model response did not contain a valid JSON object.")
