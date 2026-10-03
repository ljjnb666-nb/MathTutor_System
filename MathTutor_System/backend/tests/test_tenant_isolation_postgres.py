"""POSTGRES_TENANT_ISOLATION gate: the matrix core runs against real PostgreSQL 16.

SQLite matrices prove the logic; this gate proves the boundary also holds with a
real server (sequences, FK enforcement, transactional visibility). Skips are
forbidden in CI: TUTORPRO_TEST_POSTGRES_URL must exist where this runs.
"""
import os
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from app.api.endpoints import rag as rag_module
from app.main import app
from app.models.base import Base, get_db
from app.models.exam import Exam
from app.models.mistake import MistakeRecord
from app.models.order import Order
from app.models.plan import Plan
from app.models.question import Question
from app.models.question_bank import QuestionBank
from app.models.schedule import Schedule
from app.models.student import Student
from app.models.subscription import Subscription
from app.models.user import User


def fixture_password() -> str:
    return "-".join(["matrix", "pg", "password"])


@pytest.fixture
def pg_world():
    root_url = os.getenv("TUTORPRO_TEST_POSTGRES_URL")
    if not root_url:
        pytest.skip("NOT_RUN_ENV_UNAVAILABLE: TUTORPRO_TEST_POSTGRES_URL")
    root = create_engine(root_url)
    schema = "phase2c4_matrix_" + uuid4().hex
    with root.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    url = make_url(root_url).update_query_dict({"options": f"-csearch_path={schema}"})
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()

    plan = Plan(id=1, code="free", name="免费版", max_students=50, features={"rag": True, "magic_ppt": True})
    db.add(plan)
    db.flush()
    import bcrypt

    password_hash = bcrypt.hashpw(fixture_password().encode(), bcrypt.gensalt()).decode()
    admin = User(id=1, username="pg-admin", auth_subject=str(uuid4()), hashed_password=password_hash, role="admin", is_active=True)
    teacher_a = User(id=2, username="pg-teacher-a", auth_subject=str(uuid4()), hashed_password=password_hash, role="teacher", is_active=True)
    teacher_b = User(id=3, username="pg-teacher-b", auth_subject=str(uuid4()), hashed_password=password_hash, role="teacher", is_active=True)
    db.add_all([admin, teacher_a, teacher_b])
    db.flush()
    db.add_all([
        Subscription(user_id=1, plan_id=1, status="active"),
        Subscription(user_id=2, plan_id=1, status="active"),
        Subscription(user_id=3, plan_id=1, status="active"),
    ])
    student_a = Student(id=11, user_id=2, auth_subject=str(uuid4()), name="PG学生A", grade="八", class_name="1",
                        login_code="pg-a", hashed_password=password_hash)
    student_b = Student(id=12, user_id=3, auth_subject=str(uuid4()), name="PG学生B", grade="八", class_name="2",
                        login_code="pg-b", hashed_password=password_hash)
    db.add_all([student_a, student_b])
    db.flush()
    exam_a = Exam(owner_user_id=2, title="PG-A卷", student_id=11, questions=[{"content": "题", "answer": "1", "options": []}])
    exam_b = Exam(owner_user_id=3, title="PG-B卷", student_id=12, questions=[{"content": "题", "answer": "2", "options": []}])
    question_b = Question(owner_user_id=3, student_id=12, content="PG-B题", options=[], answer="2", analysis="",
                          knowledge_point="方程", difficulty="L3", question_type="解答", source="导入")
    bank_b = QuestionBank(owner_user_id=3, student_id=12, content="PG-B题", options=[], answer="2", analysis="",
                          question_type="解答", difficulty="L3", knowledge_point="方程", source="错题",
                          tags=[], images=[], content_hash="pg-hash-b")
    mistake_b = MistakeRecord(student_id=12, topic="方程", source="试卷", content="PG错题", status="pending",
                              review_count=0, next_review_date=None)
    schedule_b = Schedule(user_id=3, student_id=12, schedule_date=__import__("datetime").date(2026, 3, 1),
                          start_time="09:00", end_time="10:00", subject="数学")
    order_b = Order(user_id=3, plan_id=1, amount=10, currency="CNY", status="pending",
                    payment_method="alipay", period_months=1, out_trade_no="MT-PG-B")
    orphan = Exam(owner_user_id=None, title="PG无主卷", student_id=None, questions=[])
    db.add_all([exam_a, exam_b, question_b, bank_b, mistake_b, schedule_b, order_b, orphan])
    db.commit()

    rag_module._upload_status.clear()
    rag_module._upload_status["pg-task-A"] = {
        "owner_user_id": 2, "owner_auth_subject": teacher_a.auth_subject,
        "status": "processing", "message": "Processing", "filename": "a.pdf", "created_at": 1e12,
    }

    world = type("World", (), {})()
    world.db = db
    client = TestClient(app)
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = lambda: db

    def teacher(name):
        response = client.post("/api/token", data={"username": name, "password": fixture_password()})
        assert response.status_code == 200
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    world.client = client
    world.a_headers = teacher("pg-teacher-a")
    world.b_headers = teacher("pg-teacher-b")
    world.admin_headers = teacher("pg-admin")

    yield world, db

    app.dependency_overrides.clear()
    app.dependency_overrides.update(previous)
    rag_module._upload_status.clear()
    db.close()
    engine.dispose()
    with root.begin() as connection:
        connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
    root.dispose()


