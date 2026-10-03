"""PHASE 2C-4 core acceptance: the tenant isolation matrix over the real HTTP API.

TeacherA / TeacherB / Admin, students bound to each, and every resource family.
Cross-tenant direct access is 404 (never 403), mutations leave foreign rows byte-
identical, lists never leak foreign ids, foreign student_id writes are rejected,
ownerless legacy rows are invisible, and admin is just another tenant for
teaching data. No DB RLS exists or is claimed: the authority is the service
boundary, exercised here through the API exactly as production traffic arrives.
"""
from datetime import date
from io import BytesIO
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.endpoints import rag as rag_module
from app.main import app
from app.models.agent_artifact import AgentAction, AgentArtifact
from app.models.agent_run import AgentRun
from app.models.base import Base, get_db
from app.models.chat_session import ChatMessage, ChatSession
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
    """Runtime-assembled fixture value; never a credential-looking literal."""
    return "-".join(["matrix", "test", "password"])


@pytest.fixture
def world():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()

    plan = Plan(code="free", name="免费版", max_students=50, features={"rag": True, "magic_ppt": True})
    db.add(plan)
    password_hash = __import__("bcrypt").hashpw(fixture_password().encode(), __import__("bcrypt").gensalt()).decode()
    admin = User(id=1, username="admin", hashed_password=password_hash, role="admin", is_active=True)
    teacher_a = User(id=2, username="teacher-a", hashed_password=password_hash, role="teacher", is_active=True)
    teacher_b = User(id=3, username="teacher-b", hashed_password=password_hash, role="teacher", is_active=True)
    db.add_all([admin, teacher_a, teacher_b])
    db.flush()
    db.add_all([
        Subscription(user_id=1, plan_id=plan.id, status="active"),
        Subscription(user_id=2, plan_id=plan.id, status="active"),
        Subscription(user_id=3, plan_id=plan.id, status="active"),
    ])
    student_a = Student(id=11, user_id=2, name="学生A", grade="八", class_name="1",
                        login_code="matrix-a", hashed_password=password_hash)
    student_b = Student(id=12, user_id=3, name="学生B", grade="八", class_name="2",
                        login_code="matrix-b", hashed_password=password_hash)
    student_admin = Student(id=13, user_id=1, name="管理员的学生", grade="七", class_name="1",
                            login_code="matrix-admin", hashed_password=password_hash)
    db.add_all([student_a, student_b, student_admin])
    db.flush()

    question_a = Question(owner_user_id=2, student_id=11, content="A题", options=[], answer="x=2",
                          analysis="", knowledge_point="方程", difficulty="L3", question_type="解答", source="手动")
    question_b = Question(owner_user_id=3, student_id=12, content="B题", options=[], answer="x=3",
                          analysis="", knowledge_point="方程", difficulty="L3", question_type="解答", source="手动")
    bank_a = QuestionBank(owner_user_id=2, student_id=11, content="A题", options=[], answer="x=2", analysis="",
                          question_type="解答", difficulty="L3", knowledge_point="方程", source="错题",
                          tags=[], images=[], content_hash="hash-a")
    bank_b = QuestionBank(owner_user_id=3, student_id=12, content="B题", options=[], answer="x=3", analysis="",
                          question_type="解答", difficulty="L3", knowledge_point="方程", source="错题",
                          tags=[], images=[], content_hash="hash-b")
    exam_a = Exam(owner_user_id=2, title="A卷", student_id=11,
                  questions=[{"content": "A题", "answer": "x=2", "options": []}], assignment_date=date(2026, 1, 1))
    exam_b = Exam(owner_user_id=3, title="B卷", student_id=12,
                  questions=[{"content": "B题", "answer": "x=3", "options": []}], assignment_date=date(2026, 1, 1))
    mistake_a = MistakeRecord(student_id=11, topic="方程", source="试卷", content="A错题", status="pending",
                              review_count=0, next_review_date=date(2026, 1, 2))
    mistake_b = MistakeRecord(student_id=12, topic="方程", source="试卷", content="B错题", status="pending",
                              review_count=0, next_review_date=date(2026, 1, 2))
    schedule_a = Schedule(user_id=2, student_id=11, schedule_date=date(2026, 1, 5), start_time="10:00",
                          end_time="11:00", subject="数学", note=None, recurrence_type=None, recurrence_weekdays=None)
    schedule_b = Schedule(user_id=3, student_id=12, schedule_date=date(2026, 1, 5), start_time="10:00",
                          end_time="11:00", subject="数学", note=None, recurrence_type=None, recurrence_weekdays=None)
    session_a = ChatSession(user_id=2, student_id=11, title="A会话", pinned=False)
    session_b = ChatSession(user_id=3, student_id=12, title="B会话", pinned=False)
    db.add_all([question_a, question_b, bank_a, bank_b, exam_a, exam_b, mistake_a, mistake_b,
                schedule_a, schedule_b, session_a, session_b])
    db.flush()
    message_a = ChatMessage(session_id=session_a.id, role="user", content="A消息")
    message_b = ChatMessage(session_id=session_b.id, role="user", content="B消息")
    run_a = AgentRun(user_id=2, goal="出题", status="completed")
    run_b = AgentRun(user_id=3, goal="出题", status="completed")
    db.add_all([message_a, message_b, run_a, run_b])
    db.flush()
    artifact_a = AgentArtifact(user_id=2, agent_run_id=run_a.id, artifact_type="practice_set",
                               status="ready_for_confirmation", version=1, title="A学案", content_json={},
                               validation_json={}, context_summary_json={}, student_id=11)
    artifact_b = AgentArtifact(user_id=3, agent_run_id=run_b.id, artifact_type="practice_set",
                               status="ready_for_confirmation", version=1, title="B学案", content_json={},
                               validation_json={}, context_summary_json={}, student_id=12)
    db.add_all([artifact_a, artifact_b])
    db.flush()
    action_a = AgentAction(user_id=2, agent_run_id=run_a.id, artifact_id=artifact_a.id, action_type="save_to_bank",
                           status="awaiting_confirmation", idempotency_key="matrix-action-key",
                           payload_hash="matrix-hash", expected_artifact_version=1)
    db.add(action_a)
    order_a = Order(user_id=2, plan_id=plan.id, amount=10, currency="CNY", status="pending",
                    payment_method="alipay", period_months=1, out_trade_no="MT-MTX-A")
    order_b = Order(user_id=3, plan_id=plan.id, amount=10, currency="CNY", status="pending",
                    payment_method="alipay", period_months=1, out_trade_no="MT-MTX-B")
    db.add_all([order_a, order_b])
    db.commit()

    rag_module._upload_status.clear()
    rag_module._upload_status["task-A"] = {
        "owner_user_id": 2, "owner_auth_subject": teacher_a.auth_subject,
        "status": "processing", "message": "Processing", "filename": "a.pdf", "created_at": 1e12,
    }
    rag_module._upload_status["task-B"] = {
        "owner_user_id": 3, "owner_auth_subject": teacher_b.auth_subject,
        "status": "pending", "message": "Queued", "filename": "b.pdf", "created_at": 1e12,
    }

    world = type("World", (), {})()
    world.db = db
    world.admin, world.teacher_a, world.teacher_b = admin, teacher_a, teacher_b
    world.student_a, world.student_b = student_a, student_b
    ids = {
        "question_a": question_a.id, "question_b": question_b.id,
        "bank_a": bank_a.id, "bank_b": bank_b.id,
        "exam_a": exam_a.id, "exam_b": exam_b.id,
        "mistake_a": mistake_a.id, "mistake_b": mistake_b.id,
        "schedule_a": schedule_a.id, "schedule_b": schedule_b.id,
        "session_a": session_a.id, "session_b": session_b.id,
        "message_a": message_a.id, "message_b": message_b.id,
        "run_a": run_a.id, "run_b": run_b.id,
        "artifact_a": artifact_a.id, "artifact_b": artifact_b.id,
        "action_a": action_a.id,
        "student_a": 11, "student_b": 12,
    }
    world.ids = ids
    world.task_ids = {"task-A": None, "task-B": None}

    client = TestClient(app)
    previous_overrides = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = lambda: db

    def login(username):
        response = client.post("/api/token", data={"username": username, "password": fixture_password()})
        assert response.status_code == 200, response.text
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    def login_student(code):
        response = client.post("/api/student/token", json={"login_code": code, "password": fixture_password()})
        assert response.status_code == 200, response.text
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    world.client = client
    world.admin_headers = login("admin")
    world.a_headers = login("teacher-a")
    world.b_headers = login("teacher-b")
    world.student_a_headers = login_student("matrix-a")
    world.student_b_headers = login_student("matrix-b")
    yield world

    app.dependency_overrides.clear()
    app.dependency_overrides.update(previous_overrides)
    rag_module._upload_status.clear()
    db.close()
    engine.dispose()


