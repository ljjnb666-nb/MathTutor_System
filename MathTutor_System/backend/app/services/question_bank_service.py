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
    for item in questions:
        require_student_owned_if_set(db, item.student_id, current_user)
        validate_bank_item(item)

    rows: list[QuestionBank] = []
    for item in questions:
        ch = content_hash(item.content, item.answer)
        if dedupe:
            existing = (
                db.query(QuestionBank)
                .filter(
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
