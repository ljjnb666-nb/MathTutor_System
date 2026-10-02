"""RB01: student and owner account reincarnation must never resurrect credentials."""
from uuid import uuid4

import pytest

from app.core.security import create_access_token, decode_access_token, get_password_hash
from app.models import Student, User
from app.schemas.student_dto import StudentUpdate
from app.services.student_portal_service import (
    StudentPortalServiceError, get_current_student_from_token, login_student,
)
from app.services.student_service import delete_student_for_user, update_student_for_user
from app.services.user_deletion_service import delete_user_lifecycle
from tests.test_user_tenant_purge import database
from tests.test_user_deletion_lifecycle import real_store, assert_empty


FIXTURE_STUDENT_PASSWORD = "-".join(["portal", "pass", "123"])


def add_student(db, owner=2, code="code-a"):
    # SEC-01: code-only credentials can no longer authenticate, so every fixture
    # student now carries the paired password its logins use.
    student = Student(
        user_id=owner, name="Student", grade="8", class_name="1",
        login_code=code, hashed_password=get_password_hash(FIXTURE_STUDENT_PASSWORD),
    )
    db.add(student)
    db.commit()
    return student


def assert_rejected(db, token):
    with pytest.raises(StudentPortalServiceError) as error:
        get_current_student_from_token(db, token)
    assert error.value.status_code == 401
    assert error.value.authenticate_header


def test_rb01_student_01_token_contract(database):
    with database() as db:
        student = add_student(db)
        owner = db.get(User, 2)
        token = login_student(db, student.login_code, FIXTURE_STUDENT_PASSWORD).access_token
        payload = decode_access_token(token)
        assert {key: payload[key] for key in ("type", "sub", "sid", "owner_uid", "owner_sub")} == {
            "type": "student", "sub": student.auth_subject, "sid": student.id,
            "owner_uid": owner.id, "owner_sub": owner.auth_subject,
        }
        assert get_current_student_from_token(db, token).id == student.id


def test_rb01_student_02_legacy_signed_numeric_token_rejected(database):
    with database() as db:
        student = add_student(db)
        assert_rejected(db, create_access_token({"type": "student", "sub": str(student.id)}))


@pytest.mark.parametrize("new_owner", [2, 3], ids=["same-owner", "different-owner"])
def test_rb01_student_03_04_05_direct_delete_highest_id_reused(database, new_owner):
    with database() as db:
        first = add_student(db)
        old_id, old_subject = first.id, first.auth_subject
        old_token = login_student(db, first.login_code, FIXTURE_STUDENT_PASSWORD).access_token
        assert db.query(Student).count() == 1  # highest row; automatic SQLite reuse is intentional
        delete_student_for_user(db, old_id, db.get(User, 2))
        second = add_student(db, owner=new_owner, code="code-b")
        if db.get_bind().dialect.name == "sqlite":
            assert second.id == old_id  # actual automatic allocation, no forced primary key
        else:
            # PostgreSQL sequences advance; explicitly reproduce the same threat.
            second.id = old_id
            db.commit()
        assert second.id == old_id
        assert second.auth_subject != old_subject
        assert_rejected(db, old_token)
        new_token = login_student(db, second.login_code, FIXTURE_STUDENT_PASSWORD).access_token
        assert get_current_student_from_token(db, new_token).auth_subject == second.auth_subject


def test_rb01_student_06_full_user_delete_then_both_ids_reused(database, real_store):
    with database() as db:
        student = add_student(db)
        owner = db.get(User, 2)
        uid, usub, sid, ssub = owner.id, owner.auth_subject, student.id, student.auth_subject
        old_token = login_student(db, student.login_code, FIXTURE_STUDENT_PASSWORD).access_token
        delete_user_lifecycle(db, uid, 1)
        assert db.get(User, uid) is None and db.get(Student, sid) is None
        assert_empty(real_store)
        replacement_owner = User(id=uid, username="replacement", hashed_password="x")
        db.add(replacement_owner)
        db.commit()
        replacement = Student(id=sid, user_id=uid, name="New student", grade="8", class_name="1", login_code="new-code", hashed_password=get_password_hash(FIXTURE_STUDENT_PASSWORD))
        db.add(replacement)
        db.commit()
        assert replacement_owner.auth_subject != usub and replacement.auth_subject != ssub
        assert_rejected(db, old_token)
        assert get_current_student_from_token(db, login_student(db, "new-code", FIXTURE_STUDENT_PASSWORD).access_token).id == sid


