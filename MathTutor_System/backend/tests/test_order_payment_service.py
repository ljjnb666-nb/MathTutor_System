from datetime import timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.order import Order
from app.models.plan import Plan
from app.models.subscription import Subscription
from app.models.subscription_history import SubscriptionHistory
from app.models.user import User
from app.services import order_payment_service as service

TEST_ALIPAY_APP_ID = "app-mathtutor-test"


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


def add_user_plan_order(
    db,
    *,
    out_trade_no: str = "order-1",
    period_months: int = 1,
    payment_method: str = "alipay",
    currency: str = "CNY",
):
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
        currency=currency,
        status="pending",
        payment_method=payment_method,
        period_months=period_months,
        out_trade_no=out_trade_no,
    )
    db.add_all([user, plan, order])
    db.commit()
    return user, plan, order


@pytest.fixture
def signed_alipay(monkeypatch):
    """有效签名回调的默认环境，并记录 apply_paid_order 的调用。"""
    monkeypatch.setattr(service, "verify_alipay_notify", lambda data: True)
    monkeypatch.setattr(service, "ALIPAY_APP_ID", TEST_ALIPAY_APP_ID)
    calls = []
    original = service.apply_paid_order

    def spy(db, *, out_trade_no, third_trade_no):
        calls.append(out_trade_no)
        return original(db, out_trade_no=out_trade_no, third_trade_no=third_trade_no)

    monkeypatch.setattr(service, "apply_paid_order", spy)
    return calls


def alipay_callback(**overrides):
    """构造通过签名校验后的合法回调参数；值为 None 表示缺少该字段。"""
    data = {
        "trade_status": "TRADE_SUCCESS",
        "out_trade_no": "order-1",
        "trade_no": "trade-1",
        "app_id": TEST_ALIPAY_APP_ID,
        "total_amount": "10.00",
    }
    data.update(overrides)
    return {key: value for key, value in data.items() if value is not None}


def get_order(db, out_trade_no: str = "order-1"):
    return db.query(Order).filter(Order.out_trade_no == out_trade_no).first()


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
    order = get_order(db)
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


def test_handle_alipay_notify_invalid_signature_rejected(signed_alipay, monkeypatch):
    db = make_db()
    add_user_plan_order(db)
    monkeypatch.setattr(service, "verify_alipay_notify", lambda data: False)

    result = service.handle_alipay_notify(db, alipay_callback())
    order = get_order(db)

    assert result == {"code": "failure", "msg": "验签失败"}
    assert order.status == "pending"
    assert signed_alipay == []


def test_handle_alipay_notify_non_success_status_ignored(signed_alipay):
    db = make_db()
    add_user_plan_order(db)

    result = service.handle_alipay_notify(db, alipay_callback(trade_status="WAIT_BUYER_PAY"))
    order = get_order(db)

    assert result == {"code": "success", "msg": "忽略非成功状态"}
    assert order.status == "pending"
    assert signed_alipay == []


def test_handle_alipay_notify_missing_out_trade_no_rejected(signed_alipay):
    db = make_db()
    add_user_plan_order(db)

    result = service.handle_alipay_notify(db, alipay_callback(out_trade_no=None))

    assert result["code"] == "failure"
    assert signed_alipay == []


def test_handle_alipay_notify_unknown_order_rejected(signed_alipay):
    db = make_db()
    add_user_plan_order(db)

    result = service.handle_alipay_notify(db, alipay_callback(out_trade_no="order-404"))

    assert result == {"code": "failure", "msg": "订单不存在"}
    assert db.query(Subscription).count() == 0
    assert signed_alipay == []


def test_handle_alipay_notify_missing_app_id_rejected(signed_alipay):
    db = make_db()
    add_user_plan_order(db)

    result = service.handle_alipay_notify(db, alipay_callback(app_id=None))
    order = get_order(db)

    assert result == {"code": "failure", "msg": "缺少 app_id"}
    assert order.status == "pending"
    assert signed_alipay == []


def test_handle_alipay_notify_wrong_app_id_rejected(signed_alipay):
    db = make_db()
    add_user_plan_order(db)

    result = service.handle_alipay_notify(db, alipay_callback(app_id="app-other"))
    order = get_order(db)

    assert result == {"code": "failure", "msg": "应用标识不匹配"}
    assert order.status == "pending"
    assert signed_alipay == []


