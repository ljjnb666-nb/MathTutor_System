"""
订单与支付：创建订单、支付宝/微信异步回调、支付配置查询
"""
import json
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.core.config import ALIPAY_ENABLED, ALIPAY_RETURN_URL, WECHAT_PAY_ENABLED
from app.models.base import get_db
from app.models.order import Order
from app.models.plan import Plan
from app.models.subscription import Subscription
from app.models.subscription_history import SubscriptionHistory
from app.models.user import User
from app.services.payment_service import (
    create_alipay_order,
    create_wechat_native_order,
    verify_alipay_notify,
    verify_wechat_callback,
)

router = APIRouter()


def _utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class CreateOrderRequest(BaseModel):
    """创建订单请求"""
    plan_code: str = Field(..., description="套餐 code，如 basic / pro")
    payment_method: str = Field(..., description="支付方式：alipay | wechat")
    period_months: int = Field(default=1, ge=1, le=120, description="购买月数，12 表示年付")


class CreateOrderResponse(BaseModel):
    """创建订单响应：支付宝返回 pay_url；微信返回 code_url（前端生成二维码）"""
    out_trade_no: str = ""
    pay_url: str = ""
    code_url: str = ""
    message: str = ""


@router.get("/payment/config")
def get_payment_config():
    """获取支付配置：是否已接入支付宝/微信，供前端显示购买按钮"""
    return {
        "alipay_enabled": ALIPAY_ENABLED,
        "wechat_enabled": WECHAT_PAY_ENABLED,
        "return_url": ALIPAY_RETURN_URL or "",
    }


