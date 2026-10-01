"""PHASE 2B-4: authenticated admin creation, including fresh database denial."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.core.security import create_access_token, get_password_hash
from app.main import app
from app.models.base import Base, get_db
from app.models.plan import Plan
from app.models.student import Student
from app.models.subscription import Subscription
from app.models.user import User


@pytest.fixture
def creation_db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine)() as db:
        db.add(Plan(code="free", name="Free", max_students=5, features={}))
        db.commit()
        yield db
    engine.dispose()


@pytest.fixture
def client(creation_db):
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = lambda: creation_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)


def seed_user(db, role):
    user = User(username="12", hashed_password=get_password_hash("creation-test-password"), role=role, is_active=True)
    db.add(user)
    db.flush()
    db.add(Subscription(user_id=user.id, plan_id=db.query(Plan).one().id, status="active"))
    db.commit()
    return user


def create_request(client, payload):
    headers = {"Authorization": f"Bearer {create_access_token(payload)}"} if payload else {}
    return client.post("/api/users/", headers=headers,
                       json={"username": "new-user", "password": "creation-test-password", "role": "admin"})


def counts(db):
    return db.query(User).count(), db.query(Subscription).count()


@pytest.mark.parametrize("payload", [None, {"sub": "12", "type": "student"},
                                     {"sub": "admin", "type": "other"}, {"sub": "admin"}],
                         ids=["anonymous", "student", "unknown-type", "nonexistent-legacy"])
def test_fresh_database_cannot_bootstrap_through_http(client, creation_db, payload):
    # 2B4-AUTH-01/02/03/04/09: free plan exists, but denial must create nothing.
    assert counts(creation_db) == (0, 0)
    response = create_request(client, payload)
    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"
    assert counts(creation_db) == (0, 0)


@pytest.mark.parametrize("payload,role,status", [(None, "admin", 401),
    ({"sub": "12", "type": "teacher"}, "teacher", 403),
    ({"sub": "12", "type": "student"}, "admin", 401)],
    ids=["anonymous-existing-db", "non-admin-teacher", "student-admin-collision"])
def test_denied_creation_has_no_user_or_subscription_mutation(client, creation_db, payload, role, status):
    # 2B4-AUTH-05/08/09: existing subscriptions and real student/admin collision.
    user = seed_user(creation_db, role)
    creation_db.add(Student(id=12, user_id=user.id, name="Collision student", grade="8",
                            class_name="1", login_code="creation-student"))
    creation_db.commit()
    before = counts(creation_db)
    response = create_request(client, payload)
    assert response.status_code == status
    if status == 401:
        assert response.headers.get("www-authenticate") == "Bearer"
    else:
        assert response.json()["detail"] == "Not enough privileges"
    assert counts(creation_db) == before
    assert creation_db.query(User).filter(User.username == "new-user").first() is None


@pytest.mark.parametrize("payload", [{"sub": "12", "type": "teacher"}, {"sub": "12"}],
                         ids=["typed-admin", "legacy-admin"])
def test_admin_creation_preserves_default_subscription(client, creation_db, payload):
    # 2B4-AUTH-06/07: real authentication and existing service with a free plan.
    seed_user(creation_db, "admin")
    response = create_request(client, payload)
    assert response.status_code == 201
    user = creation_db.query(User).filter(User.username == "new-user").one()
    assert response.json()["id"] == user.id
    assert user.role == "admin"
    assert counts(creation_db) == (2, 2)
    sub = creation_db.query(Subscription).filter(Subscription.user_id == user.id).one()
    assert sub.plan_id == creation_db.query(Plan).filter(Plan.code == "free").one().id
    assert sub.status == "active"
    assert sub.period_end is None
