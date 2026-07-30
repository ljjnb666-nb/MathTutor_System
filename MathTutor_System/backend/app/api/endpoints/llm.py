"""Safe LLM status and connectivity endpoints."""
from __future__ import annotations

import asyncio
import time

from fastapi import APIRouter, Header
from pydantic import BaseModel

from app.core.llm_config import LLMConfig, LLM_NOT_CONFIGURED_DETAIL, llm_status_payload, resolve_llm_config
from app.services.llm_client_service import call_llm_async

router = APIRouter()


class LLMTestResponse(BaseModel):
    success: bool
    provider: str | None = None
    model: str | None = None
    latency_ms: int | None = None
    code: str | None = None
    message: str


def _classify_llm_error(exc: Exception) -> tuple[str, str]:
    name = type(exc).__name__.lower()
    message = str(exc or "").lower()
    if isinstance(exc, asyncio.TimeoutError) or "timeout" in name or "timed out" in message:
        return "LLM_TIMEOUT", "模型请求超时，请稍后重试或检查网络连接。"
    if "authentication" in name or "unauthorized" in message or "401" in message or "api key" in message:
        return "LLM_AUTH_FAILED", "API Key 无效或没有访问该模型的权限。"
    if "notfound" in name or "not found" in message or "404" in message:
        return "LLM_MODEL_NOT_FOUND", "模型不存在或当前账号无权访问该模型。"
    if "rate" in message or "429" in message:
        return "LLM_RATE_LIMITED", "模型服务限流，请稍后重试。"
    if "unsupported" in message:
        return "LLM_PROVIDER_UNSUPPORTED", "当前模型服务商暂不支持。"
    if "base url" in message or "invalid url" in message or "url" in name:
        return "LLM_BASE_URL_INVALID", "Base URL 无效，请检查模型服务地址。"
    if "json" in message or "response" in message:
        return "LLM_RESPONSE_INVALID", "模型响应格式异常，请检查模型兼容性。"
    return "LLM_CONNECTION_FAILED", "模型连接失败，请检查 Base URL、模型名称与网络。"


def _config_from_headers(
    x_llm_provider: str | None,
    x_llm_api_key: str | None,
    x_llm_base_url: str | None,
    x_llm_model: str | None,
) -> LLMConfig:
    return resolve_llm_config(
        {
            "x-llm-provider": x_llm_provider,
            "x-llm-api-key": x_llm_api_key,
            "x-llm-base-url": x_llm_base_url,
            "x-llm-model": x_llm_model,
        }
    )


@router.get("/status")
def llm_status() -> dict:
    return llm_status_payload()


@router.post("/test", response_model=LLMTestResponse)
async def test_llm_connection(
    x_llm_provider: str | None = Header(None, alias="x-llm-provider"),
    x_llm_api_key: str | None = Header(None, alias="x-llm-api-key"),
    x_llm_base_url: str | None = Header(None, alias="x-llm-base-url"),
    x_llm_model: str | None = Header(None, alias="x-llm-model"),
) -> LLMTestResponse:
    config = _config_from_headers(x_llm_provider, x_llm_api_key, x_llm_base_url, x_llm_model)
    if not config.configured:
        return LLMTestResponse(
            success=False,
            provider=config.provider or None,
            model=config.model or None,
            code=LLM_NOT_CONFIGURED_DETAIL["code"],
            message=LLM_NOT_CONFIGURED_DETAIL["message"],
        )

    started = time.perf_counter()
    try:
        await asyncio.wait_for(
            call_llm_async("请只回复一个中文词：正常", config, temperature=0, max_tokens=16),
            timeout=30,
        )
    except Exception as exc:
        code, message = _classify_llm_error(exc)
        return LLMTestResponse(
            success=False,
            provider=config.provider or None,
            model=config.model or None,
            latency_ms=int((time.perf_counter() - started) * 1000),
            code=code,
            message=message,
        )

    return LLMTestResponse(
        success=True,
        provider=config.provider or None,
        model=config.model or None,
        latency_ms=int((time.perf_counter() - started) * 1000),
        message="模型连接正常",
    )
