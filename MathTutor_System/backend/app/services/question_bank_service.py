"""Shared question-bank persistence logic."""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.question_bank import QuestionBank
from app.models.student import Student
from app.models.user import User
from app.schemas.question_bank_dto import BankCollectRequest

QUESTION_TYPE_TO_BANK = {
    "choice": "选择",
    "fill": "填空",
    "solution": "解答",
    "true_false": "判断",
}
DIFFICULTY_TO_BANK = {
    "easy": "L2",
    "medium": "L3",
    "hard": "L4",
}


@dataclass
class SaveQuestionToBankItem:
    content: str
    options: list[str] = field(default_factory=list)
    answer: str = ""
    analysis: str = ""
    question_type: str = "综合"
    difficulty: str = "L3"
    knowledge_point: str = "综合"
    source: str = "TeacherAgent"
    student_id: int | None = None
    tags: list[str] = field(default_factory=list)
    images: list[str] = field(default_factory=list)


def content_hash(content: str, answer: str) -> str:
    normalized = (content or "").strip().replace("\r\n", "\n").replace("\r", "\n")
    normalized += "|" + (answer or "").strip()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def normalize_images(raw: object) -> list[str]:
    if isinstance(raw, list):
        return [x for x in raw if isinstance(x, str)]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return normalize_images(parsed)
        except (TypeError, ValueError):
            return []
    return []


def require_student_owned_if_set(db: Session, student_id: int | None, current_user: User) -> None:
    if student_id is None:
        return
    student = db.get(Student, student_id)
    if student is None or student.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Student not found")


def validate_bank_item(item: SaveQuestionToBankItem) -> None:
    if not item.content.strip():
        raise HTTPException(status_code=400, detail="Question content cannot be empty")
    if not item.answer.strip():
        raise HTTPException(status_code=400, detail="Question answer cannot be empty")
    if not item.knowledge_point.strip():
        raise HTTPException(status_code=400, detail="Knowledge point cannot be empty")
    if not item.question_type.strip():
        raise HTTPException(status_code=400, detail="Question type cannot be empty")
    if not item.difficulty.strip():
        raise HTTPException(status_code=400, detail="Difficulty cannot be empty")
    if item.difficulty.strip() == "mixed":
        raise HTTPException(status_code=400, detail="Single question difficulty cannot be mixed")
    if _normalize_question_type(item.question_type) in {"choice", "选择"}:
        _normalize_choice_answer(item.options, item.answer)


def _normalize_question_type(value: str) -> str:
    text = (value or "").strip()
    return QUESTION_TYPE_TO_BANK.get(text, text)


def _normalize_difficulty(value: str) -> str:
    text = (value or "").strip()
    return DIFFICULTY_TO_BANK.get(text, text)


def _option_label(index: int) -> str:
    return chr(ord("A") + index)


def _strip_label(value: str) -> str:
    text = (value or "").strip()
    if len(text) >= 2 and text[0].upper() in "ABCDEFGHIJKLMNOPQRSTUVWXYZ" and text[1] in {".", ":", "：", "、"}:
        return text[2:].strip()
    return text


def _normalize_choice_answer(options: list[str], answer: str) -> str:
    opts = [str(opt or "").strip() for opt in options or []]
    ans = (answer or "").strip()
    labels = [_option_label(i) for i in range(len(opts))]
    upper = ans.upper().rstrip(".:：、").strip()
    if upper in labels:
        return upper
    for index, opt in enumerate(opts):
        if ans == opt or _strip_label(ans) == _strip_label(opt):
            return _option_label(index)
    raise HTTPException(status_code=400, detail="Choice answer does not match available options")


def normalize_bank_item(item: SaveQuestionToBankItem) -> SaveQuestionToBankItem:
    question_type = _normalize_question_type(item.question_type)
    difficulty = _normalize_difficulty(item.difficulty)
    answer = item.answer.strip()
    if question_type == "选择":
        answer = _normalize_choice_answer(item.options, answer)
    return SaveQuestionToBankItem(
        content=item.content,
        options=item.options,
        answer=answer,
        analysis=item.analysis,
        question_type=question_type,
        difficulty=difficulty,
        knowledge_point=item.knowledge_point,
        source=item.source,
        student_id=item.student_id,
        tags=item.tags,
        images=item.images,
    )


def item_from_collect_request(body: BankCollectRequest) -> SaveQuestionToBankItem:
    return SaveQuestionToBankItem(
        content=body.content,
        options=body.options if isinstance(body.options, list) else [],
        answer=body.answer,
        analysis=body.analysis or "",
        question_type=body.question_type,
        difficulty=body.difficulty,
        knowledge_point=body.knowledge_point,
        source=body.source,
        student_id=body.student_id,
        tags=body.tags if isinstance(body.tags, list) else [],
        images=body.images if isinstance(body.images, list) else [],
    )


def save_questions_to_bank(
    db: Session,
    current_user: User,
    questions: list[SaveQuestionToBankItem],
    *,
    dedupe: bool = True,
) -> list[QuestionBank]:
    if current_user.role not in {"teacher", "admin"}:
        raise HTTPException(status_code=403, detail="Teacher role required")
    normalized_questions = [normalize_bank_item(item) for item in questions]
    for item in normalized_questions:
        require_student_owned_if_set(db, item.student_id, current_user)
        validate_bank_item(item)

    rows: list[QuestionBank] = []
    for item in normalized_questions:
        ch = content_hash(item.content, item.answer)
        if dedupe:
            existing = (
                db.query(QuestionBank)
                .filter(
                    QuestionBank.owner_user_id == current_user.id,
                    QuestionBank.content_hash == ch,
                    (QuestionBank.student_id == item.student_id)
                    if item.student_id is not None
                    else QuestionBank.student_id.is_(None),
                )
                .first()
            )
            if existing is not None:
                rows.append(existing)
                continue
        row = QuestionBank(
            owner_user_id=current_user.id,
            student_id=item.student_id,
            content=item.content.strip(),
            options=item.options if isinstance(item.options, list) else [],
            answer=item.answer.strip(),
            analysis=(item.analysis or "").strip(),
            question_type=item.question_type.strip(),
            difficulty=item.difficulty.strip(),
            knowledge_point=item.knowledge_point.strip(),
            source=item.source.strip() or "TeacherAgent",
            tags=item.tags if isinstance(item.tags, list) else [],
            images=item.images if isinstance(item.images, list) else [],
            content_hash=ch,
        )
        db.add(row)
        rows.append(row)
    db.flush()
    return rows
