"""
支付服务：支付宝电脑网站支付（扫码/跳转）、微信支付 Native 扫码
"""
from pathlib import Path

from app.core.config import (
    ALIPAY_APP_ID,
    ALIPAY_DEBUG,
    ALIPAY_ENABLED,
    ALIPAY_NOTIFY_URL,
    ALIPAY_PRIVATE_KEY,
    ALIPAY_PUBLIC_KEY,
    ALIPAY_RETURN_URL,
    WECHAT_APIV3_KEY,
    WECHAT_APPID,
    WECHAT_CERT_DIR,
    WECHAT_CERT_SERIAL_NO,
    WECHAT_MCHID,
    WECHAT_NOTIFY_URL,
    WECHAT_PAY_ENABLED,
    WECHAT_PRIVATE_KEY,
)


def _load_key(value: str) -> str:
    """从环境变量值加载密钥：支持裸 PEM 或 file:path 形式"""
    if not value or not value.strip():
        return ""
    s = value.strip()
    if s.lower().startswith("file:"):
        path = Path(s[5:].strip())
        if not path.is_absolute():
            path = Path(__file__).resolve().parent.parent.parent / path
        if path.exists():
            return path.read_text(encoding="utf-8").strip()
        return ""
    return s


def get_alipay_client():
    """
    获取支付宝客户端（仅当配置完整时有效）。
    沙箱：ALIPAY_DEBUG=1；正式：ALIPAY_DEBUG=0
    """
    if not ALIPAY_ENABLED:
        return None
    try:
        from alipay import AliPay

        private_key = _load_key(ALIPAY_PRIVATE_KEY)
        public_key = _load_key(ALIPAY_PUBLIC_KEY)
        if not private_key or not public_key:
            return None
        return AliPay(
            appid=ALIPAY_APP_ID,
            app_private_key_string=private_key,
            alipay_public_key_string=public_key,
            sign_type="RSA2",
            debug=ALIPAY_DEBUG,
        )
    except ImportError:
        return None


def create_alipay_order(
    out_trade_no: str,
    total_amount: float,
    subject: str,
    return_url: str = "",
    notify_url: str = "",
) -> str | None:
    """
    创建支付宝电脑网站支付订单，返回支付 URL（需用户跳转或扫码）。
    total_amount 单位为元，最多两位小数。
    """
    client = get_alipay_client()
    if not client:
        return None
    notify = notify_url or ALIPAY_NOTIFY_URL
    if not notify:
        return None
    return_url = return_url or ALIPAY_RETURN_URL
    try:
        order_string = client.api_alipay_trade_page_pay(
            out_trade_no=out_trade_no,
            total_amount=str(round(total_amount, 2)),
            subject=subject,
            return_url=return_url,
            notify_url=notify,
        )
        if ALIPAY_DEBUG:
            base_url = "https://openapi-sandbox.dl.alipaydev.com/gateway.do"
        else:
            base_url = "https://openapi.alipay.com/gateway.do"
        return f"{base_url}?{order_string}"
    except Exception:
        return None


def verify_alipay_notify(data: dict) -> bool:
    """
    验证支付宝异步通知签名。
    data: 回调的 form 或 query 参数 dict，需包含 sign 与 sign_type。
    """
    client = get_alipay_client()
    if not client:
        return False
    sign = data.get("sign")
    sign_type = data.get("sign_type", "RSA2")
    if not sign:
        return False
    # 验签前需移除 sign、sign_type
    sign_data = {k: v for k, v in data.items() if k not in ("sign", "sign_type")}
    try:
        return client.verify(sign_data, sign)
    except Exception:
        return False


# ---------- 微信支付 Native ----------

def get_wechat_private_key() -> str:
    """加载商户私钥，支持裸 PEM 或 file:path"""
    return _load_key(WECHAT_PRIVATE_KEY)


def get_wechat_client():
    """获取微信支付客户端（仅当配置完整时有效）。"""
    if not WECHAT_PAY_ENABLED:
        return None
    key = get_wechat_private_key()
    if not key:
        return None
    try:
        from wechatpayv3 import WeChatPay, WeChatPayType  # noqa: F401 WeChatPayType

        return WeChatPay(
            wechatpay_type=WeChatPayType.NATIVE,
            mchid=WECHAT_MCHID,
            private_key=key,
            cert_serial_no=WECHAT_CERT_SERIAL_NO,
            appid=WECHAT_APPID,
            apiv3_key=WECHAT_APIV3_KEY,
            notify_url=WECHAT_NOTIFY_URL,
            cert_dir=WECHAT_CERT_DIR,
        )
    except ImportError:
        return None


def create_wechat_native_order(
    out_trade_no: str,
    total_amount_yuan: float,
    description: str,
) -> str | None:
    """
    创建微信 Native 订单，返回 code_url（用于生成二维码，用户扫码支付）。
    total_amount_yuan 单位为元；微信要求金额为分，且为整数。
    """
    client = get_wechat_client()
    if not client:
        return None
    total_fen = int(round(total_amount_yuan * 100, 0))
    if total_fen < 1:
        return None
    try:
        from wechatpayv3 import WeChatPayType

        code, message = client.pay(
            description=description,
            out_trade_no=out_trade_no,
            amount={"total": total_fen},
            pay_type=WeChatPayType.NATIVE,
        )
        if code != 200:
            return None
        import json

        data = json.loads(message)
        return data.get("code_url") or None
    except Exception:
        return None


def verify_wechat_callback(headers: dict, body: str | bytes) -> dict | None:
    """
    验证并解密微信支付异步通知。返回解密后的 resource 内容（含 out_trade_no、trade_state 等），失败返回 None。
    """
    client = get_wechat_client()
    if not client:
        return None
    if isinstance(body, bytes):
        body = body.decode("utf-8")
    try:
        result = client.callback(headers, body)
        return result
    except Exception:
        return None
