"""Business logic for teacher-side exam CRUD and visibility rules."""

import logging
from datetime import date, datetime

from fastapi import HTTPException
from sqlalchemy import desc, or_
from sqlalchemy.orm import Session

from app.models.exam import Exam
from app.models.student import Student
from app.models.user import User
from app.schemas.exam_dto import ExamCreate, ExamResponseWithStudent, ExamUpdate, GradeRequest, GradeResponse
from app.services.exam_grading_service import grade_exam_core

logger = logging.getLogger(__name__)


def get_user_student_ids(db: Session, user: User) -> list[int]:
    rows = db.query(Student.id).filter(Student.user_id == user.id).all()
    return [row[0] for row in rows]


def exam_visible_filter(student_ids: list[int]):
    if not student_ids:
        return Exam.student_id.is_(None)
    return or_(Exam.student_id.in_(student_ids), Exam.student_id.is_(None))


def get_exam_or_404(db: Session, exam_id: int, current_user: User) -> Exam:
    exam = db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="试卷不存在")
    student_ids = get_user_student_ids(db, current_user)
    if exam.student_id is not None and exam.student_id not in student_ids:
        raise HTTPException(status_code=404, detail="试卷不存在")
    return exam


def get_owned_student_or_404(db: Session, student_id: int, current_user: User) -> Student:
    student = db.get(Student, student_id)
    if student is None or student.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="学生不存在")
    return student


def default_exam_title() -> str:
    return "未命名试卷" + datetime.now().strftime("%Y-%m-%d")


def normalize_exam_questions(questions):
    if isinstance(questions, dict):
        return questions
    return [q.model_dump() if hasattr(q, "model_dump") else q for q in questions]


def create_exam_for_user(db: Session, body: ExamCreate, current_user: User) -> Exam:
    if body.student_id is not None:
        get_owned_student_or_404(db, body.student_id, current_user)
    row = Exam(
        title=(body.title or "").strip() or default_exam_title(),
        student_id=body.student_id,
        questions=normalize_exam_questions(body.questions),
        assignment_date=body.assignment_date,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_exams_for_user(
    db: Session,
    current_user: User,
    *,
    assignment_date: date | None = None,
) -> list[ExamResponseWithStudent]:
    student_ids = get_user_student_ids(db, current_user)
    q = (
        db.query(Exam, Student.name)
        .outerjoin(Student, Exam.student_id == Student.id)
        .filter(exam_visible_filter(student_ids))
    )
    if assignment_date is not None:
        q = q.filter(Exam.assignment_date == assignment_date)
    rows = q.order_by(desc(Exam.assignment_date).nullslast(), Exam.created_at.desc()).all()
    return [
        ExamResponseWithStudent(
            id=exam.id,
            title=exam.title,
            student_id=exam.student_id,
            questions=exam.questions,
            created_at=exam.created_at,
            assignment_date=getattr(exam, "assignment_date", None),
            graded_at=getattr(exam, "graded_at", None),
            grade_summary=getattr(exam, "grade_summary", None),
            grade_results=getattr(exam, "grade_results", None),
            student_name=student_name,
        )
        for exam, student_name in rows
    ]


def update_exam_for_user(db: Session, exam_id: int, body: ExamUpdate, current_user: User) -> Exam:
    row = get_exam_or_404(db, exam_id, current_user)
    data = body.model_dump(exclude_unset=True)
    if "title" in data and data["title"] is not None:
        row.title = (data["title"] or "").strip() or default_exam_title()
    if "assignment_date" in data:
        row.assignment_date = data["assignment_date"]
    if "questions" in data and data["questions"] is not None:
        row.questions = normalize_exam_questions(data["questions"])
    db.commit()
    db.refresh(row)
    return row


def delete_exam_for_user(db: Session, exam_id: int, current_user: User) -> None:
    row = get_exam_or_404(db, exam_id, current_user)
    db.delete(row)
    db.commit()
    logger.info("Exam %s deleted by user %s", exam_id, current_user.id)


def grade_exam_for_user(
    db: Session,
    exam_id: int,
    body: GradeRequest,
    current_user: User,
) -> GradeResponse:
    exam = get_exam_or_404(db, exam_id, current_user)
    student_id = body.student_id if body.student_id is not None else exam.student_id
    if student_id is None:
        logger.warning("Grade exam %s: no student_id in body and exam.student_id is empty", exam_id)
        raise HTTPException(
            status_code=400,
            detail="Cannot grade exam without student context. Pass student_id in request body or use an exam linked to a student.",
        )

    get_owned_student_or_404(db, student_id, current_user)
    logger.info("Grading exam %s for student %s", exam_id, student_id)

    try:
        return grade_exam_core(db, exam, body.results, student_id)
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("Grade exam %s failed: %s", exam_id, exc)
        detail = str(exc).strip() or "提交批改结果失败"
        if len(detail) > 300:
            detail = detail[:300] + "..."
        raise HTTPException(status_code=500, detail=detail)
