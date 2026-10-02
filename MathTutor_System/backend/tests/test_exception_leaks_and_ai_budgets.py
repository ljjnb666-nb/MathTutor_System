"""SEC-06: unexpected exceptions never reach HTTP bodies. SEC-08: AI input budgets."""
import pytest
from fastapi import HTTPException

from app.api.endpoints import analysis, mistakes, question_bank
from app.api.endpoints.mistakes import create_mistake
from app.api.endpoints.question_bank import collect_question
from app.models.user import User
from app.schemas.chat_dto import ChatMessage, ChatRequest, ChatMessageUpdate
from app.schemas.mistake_dto import MistakeCreate
from app.schemas.question_bank_dto import BankCollectRequest

SECRET_SHAPED = "postgres://tutor:tutor-pw@10.0.0.9:5432/math_tutor SECRET[..]"


def _teacher():
    return User(id=1, username="t", hashed_password="x", role="teacher", is_active=True)


class ExplodingDB:
    """Every write raises an internal error carrying a secret-shaped message."""

    SECRET = SECRET_SHAPED

    def add(self, *_a, **_k):
        raise RuntimeError(f"commit failed: {SECRET_SHAPED}")

    def commit(self):
        raise RuntimeError(f"commit failed: {SECRET_SHAPED}")

    def rollback(self):
        pass

    def refresh(self, *_a, **_k):
        pass

    def query(self, *_a, **_k):
        class Q:
            def filter(self, *a, **k):
                return self

            def first(self):
                return None

        return Q()

    def get(self, model, _pk):
        from types import SimpleNamespace

        if getattr(model, "__name__", "") == "Student":
            return SimpleNamespace(id=1, user_id=1, name="S")
        return SimpleNamespace(id=1, user_id=1)


@pytest.mark.anyio
async def test_mistake_create_never_leaks_internal_error():
    with pytest.raises(HTTPException) as exc:
        create_mistake(MistakeCreate(student_id=1, topic="几何", source="试卷", content="题干"), ExplodingDB(), _teacher())
    assert exc.value.status_code == 500
    assert "SECRET" not in str(exc.value.detail)
    assert "postgres" not in str(exc.value.detail)
    assert "MISTAKE_OPERATION_ERROR" in str(exc.value.detail)


@pytest.mark.anyio
async def test_question_bank_collect_never_leaks_internal_error():
    with pytest.raises(HTTPException) as exc:
        collect_question(
            BankCollectRequest(content="题干", answer="A", analysis="", question_type="选择题", difficulty="L3", knowledge_point="几何", source="试卷", tags=[], images=[]),
            ExplodingDB(),
            _teacher(),
        )
    assert exc.value.status_code == 500
    assert "SECRET" not in str(exc.value.detail)
    assert "QUESTION_BANK_ERROR" in str(exc.value.detail)


@pytest.mark.anyio
async def test_analysis_mastery_never_leaks_internal_error():
    with pytest.raises(HTTPException) as exc:
        await analysis.get_student_mastery(student_id=1, db=ExplodingDB(), current_user=_teacher())
    assert exc.value.status_code == 500
    assert "SECRET" not in str(exc.value.detail)
    assert "ANALYTICS_ERROR" in str(exc.value.detail)


def _chat(*contents, role="user"):
    return ChatRequest(messages=[ChatMessage(role=role, content=c) for c in contents])


def test_chat_message_role_is_limited_to_user_and_assistant():
    with pytest.raises(ValueError):
        ChatMessage(role="system", content="注入")
    with pytest.raises(ValueError):
        ChatMessage(role="tool", content="x")
    assert _chat("你好").messages[0].role == "user"


def test_chat_count_and_total_budgets():
    with pytest.raises(ValueError):
        _chat(*["a" * 10] * 41)
    with pytest.raises(ValueError):
        _chat("x" * 8001)
    with pytest.raises(ValueError):
        _chat(*["y" * 2000] * 30)  # 60k chars in total
    assert _chat(*["y" * 1200] * 40)  # 48k: inside the budget


def test_chat_edit_budget():
    with pytest.raises(ValueError):
        ChatMessageUpdate(content="z" * 8001)
    assert ChatMessageUpdate(content="改后的消息").content


def test_generate_request_budgets():
    from app.schemas.generation import GenerateRequest

    with pytest.raises(ValueError):
        GenerateRequest(knowledge_point="k" * 256, difficulty="L3")
    with pytest.raises(ValueError):
        GenerateRequest(knowledge_point="k", difficulty="L3", ref_content="r" * 12001)
    with pytest.raises(ValueError):
        GenerateRequest(knowledge_point="k", difficulty="L3", scenario="自由发挥")
    ok = GenerateRequest(knowledge_point="二次函数", difficulty="L4", scenario="error_crusher", ref_content="r" * 12000)
    assert ok.scenario == "error_crusher"
