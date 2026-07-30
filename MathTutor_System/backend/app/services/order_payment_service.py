"""Order creation and payment callback business logic."""
import json
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.config import ALIPAY_ENABLED, ALIPAY_RETURN_URL, WECHAT_PAY_ENABLED
from app.models.order import Order
from app.models.plan import Plan
from app.models.subscription import Subscription
from app.models.subscription_history import SubscriptionHistory
from app.services.payment_service import (
    create_alipay_order,
    create_wechat_native_order,
    verify_alipay_notify,
    verify_wechat_callback,
)


class OrderPaymentServiceError(Exception):
    """Domain error that endpoints map to HTTP responses."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def calculate_order_amount(plan: Plan, period_months: int) -> float:
    if (plan.price_monthly or 0) <= 0:
        raise OrderPaymentServiceError(400, "免费套餐无需购买")

    if period_months >= 12 and plan.price_yearly and plan.price_yearly > 0:
        amount = float(plan.price_yearly) * (period_months // 12)
        if period_months % 12:
            amount += float(plan.price_monthly or 0) * (period_months % 12)
        return amount
    return float(plan.price_monthly or 0) * period_months


def create_payment_order(
    db: Session,
    *,
    user_id: int,
    plan_code: str,
    payment_method: str,
    period_months: int,
) -> dict:
    if payment_method not in ("alipay", "wechat"):
        raise OrderPaymentServiceError(400, "支付方式仅支持 alipay 或 wechat")

    plan = db.query(Plan).filter(Plan.code == plan_code).first()
    if not plan:
        raise OrderPaymentServiceError(400, f"套餐 {plan_code!r} 不存在")

    amount = calculate_order_amount(plan, period_months)
    out_trade_no = f"MT{datetime.now().strftime('%Y%m%d%H%M%S')}{uuid.uuid4().hex[:12].upper()}"
    order = Order(
        user_id=user_id,
        plan_id=plan.id,
        amount=amount,
        currency="CNY",
        status="pending",
        payment_method=payment_method,
        period_months=period_months,
        out_trade_no=out_trade_no,
    )
    db.add(order)
    db.commit()

    subject = f"MathTutor-{plan.name}-{period_months}月"
    if payment_method == "wechat":
        return _build_wechat_order_response(db, order, amount, subject)
    return _build_alipay_order_response(db, order, amount, subject)


def _build_wechat_order_response(db: Session, order: Order, amount: float, subject: str) -> dict:
    if not WECHAT_PAY_ENABLED:
        return {
            "out_trade_no": order.out_trade_no,
            "message": "微信支付尚未接入，请使用支付宝或联系管理员。",
        }

    code_url = create_wechat_native_order(
        out_trade_no=order.out_trade_no,
        total_amount_yuan=amount,
        description=subject,
    )
    if not code_url:
        order.status = "failed"
        db.commit()
        return {
            "out_trade_no": order.out_trade_no,
            "message": "生成微信支付二维码失败，请稍后重试或联系管理员。",
        }
    return {
        "out_trade_no": order.out_trade_no,
        "code_url": code_url,
        "message": "请使用微信扫描二维码完成支付。",
    }


def _build_alipay_order_response(db: Session, order: Order, amount: float, subject: str) -> dict:
    if not ALIPAY_ENABLED:
        return {
            "out_trade_no": "",
            "message": "支付接口尚未接入，请稍后或联系管理员。",
        }

    pay_url = create_alipay_order(
        out_trade_no=order.out_trade_no,
        total_amount=amount,
        subject=subject,
        return_url=ALIPAY_RETURN_URL or "",
        notify_url="",
    )
    if not pay_url:
        order.status = "failed"
        db.commit()
        return {
            "out_trade_no": order.out_trade_no,
            "message": "生成支付链接失败，请稍后重试或联系管理员。",
        }
    return {
        "out_trade_no": order.out_trade_no,
        "pay_url": pay_url,
        "message": "请在新窗口完成支付。",
    }


def get_order_status_for_user(db: Session, *, out_trade_no: str, user_id: int) -> dict:
    order = (
        db.query(Order)
        .filter(
            Order.out_trade_no == out_trade_no,
            Order.user_id == user_id,
        )
        .first()
    )
    if not order:
        raise OrderPaymentServiceError(404, "订单不存在")
    return {"out_trade_no": order.out_trade_no, "status": order.status}


def apply_paid_order(db: Session, *, out_trade_no: str, third_trade_no: str | None) -> str:
    order = db.query(Order).filter(Order.out_trade_no == out_trade_no).first()
    if not order:
        return "订单不存在"
    if order.status == "paid":
        return "已处理"

    now = utc_now()
    order.status = "paid"
    order.third_party_trade_no = third_trade_no
    order.paid_at = now
    db.commit()

    plan = db.get(Plan, order.plan_id)
    if not plan:
        return "套餐不存在，订单已标记 paid"

    period_days = (order.period_months or 1) * 30
    sub = db.query(Subscription).filter(Subscription.user_id == order.user_id).first()
    if sub:
        if sub.plan_id == order.plan_id:
            base = sub.period_end if sub.period_end and sub.period_end > now else now
            sub.period_end = base + timedelta(days=period_days)
        else:
            sub.plan_id = order.plan_id
            sub.period_start = now
            sub.period_end = now + timedelta(days=period_days)
        sub.status = "active"
    else:
        sub = Subscription(
            user_id=order.user_id,
            plan_id=order.plan_id,
            status="active",
            period_start=now,
            period_end=now + timedelta(days=period_days),
        )
        db.add(sub)

    db.add(
        SubscriptionHistory(
            user_id=order.user_id,
            plan_id=order.plan_id,
            period_start=sub.period_start,
            period_end=sub.period_end,
        )
    )
    db.commit()
    return "处理成功"


def handle_alipay_notify(db: Session, data: dict) -> dict:
    if not verify_alipay_notify(data):
        return {"code": "failure", "msg": "验签失败"}

    trade_status = data.get("trade_status")
    if trade_status not in ("TRADE_SUCCESS", "TRADE_FINISHED"):
        return {"code": "success", "msg": "忽略非成功状态"}

    out_trade_no = data.get("out_trade_no")
    if not out_trade_no:
        return {"code": "failure", "msg": "缺少 out_trade_no"}

    msg = apply_paid_order(db, out_trade_no=out_trade_no, third_trade_no=data.get("trade_no"))
    if msg == "订单不存在":
        return {"code": "failure", "msg": msg}
    return {"code": "success", "msg": msg}


def handle_wechat_notify(db: Session, headers: dict, body: str | bytes) -> dict:
    result = verify_wechat_callback(headers, body)
    if not result:
        return {"code": "FAIL", "message": "验签或解密失败"}

    if isinstance(result, str):
        try:
            result = json.loads(result)
        except Exception:
            return {"code": "FAIL", "message": "回调数据格式错误"}

    res = result if isinstance(result.get("out_trade_no"), str) else result.get("resource") or result
    if isinstance(res, str):
        try:
            res = json.loads(res)
        except Exception:
            res = {}

    out_trade_no = res.get("out_trade_no")
    trade_state = res.get("trade_state")
    transaction_id = res.get("transaction_id")
    if not out_trade_no:
        return {"code": "FAIL", "message": "缺少 out_trade_no"}
    if trade_state != "SUCCESS":
        return {"code": "SUCCESS", "message": "忽略非成功状态"}

    msg = apply_paid_order(db, out_trade_no=out_trade_no, third_trade_no=transaction_id)
    if msg == "订单不存在":
        return {"code": "FAIL", "message": msg}
    if msg == "已处理":
        return {"code": "SUCCESS", "message": msg}
    return {"code": "SUCCESS", "message": "成功"}
