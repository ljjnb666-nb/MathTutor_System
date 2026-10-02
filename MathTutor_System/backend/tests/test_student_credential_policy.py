"""SEC-01: student portal credentials require login_code AND password; code-only is dead."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi import HTTPException

import bcrypt
from pydantic import ValidationError

from app.core.security import get_password_hash, verify_password
from app.models.base import Base
from app.models.exam import Exam
from app.models.mistake import MistakeRecord
from app.models.plan import Plan
from app.models.student import Student
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.student_dto import StudentCreate, StudentUpdate
from app.services.student_portal_service import (
    StudentPortalServiceError,
    login_student,
    update_student_password,
)
from app.services.student_service import create_student_for_user, update_student_for_user

CREDENTIAL_PASSWORD_DETAIL = "启用学生端登录时必须同时设置密码"
UNIFIED_LOGIN_FAILURE = "登录码或密码错误"


def make_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            Plan.__table__,
            Subscription.__table__,
            Student.__table__,
            MistakeRecord.__table__,
            Exam.__table__,
        ],
    )
    return sessionmaker(bind=engine)()


def seed_teacher(db, user_id=1):
    plan = db.query(Plan).filter(Plan.code == "free").first()
    if plan is None:
        plan = Plan(code="free", name="免费版", max_students=50, features={})
        db.add(plan)
    db.add(User(id=user_id, username=f"teacher{user_id}", hashed_password="x", role="teacher", is_active=True))
    db.flush()
    db.add(Subscription(user_id=user_id, plan_id=plan.id, status="active"))
    db.commit()
    return db.get(User, user_id)


def seed_legacy_code_only_student(db, code="legacy-code"):
    """Historical row: login_code set but no password — must never authenticate."""
    student = Student(
        user_id=1, name="Legacy", grade="8", class_name="1",
        login_code=code, hashed_password=None,
    )
    db.add(student)
    db.commit()
    return student


def seed_credentialed_student(db, code="alice", password="alice-pass-123"):
    student = Student(
        user_id=1, name="Alice", grade="8", class_name="1",
        login_code=code, hashed_password=get_password_hash(password),
    )
    db.add(student)
    db.commit()
    return student


def test_legacy_code_only_student_cannot_login():
    db = make_db()
    seed_teacher(db)
    seed_legacy_code_only_student(db)

    with pytest.raises(StudentPortalServiceError) as exc:
        login_student(db, "legacy-code", None)
    assert exc.value.status_code == 401
    assert exc.value.detail == UNIFIED_LOGIN_FAILURE

    # Supplying any password must not reveal that the login_code exists without one.
    with pytest.raises(StudentPortalServiceError) as exc:
        login_student(db, "legacy-code", "any-guess-123")
    assert exc.value.detail == UNIFIED_LOGIN_FAILURE


def test_legacy_weak_password_still_logs_in():
    """Historical <8-char hashes keep working; only NEW hashes obey the policy."""
    db = make_db()
    seed_teacher(db)
    legacy_hash = bcrypt.hashpw(b"old6", bcrypt.gensalt()).decode()
    db.add(Student(
        user_id=1, name="Old", grade="8", class_name="1",
        login_code="old-code", hashed_password=legacy_hash,
    ))
    db.commit()

    token = login_student(db, "old-code", "old6")
    assert token.access_token


def test_new_student_with_login_code_requires_password():
    db = make_db()
    user = seed_teacher(db)

    with pytest.raises(HTTPException) as exc:
        create_student_for_user(
            db,
            StudentCreate(name="Bob", grade="8", class_name="1", login_code="bob-code", password=None),
            user,
        )
    assert exc.value.status_code == 400
    assert CREDENTIAL_PASSWORD_DETAIL in exc.value.detail
    assert db.query(Student).count() == 0


def test_new_student_with_login_code_and_password_is_created():
    db = make_db()
    user = seed_teacher(db)

    row = create_student_for_user(
        db,
        StudentCreate(name="Bob", grade="8", class_name="1", login_code="bob-code", password="bob-pass-123"),
        user,
    )
    assert row.login_code == "bob-code"
    assert verify_password("bob-pass-123", row.hashed_password)
    assert login_student(db, "bob-code", "bob-pass-123").access_token


def test_dto_rejects_short_password_before_service():
    with pytest.raises(ValidationError):
        StudentCreate(name="Bob", grade="8", class_name="1", login_code="bob-code", password="short12")


def test_service_rejects_short_password_even_if_dto_bypassed():
    """防御纵深：绕过 DTO 直调服务时，policy authority 仍然拦截。"""
    db = make_db()
    user = seed_teacher(db)
    body = StudentCreate.model_construct(
        name="Bob", grade="8", class_name="1", login_code="bob-code", password="short12", tags=[],
    )

    with pytest.raises(HTTPException) as exc:
        create_student_for_user(db, body, user)
    assert exc.value.status_code == 400
    assert "至少 8 个字符" in exc.value.detail
    assert db.query(Student).count() == 0


def test_new_student_over_72_utf8_bytes_rejected():
    db = make_db()
    user = seed_teacher(db)

    with pytest.raises(HTTPException) as exc:
        create_student_for_user(
            db,
            StudentCreate(name="Bob", grade="8", class_name="1", login_code="bob-code", password="密" * 25),
            user,
        )
    assert exc.value.status_code == 400
    assert "72 字节" in exc.value.detail


def test_update_passwordless_student_to_login_code_requires_password_same_update():
    db = make_db()
    user = seed_teacher(db)
    student = Student(user_id=1, name="NoLogin", grade="8", class_name="1", login_code=None)
    db.add(student)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        update_student_for_user(db, student.id, StudentUpdate(login_code="new-code"), user)
    assert exc.value.status_code == 400
    assert CREDENTIAL_PASSWORD_DETAIL in exc.value.detail
    db.refresh(student)
    assert student.login_code is None  # nothing was half-applied

    updated = update_student_for_user(
        db, student.id, StudentUpdate(login_code="new-code", password="set-pass-123"), user
    )
    assert updated.login_code == "new-code"
    assert login_student(db, "new-code", "set-pass-123").access_token


def test_update_student_with_existing_password_may_change_code_only():
    db = make_db()
    user = seed_teacher(db)
    student = seed_credentialed_student(db)

    updated = update_student_for_user(db, student.id, StudentUpdate(login_code="renamed"), user)
    assert updated.login_code == "renamed"
    assert login_student(db, "renamed", "alice-pass-123").access_token


def test_student_password_change_new_password_follows_policy():
    db = make_db()
    seed_teacher(db)
    student = seed_credentialed_student(db)

    with pytest.raises(StudentPortalServiceError) as exc:
        update_student_password(db, student, "alice-pass-123", "tiny12")
    assert exc.value.status_code == 400

    update_student_password(db, student, "alice-pass-123", "brand-new-pass-9")
    assert login_student(db, "alice", "brand-new-pass-9").access_token
