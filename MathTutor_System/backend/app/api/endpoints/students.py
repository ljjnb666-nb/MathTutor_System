"""Student management endpoints for teacher-owned student records."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.models.base import get_db
from app.models.student import Student
from app.models.user import User
from app.schemas.student_dto import StudentCreate, StudentResponse, StudentTagsUpdate, StudentUpdate
from app.services.student_service import (
    create_student_for_user,
    delete_student_for_user,
    get_student_or_404,
    list_students_for_user,
    update_student_for_user,
    update_student_tags_for_user,
)

router = APIRouter()


@router.get("/", response_model=list[StudentResponse])
def list_students(
    name: str | None = Query(None, description="按姓名搜索（模糊）"),
    class_name: str | None = Query(None, description="按班级搜索（模糊）"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Student]:
    return list_students_for_user(db, current_user, name=name, class_name=class_name)


@router.post("/", response_model=StudentResponse, status_code=201)
def create_student(
    body: StudentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Student:
    return create_student_for_user(db, body, current_user)


@router.get("/{student_id}", response_model=StudentResponse)
def get_student(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Student:
    return get_student_or_404(db, student_id, current_user)


@router.put("/{student_id}", response_model=StudentResponse)
def update_student(
    student_id: int,
    body: StudentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Student:
    return update_student_for_user(db, student_id, body, current_user)


@router.delete("/{student_id}", status_code=204)
def delete_student(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    delete_student_for_user(db, student_id, current_user)
    return None


@router.post("/{student_id}/tags", response_model=StudentResponse)
def update_student_tags(
    student_id: int,
    body: StudentTagsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Student:
    return update_student_tags_for_user(db, student_id, body, current_user)
