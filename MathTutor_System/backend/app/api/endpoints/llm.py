import asyncio
import re
import time
from dataclasses import replace

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.endpoints.auth import get_current_user
from app.core.llm_sanitize import mask_secrets
from app.core.deps import LLMConfig, client_llm_config_allowed, get_llm_config
from app.core.config import get_settings
from app.core.ai_runtime import AIConfigError, resolve_server_llm_config
from app.models.user import User
from app.services.llm_client_service import call_llm_async

router = APIRouter()


class LLMTestResponse(BaseModel):
    ok: bool
    provider: str | None = None
    model: str | None = None
    latency_ms: int | None = None
    key_source: str | None = None
    code: str | None = None
    message: str


class LLMRuntimeStatus(BaseModel):
    configured: bool
    provider: str
    model: str
    config_source: str
    client_config_allowed: bool


@router.get("/status", response_model=LLMRuntimeStatus)
def get_llm_runtime_status(_current_user: User = Depends(get_current_user)) -> LLMRuntimeStatus:
    """Expose safe server configuration state without credential details."""
    settings = get_settings()
    try:
        config = resolve_server_llm_config(settings, require_key=False)
        configured = bool(config.api_key)
        provider, model, server_key = config.provider, config.model, config.api_key
    except AIConfigError:
        configured = False
        provider, model, server_key = settings.llm_provider, settings.llm_model, settings.llm_api_key
    return LLMRuntimeStatus(
        configured=configured,
        provider=_safe_runtime_label(provider, server_key),
        model=_safe_runtime_label(model, server_key),
        config_source="server",
        client_config_allowed=settings.client_llm_config_allowed,
    )


def _safe_runtime_label(value: str, server_key: str) -> str:
    label = str(value or "").strip()
    if not label:
        return ""
    if server_key and len(server_key) >= 4:
        fragments = {server_key, server_key[:8], server_key[-8:]}
        if any(fragment and fragment in label for fragment in fragments):
            return "configured"
    if mask_secrets(label) != label or not re.fullmatch(r"[A-Za-z0-9._:/-]{1,100}", label):
        return "configured"
    return label


@router.post("/test", response_model=LLMTestResponse)
async def test_llm_connection(
    current_user: User = Depends(get_current_user),
    llm_config: LLMConfig = Depends(get_llm_config),
) -> LLMTestResponse:
    if not (llm_config.api_key or "").strip():
        return LLMTestResponse(
            ok=False,
            provider=_safe_runtime_label(llm_config.provider, llm_config.api_key) or None,
            model=_safe_runtime_label(llm_config.model, llm_config.api_key) or None,
            key_source=llm_config.source,
            code="missing_key",
            message="未配置 API Key，请在设置中保存有效配置，或由管理员配置后端密钥。",
        )
    if not (llm_config.provider or "").strip():
        return LLMTestResponse(ok=False, code="unsupported_provider", message="未配置 Provider。")
    if not (llm_config.model or "").strip():
        return LLMTestResponse(
            ok=False,
            provider=_safe_runtime_label(llm_config.provider, llm_config.api_key) or None,
            key_source=llm_config.source,
            code="model_not_found",
            message="未配置模型，请在设置中选择模型。",
        )

    llm_config = replace(llm_config, request_timeout=get_settings().ai_test_timeout)
    started = time.perf_counter()
    try:
        await asyncio.wait_for(
            call_llm_async("请只回复：ok", llm_config, temperature=0, max_tokens=8),
            timeout=get_settings().ai_test_timeout,
        )
    except Exception as exc:
        code, message = _classify_llm_error(exc)
        return LLMTestResponse(
            ok=False,
            provider=_safe_runtime_label(llm_config.provider, llm_config.api_key) or None,
            model=_safe_runtime_label(llm_config.model, llm_config.api_key) or None,
            latency_ms=int((time.perf_counter() - started) * 1000),
            key_source=llm_config.source,
            code=code,
            message=message,
        )

    return LLMTestResponse(
        ok=True,
        provider=_safe_runtime_label(llm_config.provider, llm_config.api_key) or None,
        model=_safe_runtime_label(llm_config.model, llm_config.api_key) or None,
        latency_ms=int((time.perf_counter() - started) * 1000),
        key_source=llm_config.source,
        message="模型连接正常",
    )


def _classify_llm_error(exc: Exception) -> tuple[str, str]:
    name = type(exc).__name__.lower()
    message = str(exc or "").lower()
    if isinstance(exc, asyncio.TimeoutError) or "timeout" in name or "timed out" in message:
        return "timeout", "模型请求超时，请稍后重试或检查网络连接。"
    if "authentication" in name or "unauthorized" in message or "401" in message or "api key" in message:
        return "invalid_key", "API Key 无效或没有访问该模型的权限。"
    if "not found" in message or "404" in message:
        return "model_not_found", "模型不存在或当前账号无权访问该模型。"
    if "base url" in message or "invalid url" in message:
        return "invalid_base_url", "Base URL 无效，请检查模型服务地址。"
    if "unsupported" in message:
        return "unsupported_provider", "当前 Provider 暂不支持。"
    return "provider_unreachable", "模型连接失败，请检查 Base URL、模型名称与网络。"
