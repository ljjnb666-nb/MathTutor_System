from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.plan import Plan
from app.models.student import Student
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.student_dto import StudentCreate, StudentTagsUpdate, StudentUpdate
from app.services.student_service import (
    create_student_for_user,
    get_student_or_404,
    list_students_for_user,
    update_student_for_user,
    update_student_tags_for_user,
)


def make_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            Plan.__table__,
            Subscription.__table__,
            Student.__table__,
        ],
    )
    SessionLocal = sessionmaker(bind=engine)
    return SessionLocal()


def seed_user_with_plan(db, *, user_id: int, username: str) -> User:
    plan = db.query(Plan).filter(Plan.code == "free").first()
    if plan is None:
        plan = Plan(code="free", name="Free", max_students=3, features={})
        db.add(plan)
        db.flush()
    user = User(id=user_id, username=username, hashed_password="x", role="teacher", is_active=True)
    db.add(user)
    db.flush()
    db.add(Subscription(user_id=user.id, plan_id=plan.id, status="active"))
    db.commit()
    db.refresh(user)
    return user


def add_student(db, *, user_id: int, name: str, login_code: str | None = None) -> Student:
    row = Student(user_id=user_id, name=name, grade="8", class_name="1", tags=[], login_code=login_code)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def test_list_students_for_user_filters_by_name_and_class():
    db = make_db()
    user = seed_user_with_plan(db, user_id=1, username="teacher1")
    other = seed_user_with_plan(db, user_id=2, username="teacher2")
    add_student(db, user_id=user.id, name="Alice")
    db.add(Student(user_id=user.id, name="Bob", grade="9", class_name="Rocket", tags=[]))
    add_student(db, user_id=other.id, name="Mallory")
    db.commit()

    rows = list_students_for_user(db, user, name="bo", class_name="rock")

    assert [row.name for row in rows] == ["Bob"]


def test_get_student_or_404_rejects_other_users_student():
    db = make_db()
    user = seed_user_with_plan(db, user_id=1, username="teacher1")
    other = seed_user_with_plan(db, user_id=2, username="teacher2")
    student = add_student(db, user_id=other.id, name="Mallory")

    try:
        get_student_or_404(db, student.id, user)
    except HTTPException as exc:
        assert exc.status_code == 404
    else:
        raise AssertionError("expected HTTPException")


def test_create_student_for_user_rejects_duplicate_login_code():
    db = make_db()
    user = seed_user_with_plan(db, user_id=1, username="teacher1")
    add_student(db, user_id=user.id, name="Alice", login_code="alice")

    body = StudentCreate(name="Bob", grade="8", class_name="1", tags=[], login_code="alice", password=None)

    try:
        create_student_for_user(db, body, user)
    except HTTPException as exc:
        assert exc.status_code == 400
    else:
        raise AssertionError("expected HTTPException")


def test_update_student_for_user_normalizes_login_code_and_password():
    db = make_db()
    user = seed_user_with_plan(db, user_id=1, username="teacher1")
    student = add_student(db, user_id=user.id, name="Alice", login_code=None)

    updated = update_student_for_user(
        db,
        student.id,
        StudentUpdate(login_code="  alice  ", password="secret"),
        user,
    )

    assert updated.login_code == "alice"
    assert updated.hashed_password


def test_update_student_tags_for_user_adds_and_removes_cleaned_tags():
    db = make_db()
    user = seed_user_with_plan(db, user_id=1, username="teacher1")
    student = add_student(db, user_id=user.id, name="Alice")
    student.tags = ["几何", "函数"]
    db.commit()

    updated = update_student_tags_for_user(
        db,
        student.id,
        StudentTagsUpdate(add=["  计算  ", "几何"], remove=["函数", ""]),
        user,
    )

    assert updated.tags == ["几何", "计算"]
