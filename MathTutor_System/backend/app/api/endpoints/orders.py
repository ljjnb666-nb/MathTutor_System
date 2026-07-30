"""
订单与支付：创建订单、支付宝/微信异步回调、支付配置查询
"""
from fastapi import APIRouter, Depends, Form, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.core.config import ALIPAY_ENABLED, ALIPAY_RETURN_URL, WECHAT_PAY_ENABLED
from app.models.base import get_db
from app.models.user import User
from app.services.order_payment_service import (
    OrderPaymentServiceError,
    create_payment_order,
    get_order_status_for_user,
    handle_alipay_notify,
    handle_wechat_notify,
)

router = APIRouter()


def _raise_http_error(exc: OrderPaymentServiceError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.detail)


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
    try:
        result = create_payment_order(
            db,
            user_id=current_user.id,
            plan_code=body.plan_code,
            payment_method=body.payment_method,
            period_months=body.period_months,
        )
        return CreateOrderResponse(**result)
    except OrderPaymentServiceError as exc:
        _raise_http_error(exc)


@router.get("/orders/{out_trade_no}/status")
def get_order_status(
    out_trade_no: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """查询订单支付状态，供前端轮询"""
    try:
        return get_order_status_for_user(db, out_trade_no=out_trade_no, user_id=current_user.id)
    except OrderPaymentServiceError as exc:
        _raise_http_error(exc)


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

    return handle_alipay_notify(db, data)


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
    headers = {key: value for key, value in request.headers.items()}
    return handle_wechat_notify(db, headers, body)


@router.post("/payment/notify")
def payment_notify_fallback():
    """旧路径重定向：建议使用 /api/payment/notify/alipay 或 /api/payment/notify/wechat"""
    raise HTTPException(status_code=501, detail="请使用 /api/payment/notify/alipay 或 /api/payment/notify/wechat")