def test_handle_alipay_notify_matching_app_id_continues_to_amount_check(signed_alipay):
    db = make_db()
    add_user_plan_order(db)

    result = service.handle_alipay_notify(db, alipay_callback(total_amount="9.99"))

    assert result == {"code": "failure", "msg": "支付金额不匹配"}
    assert signed_alipay == []


def test_handle_alipay_notify_missing_total_amount_rejected(signed_alipay):
    db = make_db()
    add_user_plan_order(db)

    result = service.handle_alipay_notify(db, alipay_callback(total_amount=None))
    order = get_order(db)

    assert result == {"code": "failure", "msg": "缺少 total_amount"}
    assert order.status == "pending"
    assert signed_alipay == []


@pytest.mark.parametrize("raw", ["abc", "", "NaN", "Infinity", "-Infinity"])
def test_handle_alipay_notify_malformed_amount_rejected(signed_alipay, raw):
    db = make_db()
    add_user_plan_order(db)

    result = service.handle_alipay_notify(db, alipay_callback(total_amount=raw))
    order = get_order(db)

    assert result["code"] == "failure"
    assert order.status == "pending"
    assert signed_alipay == []


@pytest.mark.parametrize("raw", ["9.99", "10.01", "100.00"])
def test_handle_alipay_notify_amount_mismatch_rejected(signed_alipay, raw):
    db = make_db()
    add_user_plan_order(db)

    result = service.handle_alipay_notify(db, alipay_callback(total_amount=raw))
    order = get_order(db)

    assert result == {"code": "failure", "msg": "支付金额不匹配"}
    assert order.status == "pending"
    assert signed_alipay == []


@pytest.mark.parametrize("raw", ["10.001", "10.004", "9.999", "10.009", "10.999"])
def test_handle_alipay_notify_sub_cent_amount_rejected(signed_alipay, raw):
    db = make_db()
    add_user_plan_order(db)

    result = service.handle_alipay_notify(db, alipay_callback(total_amount=raw))
    order = get_order(db)

    assert result["code"] == "failure"
    assert order.status == "pending"
    assert signed_alipay == []


@pytest.mark.parametrize("raw", ["10", "10.0", "10.00", "10.000"])
def test_handle_alipay_notify_equivalent_amount_formats_accepted(signed_alipay, raw):
    db = make_db()
    add_user_plan_order(db)

    result = service.handle_alipay_notify(db, alipay_callback(total_amount=raw))
    order = get_order(db)

    assert result == {"code": "success", "msg": "处理成功"}
    assert order.status == "paid"
    assert signed_alipay == ["order-1"]


def test_handle_alipay_notify_non_alipay_order_rejected(signed_alipay):
    db = make_db()
    add_user_plan_order(db, payment_method="wechat")

    result = service.handle_alipay_notify(db, alipay_callback())
    order = get_order(db)

    assert result == {"code": "failure", "msg": "支付方式不匹配"}
    assert order.status == "pending"
    assert signed_alipay == []


def test_handle_alipay_notify_non_cny_order_rejected(signed_alipay):
    db = make_db()
    add_user_plan_order(db, currency="USD")

    result = service.handle_alipay_notify(db, alipay_callback())
    order = get_order(db)

    assert result == {"code": "failure", "msg": "支付币种不匹配"}
    assert order.status == "pending"
    assert signed_alipay == []


def test_handle_alipay_notify_valid_callback_marks_paid(signed_alipay):
    db = make_db()
    add_user_plan_order(db)

    result = service.handle_alipay_notify(db, alipay_callback())
    order = get_order(db)
    sub = db.query(Subscription).filter(Subscription.user_id == 1).first()

    assert result == {"code": "success", "msg": "处理成功"}
    assert signed_alipay == ["order-1"]
    assert order.status == "paid"
    assert order.third_party_trade_no == "trade-1"
    assert order.paid_at is not None
    assert sub is not None
    assert sub.status == "active"
    assert db.query(SubscriptionHistory).count() == 1


def test_handle_alipay_notify_replay_is_idempotent(signed_alipay):
    db = make_db()
    add_user_plan_order(db)

    first = service.handle_alipay_notify(db, alipay_callback())
    second = service.handle_alipay_notify(db, alipay_callback())

    assert first == {"code": "success", "msg": "处理成功"}
    assert second == {"code": "success", "msg": "已处理"}
    assert db.query(Subscription).count() == 1
    assert db.query(SubscriptionHistory).count() == 1
