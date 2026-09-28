from datetime import timedelta

import pytest
from sqlalchemy import create_engine, event, inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.agent_artifact import AgentAction, AgentArtifact
from app.models.agent_run import AgentRun
from app.models.chat_session import ChatMessage, ChatSession
from app.models.order import Order
from app.models.plan import Plan
from app.models.schedule import Schedule
from app.models.student import Student
from app.models.question_bank import QuestionBank
from app.models.subscription import Subscription
from app.models.subscription_history import SubscriptionHistory
from app.models.user import User
from app.services.user_admin_service import (
    batch_set_or_extend_subscriptions,
    delete_user_and_related,
    set_user_subscription,
    utc_now,
)


def make_db():
    engine = create_engine("sqlite:///:memory:")

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection, _):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            AgentRun.__table__,
            AgentArtifact.__table__,
            AgentAction.__table__,
            Plan.__table__,
            Subscription.__table__,
            SubscriptionHistory.__table__,
            Student.__table__,
            QuestionBank.__table__,
            ChatSession.__table__,
            ChatMessage.__table__,
            Order.__table__,
            Schedule.__table__,
        ],
    )
    SessionLocal = sessionmaker(bind=engine)
    return SessionLocal()


def add_user(db, user_id: int, username: str, role: str = "teacher") -> User:
    user = User(id=user_id, username=username, hashed_password="x", role=role, is_active=True)
    db.add(user)
    db.commit()
    return user


def add_plans(db):
    free = Plan(id=1, code="free", name="免费版", max_students=1, features={}, sort_order=1)
    basic = Plan(id=2, code="basic", name="基础版", max_students=10, features={}, sort_order=2)
    db.add_all([free, basic])
    db.commit()
    return free, basic


def test_set_user_subscription_records_one_history_for_existing_subscription():
    db = make_db()
    add_plans(db)
    add_user(db, 1, "teacher")
    db.add(Subscription(user_id=1, plan_id=1, status="active"))
    db.commit()

    response = set_user_subscription(db, user_id=1, plan_code="basic", period_days=45)
    histories = db.query(SubscriptionHistory).filter(SubscriptionHistory.user_id == 1).all()
    sub = db.query(Subscription).filter(Subscription.user_id == 1).first()

    assert response.plan_code == "basic"
    assert sub.plan_id == 2
    assert sub.period_end is not None
    assert len(histories) == 1
    assert histories[0].plan_id == 2


def test_batch_extend_subscription_extends_from_future_period_end():
    db = make_db()
    _, basic = add_plans(db)
    add_user(db, 1, "teacher")
    future_end = utc_now() + timedelta(days=10)
    db.add(
        Subscription(
            user_id=1,
            plan_id=basic.id,
            status="active",
            period_start=utc_now(),
            period_end=future_end,
        )
    )
    db.commit()

    result = batch_set_or_extend_subscriptions(db, user_ids=[1], plan_code=None, period_days=5)
    sub = db.query(Subscription).filter(Subscription.user_id == 1).first()

    assert result == {"updated": 1, "failed": []}
    assert sub.period_end.date() == (future_end + timedelta(days=5)).date()
    assert db.query(SubscriptionHistory).filter(SubscriptionHistory.user_id == 1).count() == 1


def test_delete_user_and_related_removes_owned_records_and_unassigns_students():
    db = make_db()
    _, basic = add_plans(db)
    add_user(db, 1, "admin", role="admin")
    add_user(db, 2, "teacher")
    student = Student(id=1, user_id=2, name="Alice", grade="8", class_name="1")
    db.add(student)
    db.flush()
    session = ChatSession(id=1, user_id=2, student_id=student.id, title="辅导")
    db.add(session)
    db.flush()
    db.add(ChatMessage(session_id=session.id, role="user", content="hello"))
    db.add(Subscription(user_id=2, plan_id=basic.id, status="active"))
    db.add(SubscriptionHistory(user_id=2, plan_id=basic.id))
    db.add(Order(user_id=2, plan_id=basic.id, amount=10, out_trade_no="order-1"))
    db.add(
        Schedule(
            user_id=2,
            student_id=student.id,
            schedule_date=utc_now().date(),
            start_time="10:00",
            end_time="11:00",
        )
    )
    db.commit()

    delete_user_and_related(db, user_id=2, current_user_id=1)

    assert db.get(User, 2) is None
    assert db.query(ChatSession).count() == 0
    assert db.query(ChatMessage).count() == 0
    assert db.query(Subscription).count() == 0
    assert db.query(SubscriptionHistory).count() == 0
    assert db.query(Order).count() == 0
    assert db.query(Schedule).count() == 0
    assert db.get(Student, 1).user_id is None


