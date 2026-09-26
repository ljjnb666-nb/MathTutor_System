"""
PHASE 2A-5：支付宝异步回调 ACK 传输契约（纯文本 success/failure）端点级测试。

支付宝要求应答为字面量纯文本 "success"/"failure"；
内部业务结果 {"code", "msg"} 不得透传给支付宝。
"""
import pytest
from fastapi.testclient import TestClient

import app.api.endpoints.orders as orders_endpoint
from app.main import app
from app.models.base import get_db

client = TestClient(app)

REPRESENTATIVE_FORM = {
    "out_trade_no": "MT20260927000001",
    "trade_status": "TRADE_SUCCESS",
    "trade_no": "2026092722001400001",
    "app_id": "2021003100000001",
    "total_amount": "99.00",
}


@pytest.fixture
def override_db():
    """隔离 get_db：端点测试不触碰真实数据库，结束后清理覆盖。"""
    sentinel = object()
    app.dependency_overrides[get_db] = lambda: sentinel
    yield sentinel
    app.dependency_overrides.pop(get_db, None)


def _mock_service(monkeypatch, result):
    """替换服务层并捕获端点传入的 (db, data)。"""
    captured = {}

    def fake_handle_alipay_notify(db, data):
        captured["db"] = db
        captured["data"] = dict(data)
        return result

    monkeypatch.setattr(orders_endpoint, "handle_alipay_notify", fake_handle_alipay_notify)
    return captured


def _post_notify():
    return client.post(
        "/api/payment/notify/alipay",
        data=REPRESENTATIVE_FORM,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )


def test_success_ack_is_exact_plain_text(monkeypatch, override_db):
    # ACK-HTTP-01：首次处理成功 -> 200 + 字面量 "success" 纯文本，无 JSON/引号/业务 msg。
    _mock_service(monkeypatch, {"code": "success", "msg": "处理成功"})

    response = _post_notify()

    assert response.status_code == 200
    assert response.text == "success"
    assert response.headers["content-type"].startswith("text/plain")
    assert "{" not in response.text
    assert '"' not in response.text
    assert "处理成功" not in response.text


def test_replay_ack_is_success(monkeypatch, override_db):
    # ACK-HTTP-02：幂等重放（已处理）同样必须 ACK success，否则支付宝会无限重试。
    _mock_service(monkeypatch, {"code": "success", "msg": "已处理"})

    response = _post_notify()

    assert response.status_code == 200
    assert response.text == "success"
    assert response.headers["content-type"].startswith("text/plain")


def test_ignored_trade_status_ack_is_success(monkeypatch, override_db):
    # ACK-HTTP-03：已处理的非成功交易状态 -> success；以 code 判定而非中文 msg。
    _mock_service(monkeypatch, {"code": "success", "msg": "忽略非成功状态"})

    response = _post_notify()

    assert response.status_code == 200
    assert response.text == "success"
    assert response.headers["content-type"].startswith("text/plain")
    assert "忽略非成功状态" not in response.text


@pytest.mark.parametrize(
    "msg",
    ["验签失败", "应用标识不匹配", "支付金额不匹配", "套餐不存在"],
)
def test_business_failure_ack_is_exact_failure(monkeypatch, override_db, msg):
    # ACK-HTTP-04：业务校验失败 -> 保持 HTTP 200 + 字面量 "failure" 纯文本。
    _mock_service(monkeypatch, {"code": "failure", "msg": msg})

    response = _post_notify()

    assert response.status_code == 200
    assert response.text == "failure"
    assert response.headers["content-type"].startswith("text/plain")
    assert msg not in response.text


def test_unknown_result_fails_closed(monkeypatch, override_db):
    # ACK-HTTP-05：未知业务结果必须 fail-closed，不得 ACK 为 success。
    _mock_service(monkeypatch, {"code": "unexpected", "msg": "未知结果"})

    response = _post_notify()

    assert response.status_code == 200
    assert response.text == "failure"
    assert response.headers["content-type"].startswith("text/plain")


def test_parsed_form_data_is_forwarded_to_service(monkeypatch, override_db):
    # ACK-HTTP-06：端点把解析后的表单 dict 原样传给服务层，传输层重构不破坏回调解析。
    captured = _mock_service(monkeypatch, {"code": "success", "msg": "处理成功"})

    response = _post_notify()

    assert response.status_code == 200
    assert captured["data"] == REPRESENTATIVE_FORM
    assert captured["db"] is override_db


def test_unexpected_exception_is_never_acked_as_success(monkeypatch, override_db):
    # ACK-HTTP-07：服务层意外异常保持 500 行为，绝不能被转换为 success ACK。
    def boom(db, data):
        raise RuntimeError("unexpected persistence failure")

    monkeypatch.setattr(orders_endpoint, "handle_alipay_notify", boom)
    tolerant_client = TestClient(app, raise_server_exceptions=False)

    response = tolerant_client.post(
        "/api/payment/notify/alipay",
        data=REPRESENTATIVE_FORM,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    assert response.status_code == 500
    assert response.text != "success"
