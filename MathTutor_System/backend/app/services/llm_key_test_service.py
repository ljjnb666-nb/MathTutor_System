"""Utilities for testing whether an LLM API key can complete a minimal request."""
import time
from collections.abc import Awaitable, Callable
from typing import Any
from urllib.parse import urljoin

import httpx

from app.core.deps import LLMConfig
from app.services.llm_client_service import call_llm_async


TEST_PROMPT = 'Return exactly this JSON object and nothing else: {"ok": true}'
DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com"


def _sanitize_error(message: str, api_key: str) -> str:
    text = (message or "").strip() or "LLM connection test failed"
    key = (api_key or "").strip()
    if key:
        text = text.replace(key, "[redacted]")
        if len(key) >= 12:
            text = text.replace(key[:8], "[redacted]")
            text = text.replace(key[-4:], "[redacted]")
    return text[:300]


async def _check_deepseek_models_endpoint(api_key: str, base_url: str) -> None:
    root = (base_url or DEFAULT_DEEPSEEK_BASE_URL).rstrip("/") + "/"
    url = urljoin(root, "models")
    async with httpx.AsyncClient(timeout=15.0, trust_env=True) as client:
        response = await client.get(url, headers={"Authorization": f"Bearer {api_key}"})
    if response.status_code in (401, 403):
        raise ValueError("DeepSeek API Key 认证失败，请确认 key 未过期、未撤销，且没有复制多余空格。")
    if response.status_code == 402:
        raise ValueError("DeepSeek 账户余额不足或计费状态异常。")
    if response.status_code >= 400:
        detail = ""
        try:
            payload = response.json()
            detail = payload.get("error", {}).get("message") or payload.get("message") or ""
        except Exception:
            detail = response.text
        raise ValueError(f"DeepSeek 连接测试失败：HTTP {response.status_code} {detail}".strip())


async def test_llm_api_key(
    llm_config: LLMConfig,
    *,
    caller: Callable[[str, Any], Awaitable[str]] = call_llm_async,
    deepseek_checker: Callable[[str, str], Awaitable[None]] = _check_deepseek_models_endpoint,
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
        if provider == "deepseek" or "deepseek" in base_url.lower():
            await deepseek_checker(api_key, base_url)
        else:
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