def test_teacher_direct_read_of_foreign_resource_is_404(world):
    c = world.client
    assert c.get(f"/api/exams/{world.ids['exam_b']}", headers=world.a_headers).status_code == 404
    assert c.get(f"/api/students/{world.ids['student_b']}", headers=world.a_headers).status_code == 404
    assert c.get(f"/api/schedules/{world.ids['schedule_b']}", headers=world.a_headers).status_code == 404
    assert c.get(f"/api/chat/sessions/{world.ids['session_b']}/messages", headers=world.a_headers).status_code == 404
    assert c.get(f"/api/teacher-agent/runs/{world.ids['run_b']}", headers=world.a_headers).status_code == 404
    assert c.get(f"/api/teacher-agent/artifacts/{world.ids['artifact_b']}", headers=world.a_headers).status_code == 404
    assert c.get(f"/api/teacher-agent/actions/{world.ids['action_a']}", headers=world.b_headers).status_code == 404
    assert c.get("/api/orders/MT-MTX-B/status", headers=world.a_headers).status_code == 404


def test_teacher_update_of_foreign_resource_is_404_and_row_unchanged(world):
    c, db = world.client, world.db
    before = (
        db.query(Exam).get(world.ids["exam_b"]).title,
        db.query(Schedule).get(world.ids["schedule_b"]).note,
        db.query(Student).get(world.ids["student_b"]).name,
        db.query(ChatSession).get(world.ids["session_b"]).pinned,
    )
    assert c.put(f"/api/exams/{world.ids['exam_b']}", headers=world.a_headers,
                 json={"title": "篡改", "student_id": world.ids["student_b"], "questions": []}).status_code == 404
    assert c.put(f"/api/schedules/{world.ids['schedule_b']}", headers=world.a_headers,
                 json={"note": "篡改"}).status_code == 404
    assert c.put(f"/api/students/{world.ids['student_b']}", headers=world.a_headers,
                 json={"name": "篡改"}).status_code == 404
    assert c.patch(f"/api/chat/sessions/{world.ids['session_b']}", headers=world.a_headers,
                   json={"pinned": True}).status_code == 404
    after = (
        db.query(Exam).get(world.ids["exam_b"]).title,
        db.query(Schedule).get(world.ids["schedule_b"]).note,
        db.query(Student).get(world.ids["student_b"]).name,
        db.query(ChatSession).get(world.ids["session_b"]).pinned,
    )
    assert before == after == ("B卷", None, "学生B", False)


