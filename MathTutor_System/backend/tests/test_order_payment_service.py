import shutil
import tempfile
from datetime import timedelta
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.models.base import Base
from app.models.order import Order
from app.models.plan import Plan
from app.models.subscription import Subscription
from app.models.subscription_history import SubscriptionHistory
from app.models.user import User
from app.services import order_payment_service as service

TEST_ALIPAY_APP_ID = "app-mathtutor-test"
TEST_TMP_DIR = Path(__file__).resolve().parent / ".tmp_payment_atomicity_runs"


@pytest.fixture
def atomicity_tmp(request):
    """每个测试一个独立临时目录（避免依赖系统 %TEMP% 的 pytest tmp_path 根目录权限）。"""
    if TEST_TMP_DIR.exists():
        shutil.rmtree(TEST_TMP_DIR, ignore_errors=True)
    TEST_TMP_DIR.mkdir(parents=True, exist_ok=True)
    case_dir = Path(tempfile.mkdtemp(dir=TEST_TMP_DIR))
    request.addfinalizer(lambda: shutil.rmtree(TEST_TMP_DIR, ignore_errors=True))
    return case_dir


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


def make_file_db(case_dir):
    """独立 SQLite 文件库：允许用互不相关的新会话验证持久化状态。"""
    engine = create_engine(
        f"sqlite:///{case_dir.as_posix()}/payment-atomicity.db",
        connect_args={"check_same_thread": False, "timeout": 15},
        poolclass=NullPool,
    )
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
    return engine, sessionmaker(bind=engine)


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


def test_apply_paid_order_commits_all_effects_in_one_durable_state(atomicity_tmp):
    """PAY-ATOMIC-01：成功申请后订单/订阅/历史全部持久化（新会话验证）。"""
    _, SessionLocal = make_file_db(atomicity_tmp)
    seed = SessionLocal()
    add_user_plan_order(seed, out_trade_no="order-a1")
    seed.close()

    db = SessionLocal()
    msg = service.apply_paid_order(db, out_trade_no="order-a1", third_trade_no="trade-a1")
    db.close()

    verify = SessionLocal()
    order = verify.query(Order).filter(Order.out_trade_no == "order-a1").one()
    sub = verify.query(Subscription).filter(Subscription.user_id == 1).one()
    histories = verify.query(SubscriptionHistory).all()
    verify.close()

    assert msg == "处理成功"
    assert order.status == "paid"
    assert order.third_party_trade_no == "trade-a1"
    assert order.paid_at is not None
    assert sub.plan_id == 1
    assert sub.status == "active"
    assert sub.period_start is not None and sub.period_end is not None
    assert len(histories) == 1


def test_apply_paid_order_commits_exactly_once(atomicity_tmp):
    """PAY-ATOMIC-02：订单支付推进期间只允许一次事务提交。"""
    _, SessionLocal = make_file_db(atomicity_tmp)
    seed = SessionLocal()
    add_user_plan_order(seed, out_trade_no="order-c1")
    seed.close()

    db = SessionLocal()
    commit_count = []
    real_commit = db.commit

    def counting_commit():
        commit_count.append(1)
        return real_commit()

    db.commit = counting_commit
    msg = service.apply_paid_order(db, out_trade_no="order-c1", third_trade_no="trade-c1")
    db.close()

    assert msg == "处理成功"
    assert len(commit_count) == 1

    verify = SessionLocal()
    order = verify.query(Order).filter(Order.out_trade_no == "order-c1").one()
    sub = verify.query(Subscription).filter(Subscription.user_id == 1).one()
    verify.close()
    assert order.status == "paid"
    assert sub.status == "active"
    assert verify.query(SubscriptionHistory).count() == 1