@router.post("/orders", response_model=CreateOrderResponse)
def create_order(
    body: CreateOrderRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CreateOrderResponse:
    """
    创建订单并返回支付链接。
    仅支持 alipay；wechat 预留。需配置 ALIPAY_* 环境变量。
    """
    if body.payment_method not in ("alipay", "wechat"):
        raise HTTPException(status_code=400, detail="支付方式仅支持 alipay 或 wechat")

    plan = db.query(Plan).filter(Plan.code == body.plan_code).first()
    if not plan:
        raise HTTPException(status_code=400, detail=f"套餐 {body.plan_code!r} 不存在")
    if (plan.price_monthly or 0) <= 0:
        raise HTTPException(status_code=400, detail="免费套餐无需购买")

    if body.period_months >= 12 and plan.price_yearly and plan.price_yearly > 0:
        amount = float(plan.price_yearly) * (body.period_months // 12)
        if body.period_months % 12:
            amount += float(plan.price_monthly or 0) * (body.period_months % 12)
    else:
        amount = float(plan.price_monthly or 0) * body.period_months

    out_trade_no = f"MT{datetime.now().strftime('%Y%m%d%H%M%S')}{uuid.uuid4().hex[:12].upper()}"

    order = Order(
        user_id=current_user.id,
        plan_id=plan.id,
        amount=amount,
        currency="CNY",
        status="pending",
        payment_method=body.payment_method,
        period_months=body.period_months,
        out_trade_no=out_trade_no,
    )
    db.add(order)
    db.commit()

    # ----- 微信 Native 扫码 -----
    if body.payment_method == "wechat":
        if not WECHAT_PAY_ENABLED:
            return CreateOrderResponse(
                out_trade_no=out_trade_no,
                message="微信支付尚未接入，请使用支付宝或联系管理员。",
            )
        subject = f"MathTutor-{plan.name}-{body.period_months}月"
        code_url = create_wechat_native_order(
            out_trade_no=out_trade_no,
            total_amount_yuan=amount,
            description=subject,
        )
        if not code_url:
            order.status = "failed"
            db.commit()
            return CreateOrderResponse(
                out_trade_no=out_trade_no,
                message="生成微信支付二维码失败，请稍后重试或联系管理员。",
            )
        return CreateOrderResponse(
            out_trade_no=out_trade_no,
            code_url=code_url,
            message="请使用微信扫描二维码完成支付。",
        )

    # ----- 支付宝 -----
    if not ALIPAY_ENABLED:
        return CreateOrderResponse(
            out_trade_no="",
            message="支付接口尚未接入，请稍后或联系管理员。",
        )

    subject = f"MathTutor-{plan.name}-{body.period_months}月"
    return_url = ALIPAY_RETURN_URL or ""
    pay_url = create_alipay_order(
        out_trade_no=out_trade_no,
        total_amount=amount,
        subject=subject,
        return_url=return_url,
        notify_url="",
    )

    if not pay_url:
        order.status = "failed"
        db.commit()
        return CreateOrderResponse(
            out_trade_no=out_trade_no,
            message="生成支付链接失败，请稍后重试或联系管理员。",
        )

    return CreateOrderResponse(
        out_trade_no=out_trade_no,
        pay_url=pay_url,
        message="请在新窗口完成支付。",
    )


@router.get("/orders/{out_trade_no}/status")
def get_order_status(
    out_trade_no: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """查询订单支付状态，供前端轮询"""
    order = db.query(Order).filter(
        Order.out_trade_no == out_trade_no,
        Order.user_id == current_user.id,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="订单不存在")
    return {"out_trade_no": order.out_trade_no, "status": order.status}


@router.post("/payment/notify/alipay")
async def alipay_notify(request: Request, db: Session = Depends(get_db)):
    """
    支付宝异步回调。验签 -> 幂等更新订单 -> 更新用户订阅。
    支付宝以 application/x-www-form-urlencoded 发送 POST。
    """
    try:
        body = await request.form()
    except Exception:
        body = {}
    data = dict(body)

    if not verify_alipay_notify(data):
        return {"code": "failure", "msg": "验签失败"}

    trade_status = data.get("trade_status")
    if trade_status != "TRADE_SUCCESS" and trade_status != "TRADE_FINISHED":
        return {"code": "success", "msg": "忽略非成功状态"}

    out_trade_no = data.get("out_trade_no")
    third_trade_no = data.get("trade_no")
    if not out_trade_no:
        return {"code": "failure", "msg": "缺少 out_trade_no"}

    order = db.query(Order).filter(Order.out_trade_no == out_trade_no).first()
    if not order:
        return {"code": "failure", "msg": "订单不存在"}

    if order.status == "paid":
        return {"code": "success", "msg": "已处理"}

    now = _utc_now()
    order.status = "paid"
    order.third_party_trade_no = third_trade_no
    order.paid_at = now
    db.commit()

    # 更新订阅：续期或升级
    user_id = order.user_id
    plan_id = order.plan_id
    period_months = order.period_months or 1
    period_days = period_months * 30

    sub = db.query(Subscription).filter(Subscription.user_id == user_id).first()
    plan = db.get(Plan, plan_id)
    if not plan:
        return {"code": "success", "msg": "套餐不存在，订单已标记 paid"}

    if sub:
        # 若当前已是该套餐或免费，在原 period_end 基础上续期
        if sub.plan_id == plan_id:
            base = sub.period_end if sub.period_end and sub.period_end > now else now
            sub.period_end = base + timedelta(days=period_days)
        else:
            # 升级/更换套餐：从当前时间起算
            sub.plan_id = plan_id
            sub.period_start = now
            sub.period_end = now + timedelta(days=period_days)
        sub.status = "active"
    else:
        sub = Subscription(
            user_id=user_id,
            plan_id=plan_id,
            status="active",
            period_start=now,
            period_end=now + timedelta(days=period_days),
        )
        db.add(sub)

    db.add(SubscriptionHistory(
        user_id=user_id,
        plan_id=plan_id,
        period_start=sub.period_start,
        period_end=sub.period_end,
    ))
    db.commit()

    return {"code": "success", "msg": "处理成功"}


@router.post("/payment/notify/wechat")
async def wechat_notify(request: Request, db: Session = Depends(get_db)):
    """
    微信支付异步回调。验签解密 -> 幂等更新订单 -> 更新用户订阅。
    需在 5 秒内返回 200 + JSON，否则微信会重试。
    """
    try:
        body = await request.body()
    except Exception:
        body = b""
    headers = {k: v for k, v in request.headers.items()}
    result = verify_wechat_callback(headers, body)
    if not result:
        return {"code": "FAIL", "message": "验签或解密失败"}

    if isinstance(result, str):
        try:
            result = json.loads(result)
        except Exception:
            return {"code": "FAIL", "message": "回调数据格式错误"}
    # SDK 可能返回整包（含 resource）或仅 resource 内容
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

    order = db.query(Order).filter(Order.out_trade_no == out_trade_no).first()
    if not order:
        return {"code": "FAIL", "message": "订单不存在"}

    if order.status == "paid":
        return {"code": "SUCCESS", "message": "已处理"}

    now = _utc_now()
    order.status = "paid"
    order.third_party_trade_no = transaction_id
    order.paid_at = now
    db.commit()

    user_id = order.user_id
    plan_id = order.plan_id
    period_months = order.period_months or 1
    period_days = period_months * 30

    sub = db.query(Subscription).filter(Subscription.user_id == user_id).first()
    plan = db.get(Plan, plan_id)
    if plan:
        if sub:
            if sub.plan_id == plan_id:
                base = sub.period_end if sub.period_end and sub.period_end > now else now
                sub.period_end = base + timedelta(days=period_days)
            else:
                sub.plan_id = plan_id
                sub.period_start = now
                sub.period_end = now + timedelta(days=period_days)
            sub.status = "active"
        else:
            sub = Subscription(
                user_id=user_id,
                plan_id=plan_id,
                status="active",
                period_start=now,
                period_end=now + timedelta(days=period_days),
            )
            db.add(sub)
        db.add(SubscriptionHistory(
            user_id=user_id,
            plan_id=plan_id,
            period_start=sub.period_start,
            period_end=sub.period_end,
        ))
        db.commit()

    return {"code": "SUCCESS", "message": "成功"}


@router.post("/payment/notify")
def payment_notify_fallback():
    """旧路径重定向：建议使用 /api/payment/notify/alipay 或 /api/payment/notify/wechat"""
    raise HTTPException(status_code=501, detail="请使用 /api/payment/notify/alipay 或 /api/payment/notify/wechat")
