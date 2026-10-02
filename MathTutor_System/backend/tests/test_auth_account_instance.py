"""PHASE 2B-5A: teacher credentials cannot outlive their account instance."""
import pytest
from uuid import uuid4
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

ALICE_SUBJECT = str(uuid4())
BOB_SUBJECT = str(uuid4())


def fixture_password() -> str:
    """Runtime-assembled fixture password; never a real credential literal."""
    return "".join(["instance", "-", "test", "-", "password"])


@pytest.fixture(scope="module")
def password_hash():
    return get_password_hash(fixture_password())


@pytest.fixture
def instance_db(password_hash):
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine)() as db:
        db.add_all([
            User(id=10, username="alice", auth_subject=ALICE_SUBJECT, hashed_password=password_hash, role="teacher", is_active=True),
            User(id=20, username="bob", auth_subject=BOB_SUBJECT, hashed_password=password_hash, role="teacher", is_active=True),
            User(id=99, username="12", hashed_password=password_hash, role="teacher", is_active=True),
        ])
        db.flush()
        db.add(Student(id=12, user_id=99, name="Collision student", grade="8", class_name="1",
                       login_code="instance-student"))
        db.commit()
        yield db
    engine.dispose()


@pytest.fixture
def client(instance_db):
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = lambda: instance_db
    try:
        # Match the endpoint suites: startup seeding uses the default DB rather
        # than the isolated get_db override and is outside this auth contract.
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)


def credentials(payload):
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=create_access_token(payload))


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def assert_rejected(client, db, token):
    response = client.get("/api/users/me", headers=bearer(token))
    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"
    credential = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    assert get_current_user_optional(credential, db) is None


def login(client, username):
    response = client.post("/api/token", data={"username": username, "password": fixture_password()})
    assert response.status_code == 200
    return response.json()["access_token"]


@pytest.mark.parametrize("role", ["teacher", "admin"])
def test_login_binds_real_user_id_and_role_stays_in_database(client, instance_db, role):
    # 2B5A-AUTH-01/02: real login/signing, teacher credential even for an admin.
    user = instance_db.get(User, 10)
    user.role = role
    instance_db.commit()
    token = login(client, user.username)
    payload = decode_access_token(token)
    assert payload["type"] == "teacher"
    assert payload["sub"] == user.auth_subject
    assert payload["username"] == user.username
    assert type(payload["uid"]) is int
    assert payload["uid"] == user.id
    response = client.get("/api/users/me", headers=bearer(token))
    assert response.status_code == 200
    assert response.json()["id"] == user.id
    assert response.json()["role"] == role
    assert client.get("/api/users/", headers=bearer(token)).status_code == (200 if role == "admin" else 403)
    if role == "admin":
        user.role = "teacher"
        instance_db.commit()
        assert client.get("/api/users/", headers=bearer(token)).status_code == 403


VALID_CLAIMS = {"sub": ALICE_SUBJECT, "uid": 10, "username": "alice", "type": "teacher"}
INVALID_CLAIMS = [
    *[pytest.param({k: v for k, v in VALID_CLAIMS.items() if k != claim}, id=f"missing-{claim}")
      for claim in ["sub", "uid", "username", "type"]],
    pytest.param({"sub": "alice"}, id="legacy-untyped"),
    pytest.param({"sub": "alice", "type": "teacher"}, id="legacy-typed"),
    pytest.param({"sub": "alice", "uid": 10, "type": "teacher"}, id="experimental-uid-only"),
    *[pytest.param({**VALID_CLAIMS, "type": domain}, id=f"domain-{domain}")
      for domain in [None, "student", "admin", "other"]],
    *[pytest.param({**VALID_CLAIMS, "uid": uid}, id=f"uid-{name}")
      for name, uid in [("null", None), ("string", "10"), ("text", "invalid"),
                        ("float", 10.0), ("fraction", 10.5), ("true", True), ("false", False),
                        ("list", []), ("object", {}), ("zero", 0), ("negative", -10),
                        ("overflow", 2**63)]],
    *[pytest.param({**VALID_CLAIMS, "sub": sub}, id=f"sub-{name}")
      for name, sub in [("null", None), ("empty", ""), ("integer", 10),
                        ("list", []), ("object", {}), ("username", "alice"),
                        ("uppercase", "3D9EEA70-843E-43D6-A4AE-A9AAB091ACD1"), ("compact", ALICE_SUBJECT.replace("-", ""))]],
    *[pytest.param({**VALID_CLAIMS, "username": name}, id=f"username-{label}")
      for label, name in [("null", None), ("empty", ""), ("integer", 10), ("list", []), ("object", {})]],
]

@pytest.mark.parametrize("payload", INVALID_CLAIMS)
def test_invalid_claims_fail_closed_for_required_and_optional_auth(client, instance_db, payload):
    # 2B5A-AUTH-03/04/05/10, including malformed JSON claim shapes.
    assert_rejected(client, instance_db, create_access_token(payload))


@pytest.mark.parametrize("payload", INVALID_CLAIMS)
def test_claim_validation_precedes_teacher_lookup(payload):
    class NoIdentityLookup:
        def query(self, *args):
            pytest.fail("Invalid credential reached teacher identity lookup")

    credential = credentials(payload)
    assert get_current_user_optional(credential, NoIdentityLookup()) is None
    with pytest.raises(HTTPException) as error:
        get_current_user(credential, NoIdentityLookup())
    assert error.value.status_code == 401
    assert error.value.headers == {"WWW-Authenticate": "Bearer"}