def test_failure_after_staged_paid_transition_rolls_back_everything(atomicity_tmp, monkeypatch):
    """PAY-ATOMIC-03/05：订单已推进 paid 后注入失败 → 整体回滚且会话仍可用。"""
    _, SessionLocal = make_file_db(atomicity_tmp)
    seed = SessionLocal()
    add_user_plan_order(seed, out_trade_no="order-f1")
    seed.add(
        Subscription(
            user_id=1,
            plan_id=1,
            status="active",
            period_start=service.utc_now(),
            period_end=service.utc_now() + timedelta(days=5),
        )
    )
    seed.commit()
    seed.close()

    class ExplodingHistory:
        def __init__(self, *args, **kwargs):
            raise RuntimeError("injected failure after paid staging")

    monkeypatch.setattr(service, "SubscriptionHistory", ExplodingHistory)

    db = SessionLocal()
    with pytest.raises(RuntimeError, match="injected failure"):
        service.apply_paid_order(db, out_trade_no="order-f1", third_trade_no="trade-f1")

    # 失败的调用自身必须已回滚：会话立即离开失败事务（PAY-ATOMIC-05），
    # 不依赖下一次 apply_paid_order 的入口清理。
    assert not db.in_transaction()
    # 回滚后的同一会话可正常执行查询
    assert db.query(Order).filter(Order.out_trade_no == "order-f1").one() is not None

    fresh = SessionLocal()
    order = fresh.query(Order).filter(Order.out_trade_no == "order-f1").one()
    sub = fresh.query(Subscription).filter(Subscription.user_id == 1).one()
    assert order.status == "pending"
    assert order.third_party_trade_no is None
    assert order.paid_at is None
    assert sub.period_end is not None
    sub_period_end = sub.period_end
    assert fresh.query(SubscriptionHistory).count() == 0
    fresh.close()

    # 注入解除后，同一会话可继续完成完整的支付申请
    monkeypatch.undo()
    msg = service.apply_paid_order(db, out_trade_no="order-f1", third_trade_no="trade-f1")
    assert msg == "处理成功"
    db.close()

    verify = SessionLocal()
    order = verify.query(Order).filter(Order.out_trade_no == "order-f1").one()
    sub = verify.query(Subscription).filter(Subscription.user_id == 1).one()
    assert order.status == "paid"
    # 原订阅 period_end 未被失败尝试污染，续期基于其真实值
    assert sub.period_end > sub_period_end
    assert verify.query(SubscriptionHistory).count() == 1
    verify.close()


def test_unexpected_exception_rolls_back_before_propagation(atomicity_tmp, monkeypatch):
    """PAY-ATOMIC-05：非 OperationalError 异常必须先回滚再传播，且只回滚本次调用。"""
    _, SessionLocal = make_file_db(atomicity_tmp)
    seed = SessionLocal()
    add_user_plan_order(seed, out_trade_no="order-x1")
    seed.close()

    class ExplodingHistory:
        def __init__(self, *args, **kwargs):
            raise RuntimeError("injected unexpected failure")

    monkeypatch.setattr(service, "SubscriptionHistory", ExplodingHistory)

    db = SessionLocal()
    real_rollback = db.rollback
    rollbacks = []

    def counting_rollback():
        rollbacks.append(1)
        return real_rollback()

    db.rollback = counting_rollback

    with pytest.raises(RuntimeError, match="injected unexpected failure"):
        service.apply_paid_order(db, out_trade_no="order-x1", third_trade_no="trade-x1")

    assert len(rollbacks) >= 1
    assert not db.in_transaction()
    # 失败调用自身已清理会话：无需再次进入 apply_paid_order 即可直接查询
    assert db.query(Order).filter(Order.out_trade_no == "order-x1").one() is not None
    db.close()

    fresh = SessionLocal()
    order = fresh.query(Order).filter(Order.out_trade_no == "order-x1").one()
    assert order.status == "pending"
    assert order.third_party_trade_no is None
    assert order.paid_at is None
    assert fresh.query(Subscription).count() == 0
    assert fresh.query(SubscriptionHistory).count() == 0
    fresh.close()


def test_non_busy_operational_error_rolls_back_and_raises(atomicity_tmp):
    """非锁竞争的 OperationalError：回滚后原样抛出，不重试。"""
    _, SessionLocal = make_file_db(atomicity_tmp)
    seed = SessionLocal()
    add_user_plan_order(seed, out_trade_no="order-n1")
    seed.close()

    from sqlalchemy.exc import OperationalError

    db = SessionLocal()
    real_execute = db.execute
    real_rollback = db.rollback
    rollbacks = []

    def failing_execute(*args, **kwargs):
        raise OperationalError("UPDATE orders", {}, Exception("no such table: orders"))

    def counting_rollback():
        rollbacks.append(1)
        return real_rollback()

    db.execute = failing_execute
    db.rollback = counting_rollback

    with pytest.raises(OperationalError):
        service.apply_paid_order(db, out_trade_no="order-n1", third_trade_no="trade-n1")

    assert len(rollbacks) >= 1
    assert not db.in_transaction()

    db.execute = real_execute
    db.rollback = real_rollback
    # 会话仍可用
    assert db.query(Order).filter(Order.out_trade_no == "order-n1").one() is not None
    db.close()


def test_missing_plan_leaves_order_not_paid(atomicity_tmp):
    """PAY-ATOMIC-04：套餐缺失时订单不得停留在 paid，无任何订阅副作用。"""
    _, SessionLocal = make_file_db(atomicity_tmp)
    seed = SessionLocal()
    add_user_plan_order(seed, out_trade_no="order-p1")
    seed.query(Plan).filter(Plan.code == "basic").delete()
    seed.commit()
    seed.close()

    db = SessionLocal()
    msg = service.apply_paid_order(db, out_trade_no="order-p1", third_trade_no="trade-p1")
    db.close()

    assert msg == "套餐不存在"

    verify = SessionLocal()
    order = verify.query(Order).filter(Order.out_trade_no == "order-p1").one()
    assert order.status == "pending"
    assert order.third_party_trade_no is None
    assert order.paid_at is None
    assert verify.query(Subscription).count() == 0
    assert verify.query(SubscriptionHistory).count() == 0
    verify.close()


