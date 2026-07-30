from datetime import timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.order import Order
from app.models.plan import Plan
from app.models.subscription import Subscription
from app.models.subscription_history import SubscriptionHistory
from app.models.user import User
from app.services import order_payment_service as service


def make_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            Plan.__table__,
            Order.__table__,
            Subscription.__table__,
            SubscriptionHistory.__table__,
        ],
    )
    SessionLocal = sessionmaker(bind=engine)
    return SessionLocal()


def add_user_plan_order(db, *, out_trade_no: str = "order-1", period_months: int = 1):
    user = User(id=1, username="teacher", hashed_password="x", role="teacher", is_active=True)
    plan = Plan(
        id=1,
        code="basic",
        name="基础版",
        max_students=10,
        features={},
        sort_order=1,
        price_monthly=10,
        price_yearly=100,
    )
    order = Order(
        user_id=user.id,
        plan_id=plan.id,
        amount=10,
        status="pending",
        payment_method="alipay",
        period_months=period_months,
        out_trade_no=out_trade_no,
    )
    db.add_all([user, plan, order])
    db.commit()
    return user, plan, order


def test_calculate_order_amount_prefers_yearly_price_for_full_years():
    plan = Plan(code="pro", name="专业版", max_students=20, price_monthly=20, price_yearly=200)

    assert service.calculate_order_amount(plan, 1) == 20
    assert service.calculate_order_amount(plan, 12) == 200
    assert service.calculate_order_amount(plan, 14) == 240


def test_apply_paid_order_creates_subscription_and_is_idempotent():
    db = make_db()
    add_user_plan_order(db)

    first_msg = service.apply_paid_order(db, out_trade_no="order-1", third_trade_no="trade-1")
    second_msg = service.apply_paid_order(db, out_trade_no="order-1", third_trade_no="trade-1")
    order = db.query(Order).filter(Order.out_trade_no == "order-1").first()
    sub = db.query(Subscription).filter(Subscription.user_id == 1).first()

    assert first_msg == "处理成功"
    assert second_msg == "已处理"
    assert order.status == "paid"
    assert order.third_party_trade_no == "trade-1"
    assert sub.plan_id == 1
    assert sub.period_end is not None
    assert db.query(SubscriptionHistory).count() == 1


def test_apply_paid_order_extends_existing_same_plan_from_future_end():
    db = make_db()
    _, plan, _ = add_user_plan_order(db, period_months=2)
    future_end = service.utc_now() + timedelta(days=10)
    db.add(
        Subscription(
            user_id=1,
            plan_id=plan.id,
            status="active",
            period_start=service.utc_now(),
            period_end=future_end,
        )
    )
    db.commit()

    service.apply_paid_order(db, out_trade_no="order-1", third_trade_no="trade-1")
    sub = db.query(Subscription).filter(Subscription.user_id == 1).first()

    assert sub.period_end.date() == (future_end + timedelta(days=60)).date()
    assert db.query(SubscriptionHistory).count() == 1


def test_handle_alipay_notify_maps_validation_and_success(monkeypatch):
    db = make_db()
    add_user_plan_order(db)
    monkeypatch.setattr(service, "verify_alipay_notify", lambda data: True)

    ignored = service.handle_alipay_notify(
        db,
        {"trade_status": "WAIT_BUYER_PAY", "out_trade_no": "order-1"},
    )
    success = service.handle_alipay_notify(
        db,
        {"trade_status": "TRADE_SUCCESS", "out_trade_no": "order-1", "trade_no": "trade-1"},
    )

    assert ignored == {"code": "success", "msg": "忽略非成功状态"}
    assert success == {"code": "success", "msg": "处理成功"}