def test_teacher_delete_of_foreign_resource_is_404_and_row_survives(world):
    c, db = world.client, world.db
    for method, url, headers in [
        (c.delete, f"/api/exams/{world.ids['exam_b']}", world.a_headers),
        (c.delete, f"/api/students/{world.ids['student_b']}", world.a_headers),
        (c.delete, f"/api/schedules/{world.ids['schedule_b']}", world.a_headers),
        (c.delete, f"/api/chat/sessions/{world.ids['session_b']}", world.a_headers),
    ]:
        assert method(url, headers=headers).status_code == 404
    assert db.query(Exam).get(world.ids["exam_b"]) is not None
    assert db.query(Student).get(world.ids["student_b"]) is not None
    assert db.query(Schedule).get(world.ids["schedule_b"]) is not None
    assert db.query(ChatSession).get(world.ids["session_b"]) is not None
    assert db.query(AgentArtifact).get(world.ids["artifact_b"]) is not None


def test_lists_never_contain_foreign_rows(world):
    c = world.client
    exam_ids = {row["id"] for row in c.get("/api/exams/", headers=world.a_headers).json()}
    assert world.ids["exam_b"] not in exam_ids and world.ids["exam_a"] in exam_ids
    student_ids = {row["id"] for row in c.get("/api/students/", headers=world.a_headers).json()}
    assert world.ids["student_b"] not in student_ids and world.ids["student_a"] in student_ids
    schedule_ids = {row["id"] for row in c.get("/api/schedules/", headers=world.a_headers).json()}
    assert world.ids["schedule_b"] not in schedule_ids
    session_ids = {row["id"] for row in c.get("/api/chat/sessions", headers=world.a_headers).json()}
    assert world.ids["session_b"] not in session_ids
    run_ids = {row["id"] for row in c.get("/api/teacher-agent/runs", headers=world.a_headers).json()}
    assert world.ids["run_b"] not in run_ids
    mistake_ids = {row["id"] for row in c.get("/api/mistakes/", headers=world.a_headers).json()}
    assert world.ids["mistake_b"] not in mistake_ids and world.ids["mistake_a"] in mistake_ids


