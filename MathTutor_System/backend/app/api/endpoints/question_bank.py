"""Question-bank collection, listing, and deletion endpoints."""
import json
import logging
import traceback

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.models.base import get_db
from app.models.question_bank import QuestionBank
from app.models.student import Student
from app.models.user import User
from app.schemas.question_bank_dto import BankCollectRequest, BankCollectResponse, BankItemRead
from app.services.question_bank_service import content_hash, item_from_collect_request, normalize_bank_item, save_questions_to_bank

logger = logging.getLogger(__name__)

router = APIRouter()


def _my_student_ids(db: Session, user: User) -> list[int]:
    rows = db.query(Student.id).filter(Student.user_id == user.id).all()
    return [r[0] for r in rows]


def _bank_visible_filter(current_user: User):
    return or_(QuestionBank.owner_user_id == current_user.id, QuestionBank.owner_user_id.is_(None))


def _student_scope_filter(student_id: int):
    return or_(QuestionBank.student_id == student_id, QuestionBank.student_id.is_(None))


def _normalize_images(raw: object) -> list:
    if isinstance(raw, list):
        return [x for x in raw if isinstance(x, str)]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return _normalize_images(parsed)
        except (TypeError, ValueError):
            return []
    return []


def _read_item(row: QuestionBank) -> BankItemRead:
    return BankItemRead(
        id=row.id,
        owner_user_id=row.owner_user_id,
        student_id=row.student_id,
        content=row.content,
        options=row.options if isinstance(row.options, list) else [],
        answer=row.answer,
        analysis=row.analysis or "",
        question_type=row.question_type,
        difficulty=row.difficulty,
        knowledge_point=row.knowledge_point,
        source=row.source,
        tags=row.tags if isinstance(row.tags, list) else [],
        images=_normalize_images(getattr(row, "images", None)),
        created_at=row.created_at,
    )


@router.post("/collect", response_model=BankCollectResponse, status_code=201)
def collect_question(
    body: BankCollectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.student_id is not None:
        student = db.get(Student, body.student_id)
        if student is None or student.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="Student not found")
    try:
        item = normalize_bank_item(item_from_collect_request(body))
        ch = content_hash(item.content, item.answer)
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
            return BankCollectResponse(data=_read_item(existing), created=False)

        row = save_questions_to_bank(db, current_user, [item], dedupe=False)[0]
        db.commit()
        db.refresh(row)
        return BankCollectResponse(data=_read_item(row), created=True)
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to collect question: {str(e)}")


@router.get("/", response_model=list[BankItemRead])
def list_bank(
    knowledge_point: str | None = Query(None, description="Knowledge point fuzzy filter"),
    question_type: str | None = Query(None, description="Question type filter"),
    student_id: int | None = Query(None, description="Student ID scope"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    my_ids = _my_student_ids(db, current_user)
    q = db.query(QuestionBank).filter(_bank_visible_filter(current_user))
    if student_id is not None:
        if student_id not in my_ids:
            raise HTTPException(status_code=404, detail="Student not found")
        q = q.filter(_student_scope_filter(student_id))
    if knowledge_point is not None and knowledge_point.strip():
        q = q.filter(QuestionBank.knowledge_point.ilike(f"%{knowledge_point.strip()}%"))
    if question_type is not None and question_type.strip():
        q = q.filter(QuestionBank.question_type == question_type.strip())
    rows = q.order_by(QuestionBank.created_at.desc()).all()
    return [_read_item(r) for r in rows]


@router.delete("/{bank_id}", status_code=204)
def delete_from_bank(
    bank_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.get(QuestionBank, bank_id)
    if row is None or row.owner_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Question not found")
    db.delete(row)
    db.commit()
    return None
