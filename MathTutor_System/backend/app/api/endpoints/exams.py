"""Teacher-side exam endpoints."""

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.models.base import get_db
from app.models.exam import Exam
from app.models.user import User
from app.schemas.exam_dto import (
    ExamCreate,
    ExamResponse,
    ExamResponseWithStudent,
    ExamUpdate,
    GradeRequest,
    GradeResponse,
)
from app.services.exam_service import (
    create_exam_for_user,
    delete_exam_for_user,
    get_exam_or_404,
    grade_exam_for_user,
    list_exams_for_user,
    update_exam_for_user,
)

router = APIRouter()


@router.post("/", response_model=ExamResponse, status_code=201)
def create_exam(
    body: ExamCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Exam:
    return create_exam_for_user(db, body, current_user)


@router.get("/", response_model=list[ExamResponseWithStudent])
def list_exams(
    assignment_date: date | None = Query(None, description="按作业日期筛选"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ExamResponseWithStudent]:
    return list_exams_for_user(db, current_user, assignment_date=assignment_date)


@router.put("/{exam_id}", response_model=ExamResponse)
def update_exam(
    exam_id: int,
    body: ExamUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Exam:
    return update_exam_for_user(db, exam_id, body, current_user)


@router.get("/{exam_id}", response_model=ExamResponse)
def get_exam(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Exam:
    return get_exam_or_404(db, exam_id, current_user)


@router.delete("/{exam_id}", status_code=204)
def delete_exam(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    delete_exam_for_user(db, exam_id, current_user)
    return None


@router.post("/{exam_id}/grade", response_model=GradeResponse)
def grade_exam(
    exam_id: int,
    body: GradeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GradeResponse:
    return grade_exam_for_user(db, exam_id, body, current_user)