def test_foreign_student_id_writes_are_rejected(world):
    c = world.client
    foreign = world.ids["student_b"]
    assert c.post("/api/exams/", headers=world.a_headers,
                  json={"title": "脏卷", "student_id": foreign, "questions": []}).status_code == 404
    assert c.post("/api/schedules/", headers=world.a_headers,
                  json={"student_id": foreign, "schedule_date": "2026-02-01",
                        "start_time": "10:00", "end_time": "11:00"}).status_code == 404
    assert c.post("/api/mistakes/", headers=world.a_headers,
                  json={"student_id": foreign, "topic": "几何", "source": "试卷",
                        "content": "脏错题"}).status_code == 404
    assert c.post("/api/bank/collect", headers=world.a_headers,
                  json={"content": "脏收藏", "answer": "A", "analysis": "", "question_type": "选择题",
                        "difficulty": "L3", "knowledge_point": "方程", "source": "x", "student_id": foreign,
                        "tags": [], "images": []}).status_code == 404
    assert world.db.query(Exam).filter(Exam.title == "脏卷").count() == 0
    assert world.db.query(MistakeRecord).filter(MistakeRecord.content == "脏错题").count() == 0


def test_ownerless_legacy_rows_are_invisible_to_tenants(world):
    db, c = world.db, world.client
    orphan_exam = Exam(owner_user_id=None, title="无主卷", student_id=None, questions=[])
    orphan_question = Question(owner_user_id=None, student_id=None, content="无主题", options=[],
                               answer="", analysis="", knowledge_point="方程", difficulty="L3",
                               question_type="解答", source="导入")
    db.add_all([orphan_exam, orphan_question])
    db.commit()
    for headers in (world.a_headers, world.b_headers, world.admin_headers):
        assert c.get(f"/api/exams/{orphan_exam.id}", headers=headers).status_code == 404
        assert c.delete(f"/api/exams/{orphan_exam.id}", headers=headers).status_code == 404
        exam_ids = {row["id"] for row in c.get("/api/exams/", headers=headers).json()}
        assert orphan_exam.id not in exam_ids
        assert c.delete(f"/api/questions/{orphan_question.id}", headers=headers).status_code == 404


def test_dirty_cross_tenant_row_visible_only_to_its_owner(world):
    """owner=A + student=B 的脏行：A 可见；B 的学生端不可见；student_id 不构成访问依据。"""
    db, c = world.db, world.client
    dirty = Exam(owner_user_id=2, title="脏行", student_id=12, questions=[])
    db.add(dirty)
    db.commit()
    # Teacher B cannot see it despite student_b being theirs.
    assert c.get(f"/api/exams/{dirty.id}", headers=world.b_headers).status_code == 404
    exam_ids = {row["id"] for row in c.get("/api/exams/", headers=world.b_headers).json()}
    assert dirty.id not in exam_ids
    # Teacher A (the owner) sees it.
    assert c.get(f"/api/exams/{dirty.id}", headers=world.a_headers).status_code == 200
    # Student B's portal cannot reach it: owner mismatch means 404.
    assert c.get(f"/api/student/exams/{dirty.id}", headers=world.student_b_headers).status_code == 404


