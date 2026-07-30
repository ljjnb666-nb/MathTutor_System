from datetime import date, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.security import get_password_hash
from app.models.base import Base
from app.models.exam import Exam
from app.models.mistake import MistakeRecord
from app.models.student import Student
from app.models.user import User
from app.services.student_portal_service import (
    StudentPortalServiceError,
    get_current_student_from_token,
    get_student_mastery,
    list_student_mistakes,
    login_student,
    master_student_mistake,
    review_student_mistake,
)


def make_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            Student.__table__,
            MistakeRecord.__table__,
            Exam.__table__,
        ],
    )
    SessionLocal = sessionmaker(bind=engine)
    return SessionLocal()


def add_student(db) -> Student:
    db.add(User(id=10, username="teacher", hashed_password="x", role="teacher", is_active=True))
    db.flush()
    student = Student(
        id=1,
        user_id=10,
        name="Alice",
        grade="8",
        class_name="1",
        login_code="alice",
        hashed_password=get_password_hash("old-pass"),
    )
    db.add(student)
    db.commit()
    return student


def test_login_student_returns_token_that_resolves_current_student():
    db = make_db()
    add_student(db)

    token = login_student(db, "alice", "old-pass")
    current = get_current_student_from_token(db, token.access_token)

    assert token.token_type == "bearer"
    assert current.id == 1


def test_login_student_requires_password_when_hash_exists():
    db = make_db()
    add_student(db)

    with pytest.raises(StudentPortalServiceError) as exc_info:
        login_student(db, "alice", None)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "请输入密码"
    assert exc_info.value.authenticate_header is True


def test_list_student_mistakes_filters_review_due_and_topic():
    db = make_db()
    add_student(db)
    db.add_all(
        [
            MistakeRecord(
                student_id=1,
                topic="几何 + 勾股定理",
                source="exam",
                content="题目1",
                status="pending",
                next_review_date=date.today() - timedelta(days=1),
            ),
            MistakeRecord(
                student_id=1,
                topic="函数",
                source="exam",
                content="题目2",
                status="pending",
                next_review_date=date.today() + timedelta(days=1),
            ),
        ]
    )
    db.commit()

    rows = list_student_mistakes(db, 1, review_due=True, topic="勾股定理")

    assert [row.content for row in rows] == ["题目1"]


def test_review_and_master_mistake_update_state_and_mastery():
    db = make_db()
    add_student(db)
    db.add_all(
        [
            MistakeRecord(student_id=1, topic="几何", source="exam", content="题目1", status="pending"),
            MistakeRecord(student_id=1, topic="函数", source="exam", content="题目2", status="pending"),
        ]
    )
    db.commit()

    reviewed = review_student_mistake(db, 1, 1)
    mastered = master_student_mistake(db, 1, 2)
    mastery = get_student_mastery(db, 1)

    assert reviewed.review_count == 1
    assert reviewed.next_review_date == date.today() + timedelta(days=3)
    assert mastered.status == "mastered"
    assert mastered.mastered_at is not None
    assert mastery == {"weak_points": ["几何"], "mastered_points": ["函数"]}
