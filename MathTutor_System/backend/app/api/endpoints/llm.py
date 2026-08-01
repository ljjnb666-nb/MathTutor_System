import asyncio
import time

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.deps import LLMConfig, get_llm_config
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


@router.post("/test", response_model=LLMTestResponse)
async def test_llm_connection(llm_config: LLMConfig = Depends(get_llm_config)) -> LLMTestResponse:
    if not (llm_config.api_key or "").strip():
        return LLMTestResponse(
            ok=False,
            provider=llm_config.provider or None,
            model=llm_config.model or None,
            key_source=llm_config.source,
            code="missing_key",
            message="未配置 API Key，请在设置中保存有效配置，或由管理员配置后端密钥。",
        )
    if not (llm_config.provider or "").strip():
        return LLMTestResponse(ok=False, code="unsupported_provider", message="未配置 Provider。")
    if not (llm_config.model or "").strip():
        return LLMTestResponse(
            ok=False,
            provider=llm_config.provider or None,
            key_source=llm_config.source,
            code="model_not_found",
            message="未配置模型，请在设置中选择模型。",
        )

    started = time.perf_counter()
    try:
        await asyncio.wait_for(
            call_llm_async("请只回复：ok", llm_config, temperature=0, max_tokens=8),
            timeout=30,
        )
    except Exception as exc:
        code, message = _classify_llm_error(exc)
        return LLMTestResponse(
            ok=False,
            provider=llm_config.provider or None,
            model=llm_config.model or None,
            latency_ms=int((time.perf_counter() - started) * 1000),
            key_source=llm_config.source,
            code=code,
            message=message,
        )

    return LLMTestResponse(
        ok=True,
        provider=llm_config.provider or None,
        model=llm_config.model or None,
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
