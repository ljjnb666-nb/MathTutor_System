from datetime import date

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.exam import Exam
from app.models.student import Student
from app.models.user import User
from app.schemas.exam_dto import ExamCreate, ExamUpdate
from app.services.exam_service import (
    create_exam_for_user,
    default_exam_title,
    get_exam_or_404,
    list_exams_for_user,
    update_exam_for_user,
)


def make_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            Student.__table__,
            Exam.__table__,
        ],
    )
    SessionLocal = sessionmaker(bind=engine)
    return SessionLocal()


def add_user(db, user_id: int, username: str) -> User:
    user = User(id=user_id, username=username, hashed_password="x", role="teacher", is_active=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def add_student(db, user_id: int, student_id: int, name: str) -> Student:
    row = Student(id=student_id, user_id=user_id, name=name, grade="8", class_name="1", tags=[])
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def add_exam(db, *, student_id: int | None, title: str, assignment_date: date | None = None) -> Exam:
    row = Exam(title=title, student_id=student_id, questions=[], assignment_date=assignment_date)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def test_create_exam_for_user_requires_owned_student():
    db = make_db()
    user = add_user(db, 1, "teacher1")
    other = add_user(db, 2, "teacher2")
    student = add_student(db, other.id, 10, "Mallory")

    body = ExamCreate(title="Quiz", student_id=student.id, questions=[], assignment_date=None)

    with pytest.raises(HTTPException) as exc_info:
        create_exam_for_user(db, body, user)

    assert exc_info.value.status_code == 404


def test_create_exam_for_user_defaults_title_and_normalizes_questions():
    db = make_db()
    user = add_user(db, 1, "teacher1")
    student = add_student(db, user.id, 10, "Alice")

    row = create_exam_for_user(
        db,
        ExamCreate(title="  ", student_id=student.id, questions=[], assignment_date=None),
        user,
    )

    assert row.student_id == student.id
    assert row.title.startswith("未命名试卷")


def test_list_exams_for_user_hides_other_teachers_exam_and_keeps_unassigned():
    db = make_db()
    user = add_user(db, 1, "teacher1")
    other = add_user(db, 2, "teacher2")
    student = add_student(db, user.id, 10, "Alice")
    other_student = add_student(db, other.id, 11, "Mallory")
    own_exam = add_exam(db, student_id=student.id, title="Own")
    unassigned_exam = add_exam(db, student_id=None, title="Draft")
    add_exam(db, student_id=other_student.id, title="Other")

    rows = list_exams_for_user(db, user)

    assert [row.title for row in rows] == ["Draft", "Own"]
    assert [row.student_id for row in rows] == [None, own_exam.student_id]
    assert any(row.title == "Own" and row.student_name == "Alice" for row in rows)
    assert any(row.title == "Draft" and row.student_name is None for row in rows)


def test_get_exam_or_404_rejects_other_teachers_exam():
    db = make_db()
    user = add_user(db, 1, "teacher1")
    other = add_user(db, 2, "teacher2")
    other_student = add_student(db, other.id, 11, "Mallory")
    exam = add_exam(db, student_id=other_student.id, title="Other")

    with pytest.raises(HTTPException) as exc_info:
        get_exam_or_404(db, exam.id, user)

    assert exc_info.value.status_code == 404


def test_update_exam_for_user_updates_title_and_questions():
    db = make_db()
    user = add_user(db, 1, "teacher1")
    student = add_student(db, user.id, 10, "Alice")
    exam = add_exam(db, student_id=student.id, title="Old", assignment_date=None)

    updated = update_exam_for_user(
        db,
        exam.id,
        ExamUpdate(title=" New ", questions=[{"content": "Q1", "answer": "A"}]),
        user,
    )

    assert updated.title == "New"
    assert updated.questions == [{"content": "Q1", "answer": "A"}]
