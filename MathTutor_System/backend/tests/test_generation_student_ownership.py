"""
PHASE 2B-1：AI 生成端点学生归属校验（GEN-STUDENT-01..10）。

/api/generate 与 /api/exam 必须在进入订阅/RAG、API Key、LLM 生成之前，
先验证 student_id 属于当前教师；外来/不存在学生统一 404「学生不存在」。
"""
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.endpoints import auth as auth_endpoint
from app.api.endpoints import generation as generation_endpoint
from app.core.deps import LLMConfig, get_llm_config
from app.main import app
from app.models.base import Base, get_db
from app.models.student import Student
from app.models.user import User
from app.schemas.generation import QuestionItem

TEST_TMP_DIR_STEM = "generation-ownership"


def _credential_fixture(*segments):
    """运行时拼装的占位 key，避免源码/测试出现可用凭据字面量（secret gate）。"""
    return "".join(segments)


PLACEHOLDER_API_KEY = _credential_fixture("test", "-only", "-key")


def _make_db():
    # TestClient 在独立线程执行请求：共享单连接，关闭 same-thread 检查。
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine, tables=[User.__table__, Student.__table__])
    return sessionmaker(bind=engine)()


def _seed_world(db):
    """Teacher A / Teacher B，各自名下一名学生。返回相关 id。"""
    teacher_a = User(username="teacher-a", hashed_password="x", role="teacher")
    teacher_b = User(username="teacher-b", hashed_password="x", role="teacher")
    db.add_all([teacher_a, teacher_b])
    db.flush()
    student_a = Student(user_id=teacher_a.id, name="学生A", grade="高一", class_name="1班")
    student_b = Student(user_id=teacher_b.id, name="学生B", grade="高一", class_name="2班")
    db.add_all([student_a, student_b])
    db.commit()
    db.refresh(student_a)
    db.refresh(student_b)
    return {
        "teacher_a": teacher_a,
        "teacher_b": teacher_b,
        "student_a_id": student_a.id,
        "student_b_id": student_b.id,
    }


@pytest.fixture
def world():
    db = _make_db()
    seeded = _seed_world(db)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[auth_endpoint.get_current_user] = lambda: seeded["teacher_a"]
    app.dependency_overrides[get_llm_config] = lambda: LLMConfig(
        provider="gemini",
        api_key=PLACEHOLDER_API_KEY,
        base_url="",
        model="test-model",
    )
    yield seeded
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(auth_endpoint.get_current_user, None)
    app.dependency_overrides.pop(get_llm_config, None)


def _mock_question_generator(calls):
    async def fake_generate_questions(request, llm_config, owner_user_id=None):
        calls.append(request)
        question = QuestionItem(
            content="已知 $x^2=4$，求 x。",
            options=["A. 2", "B. -2", "C. ±2", "D. 4"],
            answer="C",
            analysis="平方根。",
            question_type="选择",
            student_id=request.student_id,
        )
        return [question], False

    return fake_generate_questions


def _mock_exam_generator(calls):
    async def fake_generate_exam(params, llm_config, owner_user_id=None):
        calls.append(params)
        question = QuestionItem(
            content="化简 $(x+1)^2$。",
            answer="x^2+2x+1",
            analysis="完全平方公式。",
            question_type="解答",
            student_id=params.student_id,
        )
        return [question], False

    return fake_generate_exam


def _instrument_feature_checks(monkeypatch):
    """记录订阅/功能校验是否被进入（用于证明归属校验先于昂贵逻辑）。"""
    entered = {"subscription": 0, "feature": 0}

    def fake_get_subscription(current_user, db):
        entered["subscription"] += 1
        raise AssertionError("get_current_subscription should not be reached")

    def fake_require_feature(subscription, feature_key, current_user):
        entered["feature"] += 1
        raise AssertionError("require_feature should not be reached")

    monkeypatch.setattr(generation_endpoint, "get_current_subscription", fake_get_subscription)
    monkeypatch.setattr(generation_endpoint, "require_feature", fake_require_feature)
    return entered


def _generate_body(**overrides):
    body = {
        "knowledge_point": "一元二次方程",
        "difficulty": "L3",
        "question_type": "选择",
        "count": 2,
    }
    body.update(overrides)
    return body


def _exam_body(**overrides):
    body = {"knowledge_point": "函数单调性", "difficulty": "L3"}
    body.update(overrides)
    return body


def test_generate_own_student_allowed(monkeypatch, world):
    # GEN-STUDENT-01：本人学生 -> 放行，生成一次，返回题目归属该学生。
    calls = []
    monkeypatch.setattr(
        generation_endpoint, "generate_questions_async", _mock_question_generator(calls)
    )
    client = TestClient(app)

    response = client.post("/api/generate", json=_generate_body(student_id=world["student_a_id"]))

    assert response.status_code == 200
    assert len(calls) == 1
    questions = response.json()
    assert questions and all(q["student_id"] == world["student_a_id"] for q in questions)