def test_pg_foreign_exam_is_404_and_immutable(pg_world):
    world, db = pg_world
    c = world.client
    exam_b_id = db.query(Exam).filter(Exam.title == "PG-B卷").one().id
    assert c.get(f"/api/exams/{exam_b_id}", headers=world.a_headers).status_code == 404
    assert c.put(f"/api/exams/{exam_b_id}", headers=world.a_headers,
                 json={"title": "篡改", "student_id": None, "questions": []}).status_code == 404
    assert c.delete(f"/api/exams/{exam_b_id}", headers=world.a_headers).status_code == 404
    assert db.query(Exam).filter(Exam.id == exam_b_id).one().title == "PG-B卷"


def test_pg_foreign_student_write_rejected(pg_world):
    world, db = pg_world
    c = world.client
    student_b_id = db.query(Student).filter(Student.name == "PG学生B").one().id
    assert c.post("/api/exams/", headers=world.a_headers,
                  json={"title": "PG脏卷", "student_id": student_b_id, "questions": []}).status_code == 404
    assert db.query(Exam).filter(Exam.title == "PG脏卷").count() == 0


def test_pg_ownerless_and_foreign_lists(pg_world):
    world, db = pg_world
    c = world.client
    exam_ids = {row["id"] for row in c.get("/api/exams/", headers=world.a_headers).json()}
    orphan_id = db.query(Exam).filter(Exam.title == "PG无主卷").one().id
    b_id = db.query(Exam).filter(Exam.title == "PG-B卷").one().id
    assert orphan_id not in exam_ids and b_id not in exam_ids
    bank_ids = {row["id"] for row in c.get("/api/bank/", headers=world.a_headers).json()}
    b_bank = db.query(QuestionBank).filter(QuestionBank.content == "PG-B题").one().id
    assert b_bank not in bank_ids


def test_pg_admin_tenant_semantics(pg_world):
    world, db = pg_world
    c = world.client
    a_exam = db.query(Exam).filter(Exam.title == "PG-A卷").one().id
    assert c.get("/api/users/", headers=world.admin_headers).status_code == 200
    assert c.get(f"/api/exams/{a_exam}", headers=world.admin_headers).status_code == 404


def test_pg_student_portal_domain(pg_world):
    world, db = pg_world
    c = world.client
    b_exam = db.query(Exam).filter(Exam.title == "PG-B卷").one().id
    b_mistake = db.query(MistakeRecord).filter(MistakeRecord.content == "PG错题").one().id
    student_a = db.query(Student).filter(Student.name == "PG学生A").one()
    response = c.post("/api/student/token",
                      json={"login_code": "pg-a", "password": fixture_password()})
    assert response.status_code == 200
    student_headers = {"Authorization": f"Bearer {response.json()['access_token']}"}
    assert c.get(f"/api/student/exams/{b_exam}", headers=student_headers).status_code == 404
    assert c.get(f"/api/student/mistakes/{b_mistake}", headers=student_headers).status_code == 404


def test_pg_rag_task_and_order_owner_bound(pg_world):
    world, db = pg_world
    c = world.client
    assert c.get("/api/rag/upload/status/pg-task-A", headers=world.b_headers).status_code == 404
    assert c.get("/api/rag/upload/status/pg-task-A", headers=world.a_headers).status_code == 200
    assert c.get("/api/orders/MT-PG-B/status", headers=world.a_headers).status_code == 404
    assert c.get("/api/orders/MT-PG-B/status", headers=world.b_headers).status_code == 200
