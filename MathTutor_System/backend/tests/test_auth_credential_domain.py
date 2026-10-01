"""PHASE 2B-3: real JWT and endpoint boundaries with colliding identities."""
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.endpoints.auth import get_current_user, get_current_user_optional
from app.core.security import create_access_token, decode_access_token, get_password_hash
from app.main import app
from app.models.base import Base, get_db
from app.models.student import Student
from app.models.user import User


@pytest.fixture
def domain_db():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine)() as db:
        db.add(User(id=1, username="12", hashed_password=get_password_hash("domain-test-password"),
                    role="teacher", is_active=True))
        db.flush()
        db.add(Student(id=12, user_id=1, name="Collision student", grade="8", class_name="1",
                       login_code="domain-student"))
        db.commit()
        yield db
    engine.dispose()


@pytest.fixture
def client(domain_db):
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = lambda: domain_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)


def headers(payload):
    return {"Authorization": f"Bearer {create_access_token(payload)}"}


def assert_unauthorized(response):
    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"


@pytest.mark.parametrize("role,path", [("teacher", "/api/users/me"), ("admin", "/api/users/")])
def test_student_identity_collision_cannot_enter_teacher_or_admin(client, domain_db, role, path):
    # JWT-DOMAIN-01/02: the student and teacher/admin genuinely exist in the DB.
    user = domain_db.get(User, 1)
    user.role = role
    domain_db.commit()
    student = domain_db.get(Student, 12)
    assert user.username == str(student.id)
    assert_unauthorized(client.get(path, headers=headers({"sub": str(student.id), "type": "student"})))


def test_teacher_login_issues_typed_credential_and_authenticates(client):
    # JWT-DOMAIN-03: real password verification and signing, no auth override.
    response = client.post("/api/token", data={"username": "12", "password": "domain-test-password"})
    assert response.status_code == 200
    token = response.json()["access_token"]
    payload = decode_access_token(token)
    assert payload["sub"] == "12"
    assert payload["type"] == "teacher"
    response = client.get("/api/users/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["username"] == "12"


def test_legacy_teacher_credential_remains_accepted(client):
    # JWT-DOMAIN-04.
    response = client.get("/api/users/me", headers=headers({"sub": "12"}))
    assert response.status_code == 200
    assert response.json()["username"] == "12"


@pytest.mark.parametrize("token_type", ["other", "admin", "user", "staff", "system", "", 0, False, [], {}])
def test_explicit_unknown_type_is_rejected(client, token_type):
    # JWT-DOMAIN-05: allowlist, including malformed explicit discriminator types.
    assert_unauthorized(client.get("/api/users/me", headers=headers({"sub": "12", "type": token_type})))


@pytest.mark.parametrize("payload", [{"sub": "12", "type": "teacher"}, {"sub": "12"}])
def test_teacher_and_legacy_credentials_cannot_enter_student_domain(client, payload):
    # JWT-DOMAIN-06/07: numeric username would resolve a real student if relaxed.
    assert_unauthorized(client.get("/api/student/me", headers=headers(payload)))


@pytest.mark.parametrize("token_type", ["student", "other", "admin", "user", "staff", "system", "", 0, False, [], {}])
def test_optional_auth_rejects_explicit_other_domains(domain_db, token_type):
    # JWT-DOMAIN-08/09: optional auth must never return the colliding User.
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=create_access_token({"sub": "12", "type": token_type}))
    assert get_current_user_optional(credentials, domain_db) is None


def test_typed_teacher_admin_uses_user_role_authorization(client, domain_db):
    # JWT-DOMAIN-10.
    domain_db.get(User, 1).role = "admin"
    domain_db.commit()
    response = client.get("/api/users/", headers=headers({"sub": "12", "type": "teacher"}))
    assert response.status_code == 200
    assert response.json()[0]["username"] == "12"


def test_teacher_domain_does_not_grant_admin_role(client):
    response = client.get("/api/users/", headers=headers({"sub": "12", "type": "teacher"}))
    assert response.status_code == 403


def test_student_credential_cannot_reach_admin_user_creation(client, domain_db):
    # PHASE 2B-4: reject at the teacher credential boundary before admin authorization.
    domain_db.get(User, 1).role = "admin"
    domain_db.commit()
    response = client.post(
        "/api/users/", headers=headers({"sub": "12", "type": "student"}),
        json={"username": "must-not-be-created", "password": "domain-test-password"},
    )
    assert_unauthorized(response)
    assert domain_db.query(User).count() == 1


@pytest.mark.parametrize("token_type", ["student", "other", "admin", [], {}])
def test_domain_rejection_precedes_user_lookup(token_type):
    class NoIdentityLookup:
        def query(self, *args):
            pytest.fail("Rejected credential reached teacher identity resolution")

    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=create_access_token({"sub": "12", "type": token_type}))
    assert get_current_user_optional(credentials, NoIdentityLookup()) is None
    with pytest.raises(HTTPException) as error:
        get_current_user(credentials, NoIdentityLookup())
    assert error.value.status_code == 401
    assert error.value.headers == {"WWW-Authenticate": "Bearer"}


@pytest.mark.parametrize("payload", [{"sub": "12", "type": "teacher"}, {"sub": "12"}, {"sub": "12", "type": None}])
def test_optional_auth_accepts_teacher_and_legacy(domain_db, payload):
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=create_access_token(payload))
    assert get_current_user_optional(credentials, domain_db).username == "12"


def test_student_login_and_me_keep_student_domain(client):
    response = client.post("/api/student/token", json={"login_code": "domain-student"})
    assert response.status_code == 200
    token = response.json()["access_token"]
    assert decode_access_token(token)["type"] == "student"
    response = client.get("/api/student/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["id"] == 12


@pytest.mark.parametrize("path", ["/api/llm/status", "/api/teacher-agent/runs"])
def test_typed_teacher_reaches_authenticated_services(client, path):
    assert client.get(path, headers=headers({"sub": "12", "type": "teacher"})).status_code == 200


@pytest.mark.parametrize("payload", [{"type": "teacher"}, {"sub": "nonexistent", "type": "teacher"}])
def test_missing_subject_and_missing_user_keep_failure_contract(client, domain_db, payload):
    assert_unauthorized(client.get("/api/users/me", headers=headers(payload)))
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=create_access_token(payload))
    assert get_current_user_optional(credentials, domain_db) is None


def test_disabled_user_keeps_failure_contract(client, domain_db):
    domain_db.get(User, 1).is_active = False
    domain_db.commit()
    assert_unauthorized(client.get("/api/users/me", headers=headers({"sub": "12", "type": "teacher"})))
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=create_access_token({"sub": "12", "type": "teacher"}))
    assert get_current_user_optional(credentials, domain_db) is None


@pytest.mark.parametrize("authorization", [None, "Bearer invalid-jwt"])
def test_absent_and_invalid_credentials_keep_failure_contract(client, domain_db, authorization):
    request_headers = {"Authorization": authorization} if authorization else {}
    assert_unauthorized(client.get("/api/users/me", headers=request_headers))
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="invalid-jwt") if authorization else None
    assert get_current_user_optional(credentials, domain_db) is None