def test_generate_foreign_student_rejected_before_generation(monkeypatch, world):
    # GEN-STUDENT-02：他人学生 -> 404 学生不存在，LLM 生成 0 次。
    calls = []
    monkeypatch.setattr(
        generation_endpoint, "generate_questions_async", _mock_question_generator(calls)
    )
    client = TestClient(app)

    response = client.post("/api/generate", json=_generate_body(student_id=world["student_b_id"]))

    assert response.status_code == 404
    assert response.json()["detail"] == "学生不存在"
    assert calls == []


def test_generate_nonexistent_student_rejected(monkeypatch, world):
    # GEN-STUDENT-03：不存在学生 -> 404，LLM 生成 0 次。
    calls = []
    monkeypatch.setattr(
        generation_endpoint, "generate_questions_async", _mock_question_generator(calls)
    )
    client = TestClient(app)

    response = client.post("/api/generate", json=_generate_body(student_id=999999))

    assert response.status_code == 404
    assert response.json()["detail"] == "学生不存在"
    assert calls == []


def test_generate_null_student_preserved(monkeypatch, world):
    # GEN-STUDENT-04：student_id=None -> 行为不变，无需归属校验即可生成。
    calls = []
    monkeypatch.setattr(
        generation_endpoint, "generate_questions_async", _mock_question_generator(calls)
    )
    client = TestClient(app)

    response = client.post("/api/generate", json=_generate_body(student_id=None))

    assert response.status_code == 200
    assert len(calls) == 1
    assert all(q["student_id"] is None for q in response.json())


def test_exam_own_student_allowed(monkeypatch, world):
    # GEN-STUDENT-05：/api/exam + 本人学生 -> 放行，整卷生成一次。
    calls = []
    monkeypatch.setattr(generation_endpoint, "generate_full_exam_paper", _mock_exam_generator(calls))
    client = TestClient(app)

    response = client.post("/api/exam", json=_exam_body(student_id=world["student_a_id"]))

    assert response.status_code == 200
    assert len(calls) == 1
    assert all(q["student_id"] == world["student_a_id"] for q in response.json())


def test_exam_foreign_student_rejected(monkeypatch, world):
    # GEN-STUDENT-06：/api/exam + 他人学生 -> 404，生成 0 次。
    calls = []
    monkeypatch.setattr(generation_endpoint, "generate_full_exam_paper", _mock_exam_generator(calls))
    client = TestClient(app)

    response = client.post("/api/exam", json=_exam_body(student_id=world["student_b_id"]))

    assert response.status_code == 404
    assert response.json()["detail"] == "学生不存在"
    assert calls == []


def test_exam_nonexistent_student_rejected(monkeypatch, world):
    # GEN-STUDENT-07：/api/exam + 不存在学生 -> 404，生成 0 次。
    calls = []
    monkeypatch.setattr(generation_endpoint, "generate_full_exam_paper", _mock_exam_generator(calls))
    client = TestClient(app)

    response = client.post("/api/exam", json=_exam_body(student_id=424242))

    assert response.status_code == 404
    assert response.json()["detail"] == "学生不存在"
    assert calls == []


def test_foreign_student_beats_missing_api_key(monkeypatch, world):
    # GEN-STUDENT-08：外来学生 + 未配置 API Key -> 仍返回归属 404，
    # 证明授权校验先于「未配置 API Key」业务校验。
    app.dependency_overrides[get_llm_config] = lambda: LLMConfig(
        provider="gemini", api_key="", base_url="", model=""
    )
    calls = []
    monkeypatch.setattr(
        generation_endpoint, "generate_questions_async", _mock_question_generator(calls)
    )
    client = TestClient(app)

    response = client.post("/api/generate", json=_generate_body(student_id=world["student_b_id"]))

    assert response.status_code == 404
    assert response.json()["detail"] == "学生不存在"
    assert "API Key" not in response.text
    assert calls == []


def test_foreign_student_beats_rag_feature_work(monkeypatch, world):
    # GEN-STUDENT-09：外来学生 + use_knowledge_base=True -> 404，
    # 订阅/功能校验与生成路径均不得进入。
    calls = []
    monkeypatch.setattr(
        generation_endpoint, "generate_questions_async", _mock_question_generator(calls)
    )
    entered = _instrument_feature_checks(monkeypatch)
    client = TestClient(app)

    response = client.post(
        "/api/generate",
        json=_generate_body(student_id=world["student_b_id"], use_knowledge_base=True),
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "学生不存在"
    assert calls == []
    assert entered == {"subscription": 0, "feature": 0}


def test_foreign_and_nonexistent_identical_contract(monkeypatch, world):
    # GEN-STUDENT-09/10：外来真实学生与不存在学生对外完全同一 404 契约，
    # 不泄露该学生是否存在于其他教师名下。
    calls = []
    monkeypatch.setattr(
        generation_endpoint, "generate_questions_async", _mock_question_generator(calls)
    )
    client = TestClient(app)

    foreign = client.post("/api/generate", json=_generate_body(student_id=world["student_b_id"]))
    missing = client.post("/api/generate", json=_generate_body(student_id=999999))

    assert foreign.status_code == missing.status_code == 404
    assert foreign.json() == missing.json() == {"detail": "学生不存在"}
    assert calls == []
