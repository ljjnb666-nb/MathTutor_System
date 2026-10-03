"""SEC-03: WeChat callbacks must pass the same integrity contract as Alipay's."""
import pytest

from app.models.order import Order
from app.models.plan import Plan
from app.models.subscription import Subscription
from app.models.subscription_history import SubscriptionHistory
from app.services import order_payment_service as service
from tests.test_order_payment_service import add_user_plan_order, make_db, get_order

TEST_MCHID = "1900006789"
TEST_APPID = "wx-test-appid"


@pytest.fixture
def wechat_gateway(monkeypatch):
    monkeypatch.setattr(service, "WECHAT_MCHID", TEST_MCHID)
    monkeypatch.setattr(service, "WECHAT_APPID", TEST_APPID)
    seen = {}
    calls = []
    original = service.apply_paid_order

    def spy(db, *, out_trade_no, third_trade_no):
        calls.append(out_trade_no)
        return original(db, out_trade_no=out_trade_no, third_trade_no=third_trade_no)

    monkeypatch.setattr(service, "apply_paid_order", spy)

    def gateway(resource):
        seen["resource"] = resource
        monkeypatch.setattr(service, "verify_wechat_callback", lambda headers, body: resource)

    return gateway, seen, calls


def wechat_resource(**overrides):
    resource = {
        "out_trade_no": "order-1",
        "trade_state": "SUCCESS",
        "transaction_id": "wx-txn-1",
        "mchid": TEST_MCHID,
        "appid": TEST_APPID,
        "amount": {"currency": "CNY", "total": "1000", "payer_total": "1000"},
    }
    resource.update(overrides)
    return resource


def test_valid_wechat_callback_marks_paid_exactly_once(wechat_gateway):
    gateway, _, calls = wechat_gateway
    db = make_db()
    add_user_plan_order(db, payment_method="wechat")

    gateway(wechat_resource())
    result = service.handle_wechat_notify(db, {}, b"body")

    order = get_order(db)
    sub = db.query(Subscription).filter(Subscription.user_id == 1).first()
    assert result == {"code": "SUCCESS", "message": "成功"}
    assert calls == ["order-1"]
    assert order.status == "paid"
    assert order.third_party_trade_no == "wx-txn-1"
    assert sub is not None and sub.status == "active"
    assert db.query(SubscriptionHistory).count() == 1


def test_wechat_replay_is_exactly_once(wechat_gateway):
    gateway, _, _ = wechat_gateway
    db = make_db()
    add_user_plan_order(db, payment_method="wechat")

    gateway(wechat_resource())
    assert service.handle_wechat_notify(db, {}, b"1")["code"] == "SUCCESS"
    # Legitimate retry after network loss: same order, mutated transaction id.
    gateway(wechat_resource(transaction_id="wx-txn-2"))
    replay = service.handle_wechat_notify(db, {}, b"2")

    order = get_order(db)
    assert replay == {"code": "SUCCESS", "message": "已处理"}
    assert order.third_party_trade_no == "wx-txn-1"  # first txn id never rewritten
    assert db.query(SubscriptionHistory).count() == 1


def test_wechat_bad_signature_rejected(wechat_gateway):
    gateway, _, calls = wechat_gateway
    db = make_db()
    add_user_plan_order(db, payment_method="wechat")
    gateway(None)

    result = service.handle_wechat_notify(db, {}, b"body")
    assert result == {"code": "FAIL", "message": "验签或解密失败"}
    assert get_order(db).status == "pending"
    assert calls == []


def test_wechat_missing_out_trade_no_rejected(wechat_gateway):
    gateway, _, calls = wechat_gateway
    db = make_db()
    add_user_plan_order(db, payment_method="wechat")

    gateway(wechat_resource(out_trade_no=None))
    result = service.handle_wechat_notify(db, {}, b"body")

    assert result == {"code": "FAIL", "message": "缺少 out_trade_no"}
    assert calls == []


def test_wechat_missing_transaction_id_rejected(wechat_gateway):
    gateway, _, calls = wechat_gateway
    db = make_db()
    add_user_plan_order(db, payment_method="wechat")

    gateway(wechat_resource(transaction_id=None))
    result = service.handle_wechat_notify(db, {}, b"body")

    assert result == {"code": "FAIL", "message": "缺少 transaction_id"}
    assert get_order(db).status == "pending"
    assert calls == []


def test_wechat_wrong_mchid_rejected(wechat_gateway):
    gateway, _, calls = wechat_gateway
    db = make_db()
    add_user_plan_order(db, payment_method="wechat")

    gateway(wechat_resource(mchid="1900009999"))
    result = service.handle_wechat_notify(db, {}, b"body")

    assert result == {"code": "FAIL", "message": "商户号不匹配"}
    assert calls == []


def test_wechat_missing_mchid_rejected(wechat_gateway):
    gateway, _, calls = wechat_gateway
    db = make_db()
    add_user_plan_order(db, payment_method="wechat")

    gateway(wechat_resource(mchid=None))
    assert service.handle_wechat_notify(db, {}, b"body") == {"code": "FAIL", "message": "缺少 mchid"}
    assert calls == []


def test_wechat_wrong_appid_rejected(wechat_gateway):
    gateway, _, calls = wechat_gateway
    db = make_db()
    add_user_plan_order(db, payment_method="wechat")

    gateway(wechat_resource(appid="wx-enemy-app"))
    assert service.handle_wechat_notify(db, {}, b"body") == {"code": "FAIL", "message": "应用标识不匹配"}
    assert calls == []