@pytest.mark.parametrize("field", ["owner_sub", "sid", "owner_uid"], ids=["RB01-STUDENT-07", "RB01-STUDENT-08", "RB01-STUDENT-09"])
def test_rb01_consistency_mismatch(database, field):
    with database() as db:
        student = add_student(db)
        payload = decode_access_token(login_student(db, student.login_code, FIXTURE_STUDENT_PASSWORD).access_token)
        payload[field] = str(uuid4()) if field == "owner_sub" else payload[field] + 1
        assert_rejected(db, create_access_token(payload))


@pytest.mark.parametrize("active_flag", [False, True])
def test_rb01_student_10_owner_deleting_denies_old_token_and_login(database, active_flag):
    with database() as db:
        student = add_student(db)
        token = login_student(db, student.login_code, FIXTURE_STUDENT_PASSWORD).access_token
        owner = db.get(User, 2)
        owner.deletion_state = "deleting"
        owner.is_active = active_flag  # corrupted active flag must still fail closed
        from app.services.user_admin_service import utc_now
        owner.deletion_started_at = utc_now()
        db.commit()
        assert_rejected(db, token)
        with pytest.raises(StudentPortalServiceError) as error:
            login_student(db, student.login_code, FIXTURE_STUDENT_PASSWORD)
        assert error.value.status_code == 401


def test_owner_reassignment_and_same_id_owner_reincarnation_reject(database):
    with database() as db:
        student = add_student(db)
        token = login_student(db, student.login_code, FIXTURE_STUDENT_PASSWORD).access_token
        student.user_id = 3
        db.commit()
        assert_rejected(db, token)
        student.user_id = None
        db.commit()
        db.query(User).filter(User.id == 2).delete()
        db.commit()
        db.add(User(id=2, username="new-owner", hashed_password="x"))
        db.commit()
        student.user_id = 2  # same student instance, new owner instance with recycled ID
        db.commit()
        assert_rejected(db, token)
        assert get_current_student_from_token(db, login_student(db, student.login_code, FIXTURE_STUDENT_PASSWORD).access_token).id == student.id


@pytest.mark.parametrize("field,value", [
    ("type", "teacher"), ("type", "Student"), ("type", True),
    ("sub", None), ("sub", "12"), ("sub", "not-a-uuid"), ("sub", 12),
    ("sub", "3D9EEA70-843E-43D6-A4AE-A9AAB091ACD1"),
    ("sid", None), ("sid", True), ("sid", False), ("sid", "1"), ("sid", 1.0), ("sid", 0), ("sid", -1), ("sid", 2**63),
    ("owner_uid", None), ("owner_uid", True), ("owner_uid", "2"), ("owner_uid", 0), ("owner_uid", -1), ("owner_uid", 2**63),
    ("owner_sub", None), ("owner_sub", "2"), ("owner_sub", 2),
    ("owner_sub", "3D9EEA70-843E-43D6-A4AE-A9AAB091ACD1"),
])
def test_malformed_claims_rejected(database, field, value):
    with database() as db:
        student = add_student(db)
        payload = decode_access_token(login_student(db, student.login_code, FIXTURE_STUDENT_PASSWORD).access_token)
        payload[field] = value
        assert_rejected(db, create_access_token(payload))


def test_normal_update_cannot_change_immutable_subject(database):
    with database() as db:
        student = add_student(db)
        before = student.auth_subject
        body = StudentUpdate.model_validate({"name": "Changed", "password": "updated-pass", "login_code": "changed-code", "auth_subject": str(uuid4())})
        result = update_student_for_user(db, student.id, body, db.get(User, 2))
        assert result.name == "Changed" and result.auth_subject == before
        assert "auth_subject" not in body.model_dump()