def test_handle_alipay_notify_missing_plan_fails_without_paid_state(signed_alipay):
    db = make_db()
    add_user_plan_order(db)
    db.query(Plan).filter(Plan.code == "basic").delete()
    db.commit()

    result = service.handle_alipay_notify(db, alipay_callback())
    order = get_order(db)

    assert result == {"code": "failure", "msg": "套餐不存在"}
    assert order.status == "pending"
    assert db.query(SubscriptionHistory).count() == 0


def test_handle_wechat_notify_missing_plan_rejected(monkeypatch):
    """SEC-03 之后：只有完整合法的回调才会走到套餐缺失的业务失败。"""
    monkeypatch.setattr(service, "WECHAT_MCHID", "1900006789")
    monkeypatch.setattr(service, "WECHAT_APPID", "wx-test-appid")
    monkeypatch.setattr(
        service,
        "verify_wechat_callback",
        lambda headers, body: {
            "out_trade_no": "order-1",
            "trade_state": "SUCCESS",
            "transaction_id": "wx-t1",
            "mchid": "1900006789",
            "appid": "wx-test-appid",
            "amount": {"currency": "CNY", "total": "1000"},
        },
    )
    db = make_db()
    add_user_plan_order(db, payment_method="wechat")
    db.query(Plan).filter(Plan.code == "basic").delete()
    db.commit()

    result = service.handle_wechat_notify(db, {}, "")

    assert result == {"code": "FAIL", "message": "套餐不存在"}
    assert get_order(db).status == "pending"
    assert db.query(SubscriptionHistory).count() == 0


def test_sqlite_busy_on_first_claim_is_retried(atomicity_tmp):
    """SQLite 写锁升级冲突（database is locked）触发整体重试后仍完整生效。"""
    _, SessionLocal = make_file_db(atomicity_tmp)
    seed = SessionLocal()
    add_user_plan_order(seed, out_trade_no="order-b1")
    seed.close()

    from sqlalchemy.exc import OperationalError

    db = SessionLocal()
    real_execute = db.execute
    attempts = []

    def flaky_execute(*args, **kwargs):
        if not attempts:
            attempts.append(1)
            raise OperationalError(
                "UPDATE orders", {}, Exception("database is locked")
            )
        return real_execute(*args, **kwargs)

    db.execute = flaky_execute
    msg = service.apply_paid_order(db, out_trade_no="order-b1", third_trade_no="trade-b1")
    db.close()

    assert attempts, "必须实际经历一次 BUSY 重试"
    assert msg == "处理成功"

    verify = SessionLocal()
    order = verify.query(Order).filter(Order.out_trade_no == "order-b1").one()
    assert order.status == "paid"
    assert order.third_party_trade_no == "trade-b1"
    assert verify.query(Subscription).count() == 1
    assert verify.query(SubscriptionHistory).count() == 1
    verify.close()


def test_replay_does_not_rewrite_original_trade_number(atomicity_tmp):
    """PAY-CONC-04：重复回调不得改写已支付订单的支付单号/时间/订阅效果。"""
    _, SessionLocal = make_file_db(atomicity_tmp)
    seed = SessionLocal()
    add_user_plan_order(seed, out_trade_no="order-r1")
    seed.close()

    db = SessionLocal()
    assert service.apply_paid_order(db, out_trade_no="order-r1", third_trade_no="trade-A") == "处理成功"
    db.close()

    before = SessionLocal()
    order_before = before.query(Order).filter(Order.out_trade_no == "order-r1").one()
    sub_before = before.query(Subscription).filter(Subscription.user_id == 1).one()
    original_trade_no = order_before.third_party_trade_no
    original_paid_at = order_before.paid_at
    original_period_end = sub_before.period_end
    before.close()

    db = SessionLocal()
    replay_msg = service.apply_paid_order(db, out_trade_no="order-r1", third_trade_no="trade-B")
    db.close()

    verify = SessionLocal()
    order = verify.query(Order).filter(Order.out_trade_no == "order-r1").one()
    sub = verify.query(Subscription).filter(Subscription.user_id == 1).one()

    assert replay_msg == "已处理"
    assert order.third_party_trade_no == original_trade_no == "trade-A"
    assert order.paid_at == original_paid_at
    assert sub.period_end == original_period_end
    assert verify.query(SubscriptionHistory).count() == 1
    verify.close()