@pytest.mark.parametrize("subject,uid,username", [(ALICE_SUBJECT, 20, "alice"), (ALICE_SUBJECT, 10, "bob"),
    (str(uuid4()), 10, "alice")], ids=["uid-mismatch", "username-mismatch", "missing-subject"])
def test_uid_and_username_must_resolve_the_same_existing_user(client, instance_db, subject, uid, username):
    # 2B5A-AUTH-06/10: both mismatched names exist, so neither may be returned.
    assert_rejected(client, instance_db, create_access_token({"sub": subject, "uid": uid, "username": username, "type": "teacher"}))


def test_deleted_account_token_cannot_reincarnate_with_reused_username(client, instance_db, password_hash):
    # 2B5A-AUTH-07/10: delete only test-fixture data; no deletion service change.
    token_a = login(client, "alice")
    assert decode_access_token(token_a)["uid"] == 10
    assert client.get("/api/users/me", headers=bearer(token_a)).status_code == 200
    instance_db.delete(instance_db.get(User, 10))
    instance_db.commit()
    assert_rejected(client, instance_db, token_a)
    instance_db.add(User(id=25, username="alice", hashed_password=password_hash, role="teacher", is_active=True))
    instance_db.commit()
    assert instance_db.get(User, 10) is None
    assert instance_db.get(User, 25).username == "alice"
    assert_rejected(client, instance_db, token_a)
    token_b = login(client, "alice")
    assert decode_access_token(token_b)["uid"] == 25
    response = client.get("/api/users/me", headers=bearer(token_b))
    assert response.status_code == 200
    assert response.json()["id"] == 25
    assert get_current_user_optional(HTTPAuthorizationCredentials(scheme="Bearer", credentials=token_b), instance_db).id == 25


def test_numeric_username_resolves_by_auth_subject(client, instance_db, password_hash):
    # 2B5A-AUTH-08: both User.id=12 and Student.id=12 exist beside User.username='12'.
    instance_db.add(User(id=12, username="different-user", hashed_password=password_hash, role="teacher", is_active=True))
    instance_db.commit()
    token = login(client, "12")
    response = client.get("/api/users/me", headers=bearer(token))
    assert response.status_code == 200
    assert response.json()["id"] == 99
    assert get_current_user_optional(HTTPAuthorizationCredentials(scheme="Bearer", credentials=token), instance_db).id == 99


def test_automatic_sqlite_id_reuse_cannot_resurrect_deleted_credential(client, instance_db, password_hash):
    # AUTH-SUBJECT-07/08: actual automatic allocation, with both id and name reused.
    account_a = User(username="recycled", hashed_password=password_hash, role="teacher", is_active=True)
    instance_db.add(account_a)
    instance_db.commit()
    old_id, old_subject = account_a.id, account_a.auth_subject
    token_a = login(client, "recycled")
    instance_db.delete(account_a)
    instance_db.commit()
    account_b = User(username="recycled", hashed_password=password_hash, role="teacher", is_active=True)
    instance_db.add(account_b)
    instance_db.commit()
    assert account_b.id == old_id
    assert account_b.username == "recycled"
    assert account_b.auth_subject != old_subject
    assert_rejected(client, instance_db, token_a)
    token_b = login(client, "recycled")
    assert decode_access_token(token_b)["sub"] == account_b.auth_subject
    response = client.get("/api/users/me", headers=bearer(token_b))
    assert response.status_code == 200
    assert response.json()["id"] == old_id
    assert get_current_user_optional(HTTPAuthorizationCredentials(scheme="Bearer", credentials=token_b), instance_db) is account_b


def test_inactive_instance_is_rejected(client, instance_db):
    # 2B5A-AUTH-09: otherwise-valid issued credential stops working on deactivation.
    token = login(client, "alice")
    instance_db.get(User, 10).is_active = False
    instance_db.commit()
    assert_rejected(client, instance_db, token)


def test_student_login_preserves_student_domain_and_cannot_enter_teacher(client, instance_db):
    # 2B5A-AUTH-11: real student login still has no teacher uid claim.
    response = client.post("/api/student/token", json={"login_code": "instance-student"})
    assert response.status_code == 200
    token = response.json()["access_token"]
    payload = decode_access_token(token)
    assert payload["type"] == "student"
    student = instance_db.get(Student, 12)
    owner = instance_db.get(User, student.user_id)
    assert payload["sub"] == student.auth_subject
    assert payload["sid"] == student.id
    assert payload["owner_uid"] == owner.id
    assert payload["owner_sub"] == owner.auth_subject
    assert "uid" not in payload
    response = client.get("/api/student/me", headers=bearer(token))
    assert response.status_code == 200
    assert response.json()["id"] == 12
    assert_rejected(client, instance_db, token)


def test_new_teacher_token_cannot_enter_student_domain(client):
    # 2B5A-AUTH-12: the numeric teacher username matches a real student ID.
    response = client.get("/api/student/me", headers=bearer(login(client, "12")))
    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"