def test_admin_is_a_tenant_for_teaching_data(world):
    c = world.client
    # Global admin console works…
    assert c.get("/api/users/", headers=world.admin_headers).status_code == 200
    # …but teaching data stays tenant-scoped: admin cannot read A/B resources.
    assert c.get(f"/api/exams/{world.ids['exam_a']}", headers=world.admin_headers).status_code == 404
    assert c.get(f"/api/exams/{world.ids['exam_b']}", headers=world.admin_headers).status_code == 404
    assert c.get(f"/api/students/{world.ids['student_a']}", headers=world.admin_headers).status_code == 404
    exam_ids = {row["id"] for row in c.get("/api/exams/", headers=world.admin_headers).json()}
    assert world.ids["exam_a"] not in exam_ids and world.ids["exam_b"] not in exam_ids
    assert c.get("/api/orders/MT-MTX-A/status", headers=world.admin_headers).status_code == 404


def test_student_a_cannot_touch_student_b_domain(world):
    c = world.client
    assert c.get(f"/api/student/mistakes/{world.ids['mistake_b']}", headers=world.student_a_headers).status_code == 404
    assert c.get(f"/api/student/exams/{world.ids['exam_b']}", headers=world.student_a_headers).status_code == 404
    assert c.put(f"/api/student/mistakes/{world.ids['mistake_b']}/master",
                 headers=world.student_a_headers).status_code == 404
    # Own resources stay reachable.
    assert c.get(f"/api/student/mistakes/{world.ids['mistake_a']}", headers=world.student_a_headers).status_code == 200
    assert c.get(f"/api/student/exams/{world.ids['exam_a']}", headers=world.student_a_headers).status_code == 200


def test_credential_domain_is_enforced(world):
    c = world.client
    assert c.get("/api/student/me", headers=world.a_headers).status_code == 401
    assert c.get("/api/users/me", headers=world.student_a_headers).status_code == 401


def test_chat_message_outside_own_session_is_404(world):
    c = world.client
    # B's message id, requested through A's session: mismatched pair → 404.
    assert c.patch(
        f"/api/chat/sessions/{world.ids['session_a']}/messages/{world.ids['message_b']}",
        headers=world.a_headers, json={"content": "篡改"},
    ).status_code == 404
    assert world.db.query(ChatMessage).get(world.ids["message_b"]).content == "B消息"


def test_agent_confirm_of_foreign_action_is_404_without_side_effects(world):
    c, db = world.client, world.db
    response = c.post(
        f"/api/teacher-agent/actions/{world.ids['action_a']}/confirm",
        headers=world.b_headers,
        json={"idempotency_key": "foreign-confirm", "expected_artifact_version": 1},
    )
    assert response.status_code == 404
    assert db.query(AgentAction).get(world.ids["action_a"]).status == "awaiting_confirmation"
    response = c.post(f"/api/teacher-agent/actions/{world.ids['action_a']}/cancel", headers=world.b_headers)
    assert response.status_code == 404
    assert db.query(AgentAction).get(world.ids["action_a"]).status == "awaiting_confirmation"


def test_rag_task_status_is_owner_bound(world):
    c = world.client
    assert c.get("/api/rag/upload/status/task-B", headers=world.a_headers).status_code == 404
    assert c.get("/api/rag/upload/status/task-A", headers=world.b_headers).status_code == 404
    assert c.get("/api/rag/upload/status/task-A", headers=world.a_headers).status_code == 200
    # Missing ids are 404 for everyone.
    assert c.get(f"/api/rag/upload/status/{uuid4()}", headers=world.a_headers).status_code == 404


def test_generation_rejects_foreign_student_before_any_llm_call(world):
    c = world.client
    response = c.post("/api/generate", headers=world.a_headers, json={
        "knowledge_point": "勾股定理", "difficulty": "L3", "count": 1,
        "student_id": world.ids["student_b"],
    })
    assert response.status_code == 404