def test_wechat_missing_appid_rejected(wechat_gateway):
    gateway, _, calls = wechat_gateway
    db = make_db()
    add_user_plan_order(db, payment_method="wechat")

    gateway(wechat_resource(appid=None))
    assert service.handle_wechat_notify(db, {}, b"body") == {"code": "FAIL", "message": "缺少 appid"}
    assert calls == []


def test_wechat_wrong_payment_method_rejected(wechat_gateway):
    gateway, _, calls = wechat_gateway
    db = make_db()
    add_user_plan_order(db, payment_method="alipay")  # order created for alipay

    gateway(wechat_resource())
    result = service.handle_wechat_notify(db, {}, b"body")

    assert result == {"code": "FAIL", "message": "支付方式不匹配"}
    assert get_order(db).status == "pending"
    assert calls == []


def test_wechat_non_cny_order_rejected(wechat_gateway):
    gateway, _, calls = wechat_gateway
    db = make_db()
    add_user_plan_order(db, payment_method="wechat", currency="USD")

    gateway(wechat_resource())
    assert service.handle_wechat_notify(db, {}, b"body") == {"code": "FAIL", "message": "支付币种不匹配"}
    assert calls == []


def test_wechat_missing_amount_rejected(wechat_gateway):
    gateway, _, calls = wechat_gateway
    db = make_db()
    add_user_plan_order(db, payment_method="wechat")

    gateway(wechat_resource(amount=None))
    assert service.handle_wechat_notify(db, {}, b"body") == {"code": "FAIL", "message": "缺少回调金额"}
    assert calls == []


def test_wechat_non_cny_callback_amount_rejected(wechat_gateway):
    gateway, _, calls = wechat_gateway
    db = make_db()
    add_user_plan_order(db, payment_method="wechat")

    gateway(wechat_resource(amount={"currency": "USD", "total": "1000"}))
    assert service.handle_wechat_notify(db, {}, b"body") == {"code": "FAIL", "message": "回调币种不匹配"}
    assert calls == []


@pytest.mark.parametrize("total", ["", "abc", "10.00", "1e3", "-100", "+100", None, True, [], {}])
def test_wechat_malformed_amount_total_rejected(wechat_gateway, total):
    gateway, _, calls = wechat_gateway
    db = make_db()
    add_user_plan_order(db, payment_method="wechat")

    gateway(wechat_resource(amount={"currency": "CNY", "total": total}))
    result = service.handle_wechat_notify(db, {}, b"body")

    assert result == {"code": "FAIL", "message": "回调金额格式错误"}
    assert get_order(db).status == "pending"
    assert calls == []


@pytest.mark.parametrize("total", ["999", "1001", "1", "100000"])
def test_wechat_amount_mismatch_rejected(wechat_gateway, total):
    gateway, _, calls = wechat_gateway
    db = make_db()
    add_user_plan_order(db, payment_method="wechat")  # 10.00 CNY = 1000 fen

    gateway(wechat_resource(amount={"currency": "CNY", "total": total}))
    result = service.handle_wechat_notify(db, {}, b"body")

    assert result == {"code": "FAIL", "message": "支付金额不匹配"}
    assert get_order(db).status == "pending"
    assert calls == []


def test_wechat_decimal_order_amount_matched_in_fen(wechat_gateway):
    """9.99 元订单 → 999 分：整型分比较，无 float 相等。"""
    gateway, _, _ = wechat_gateway
    db = make_db()
    add_user_plan_order(db, payment_method="wechat")
    order = get_order(db)
    order.amount = 9.99
    db.commit()

    gateway(wechat_resource(amount={"currency": "CNY", "total": "999"}))
    result = service.handle_wechat_notify(db, {}, b"body")

    assert result["code"] == "SUCCESS"
    assert get_order(db).status == "paid"


def test_wechat_non_success_state_acked_without_effect(wechat_gateway):
    gateway, _, calls = wechat_gateway
    db = make_db()
    add_user_plan_order(db, payment_method="wechat")

    gateway(wechat_resource(trade_state="NOTPAY"))
    result = service.handle_wechat_notify(db, {}, b"body")

    assert result == {"code": "SUCCESS", "message": "忽略非成功状态"}
    assert get_order(db).status == "pending"
    assert calls == []


def test_wechat_unknown_order_rejected(wechat_gateway):
    gateway, _, calls = wechat_gateway
    db = make_db()
    add_user_plan_order(db, payment_method="wechat")

    gateway(wechat_resource(out_trade_no="order-404"))
    assert service.handle_wechat_notify(db, {}, b"body") == {"code": "FAIL", "message": "订单不存在"}
    assert calls == []


def test_wechat_missing_plan_fails_without_paid_state(wechat_gateway):
    gateway, _, calls = wechat_gateway
    db = make_db()
    add_user_plan_order(db, payment_method="wechat")
    db.query(Plan).filter(Plan.code == "basic").delete()
    db.commit()

    gateway(wechat_resource())
    result = service.handle_wechat_notify(db, {}, b"body")

    assert result == {"code": "FAIL", "message": "套餐不存在"}
    assert get_order(db).status == "pending"
    assert calls == ["order-1"]  # integrity checks passed; claim+plan missing rolled back
    assert db.query(SubscriptionHistory).count() == 0
