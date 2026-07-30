from datetime import timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.chat_session import ChatMessage, ChatSession
from app.models.order import Order
from app.models.plan import Plan
from app.models.schedule import Schedule
from app.models.student import Student
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
    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            Plan.__table__,
            Subscription.__table__,
            SubscriptionHistory.__table__,
            Student.__table__,
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
