"""Utilities for testing whether an LLM API key can complete a minimal request."""
import time
from collections.abc import Awaitable, Callable
from typing import Any

from app.core.deps import LLMConfig
from app.services.llm_client_service import call_llm_async


TEST_PROMPT = 'Return exactly this JSON object and nothing else: {"ok": true}'


def _sanitize_error(message: str, api_key: str) -> str:
    text = (message or "").strip() or "LLM connection test failed"
    key = (api_key or "").strip()
    if key:
        text = text.replace(key, "[redacted]")
        if len(key) >= 12:
            text = text.replace(key[:8], "[redacted]")
            text = text.replace(key[-4:], "[redacted]")
    return text[:300]


async def test_llm_api_key(
    llm_config: LLMConfig,
    *,
    caller: Callable[[str, Any], Awaitable[str]] = call_llm_async,
) -> dict[str, Any]:
    provider = (llm_config.provider or "").strip().lower()
    model = (llm_config.model or "").strip()
    base_url = (llm_config.base_url or "").strip()
    api_key = (llm_config.api_key or "").strip()

    if not api_key:
        return {
            "ok": False,
            "provider": provider,
            "model": model,
            "base_url": base_url,
            "latency_ms": 0,
            "message": "未配置 API Key",
        }

    started = time.perf_counter()
    try:
        await caller(TEST_PROMPT, llm_config)
    except Exception as exc:
        return {
            "ok": False,
            "provider": provider,
            "model": model,
            "base_url": base_url,
            "latency_ms": round((time.perf_counter() - started) * 1000),
            "message": _sanitize_error(str(exc), api_key),
        }

    return {
        "ok": True,
        "provider": provider,
        "model": model,
        "base_url": base_url,
        "latency_ms": round((time.perf_counter() - started) * 1000),
        "message": "API Key 可用",
    }