def _add_practice_graph(db, user_id: int, *, artifact_status="draft", action_status=None):
    run = AgentRun(
        user_id=user_id,
        goal="PRIVATE_PROMPT_CONTEXT",
        status="completed",
        context_snapshot_json={"student_mistakes": ["PRIVATE_STUDENT_CONTEXT"]},
    )
    db.add(run)
    db.flush()
    artifact = AgentArtifact(
        user_id=user_id,
        agent_run_id=run.id,
        artifact_type="practice_set",
        status=artifact_status,
        version=1,
        title="Private draft",
        content_json={"questions": [{"stem": "PRIVATE_GENERATED_QUESTION"}]},
        validation_json={},
        context_summary_json={"summary": "PRIVATE_CONTEXT_JSON"},
    )
    db.add(artifact)
    db.flush()
    action = None
    if action_status:
        action = AgentAction(
            user_id=user_id,
            agent_run_id=run.id,
            artifact_id=artifact.id,
            action_type="save_practice_set",
            status=action_status,
            idempotency_key=f"action-{user_id}-{action_status}",
            payload_hash="a" * 64,
            expected_artifact_version=1,
            result_json={"generated": "PRIVATE_MODEL_RESPONSE"} if action_status == "completed" else None,
        )
        db.add(action)
    db.commit()
    return run, artifact, action


def test_delete_user_with_zero_practice_data_succeeds():
    db = make_db()
    add_user(db, 1, "admin", role="admin")
    add_user(db, 2, "teacher")

    delete_user_and_related(db, user_id=2, current_user_id=1)

    assert db.get(User, 2) is None


def test_delete_user_cascades_draft_artifact_and_private_run_context():
    db = make_db()
    add_user(db, 1, "admin", role="admin")
    add_user(db, 2, "teacher")
    run, artifact, _ = _add_practice_graph(db, 2)
    run_id, artifact_id = run.id, artifact.id

    delete_user_and_related(db, user_id=2, current_user_id=1)

    assert db.get(User, 2) is None
    assert db.get(AgentRun, run_id) is None
    assert db.get(AgentArtifact, artifact_id) is None
    assert db.query(AgentArtifact).filter(AgentArtifact.user_id == 2).count() == 0
    assert db.query(AgentArtifact).filter(AgentArtifact.context_summary_json.is_not(None)).count() == 0


@pytest.mark.parametrize("action_status", ["pending_confirmation", "completed"])
def test_delete_user_cascades_prepared_and_completed_practice_actions(action_status):
    db = make_db()
    add_user(db, 1, "admin", role="admin")
    add_user(db, 2, "teacher")
    run, artifact, action = _add_practice_graph(
        db,
        2,
        artifact_status="saved" if action_status == "completed" else "ready_for_confirmation",
        action_status=action_status,
    )
    run_id, artifact_id, action_id = run.id, artifact.id, action.id

    delete_user_and_related(db, user_id=2, current_user_id=1)

    assert db.get(AgentRun, run_id) is None
    assert db.get(AgentArtifact, artifact_id) is None
    assert db.get(AgentAction, action_id) is None
    assert db.query(AgentAction).filter(AgentAction.user_id == 2).count() == 0


def test_delete_user_keeps_other_teachers_practice_data():
    db = make_db()
    add_user(db, 1, "admin", role="admin")
    add_user(db, 2, "teacher-a")
    add_user(db, 3, "teacher-b")
    run_a, artifact_a, action_a = _add_practice_graph(db, 2, action_status="pending_confirmation")
    run_b, artifact_b, action_b = _add_practice_graph(db, 3, action_status="completed")
    run_a_id, artifact_a_id, action_a_id = run_a.id, artifact_a.id, action_a.id
    run_b_id, artifact_b_id, action_b_id = run_b.id, artifact_b.id, action_b.id

    delete_user_and_related(db, user_id=2, current_user_id=1)

    assert db.get(AgentRun, run_a_id) is None
    assert db.get(AgentArtifact, artifact_a_id) is None
    assert db.get(AgentAction, action_a_id) is None
    assert db.get(User, 3) is not None
    assert db.get(AgentRun, run_b_id) is not None
    assert db.get(AgentArtifact, artifact_b_id) is not None
    assert db.get(AgentAction, action_b_id) is not None


def test_question_bank_owner_delete_contract_remains_no_action():
    db = make_db()
    add_user(db, 1, "admin", role="admin")
    add_user(db, 2, "teacher")
    question = QuestionBank(
        owner_user_id=2,
        content="Existing owned question",
        options=[],
        answer="A",
        analysis="",
        question_type="single_choice",
        difficulty="medium",
        knowledge_point="algebra",
        source="manual",
        tags=[],
        images=[],
        content_hash="q" * 64,
    )
    db.add(question)
    db.commit()

    question_fk = next(
        fk for fk in inspect(db.get_bind()).get_foreign_keys("question_bank")
        if fk["constrained_columns"] == ["owner_user_id"]
    )
    assert question_fk["options"].get("ondelete") is None
    with pytest.raises(IntegrityError):
        delete_user_and_related(db, user_id=2, current_user_id=1)
    db.rollback()
    assert db.get(User, 2) is not None
    assert db.get(QuestionBank, question.id) is not None
