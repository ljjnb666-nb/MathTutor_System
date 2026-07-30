"""Utilities for testing whether an LLM API key can complete a minimal request."""
import time
from collections.abc import Awaitable, Callable
from typing import Any

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


def _normalize_base_url(base_url: str, default: str) -> str:
    root = (base_url or default).strip()
    if not root:
        return ""
    if not root.startswith(("http://", "https://")):
        root = "https://" + root
    return root.rstrip("/")


def _deepseek_model_urls(base_url: str) -> list[str]:
    root = _normalize_base_url(base_url, DEFAULT_DEEPSEEK_BASE_URL)
    roots = [root]
    if root.endswith("/v1"):
        roots.append(root[:-3])
    else:
        roots.append(root + "/v1")
    urls: list[str] = []
    for item in roots:
        url = item.rstrip("/") + "/models"
        if url not in urls:
            urls.append(url)
    return urls


def _deepseek_error_from_response(response: httpx.Response) -> str:
    try:
        payload = response.json()
        if isinstance(payload, dict):
            error = payload.get("error")
            if isinstance(error, dict):
                return str(error.get("message") or error.get("code") or "")
            return str(payload.get("message") or payload.get("detail") or "")
    except Exception:
        pass
    return response.text[:160]


async def _check_deepseek_models_endpoint(api_key: str, base_url: str) -> None:
    urls = _deepseek_model_urls(base_url)
    attempts: list[str] = []
    auth_failure: str | None = None
    billing_failure: str | None = None

    for trust_env in (True, False):
        mode = "system proxy" if trust_env else "direct"
        async with httpx.AsyncClient(timeout=15.0, trust_env=trust_env) as client:
            for url in urls:
                try:
                    response = await client.get(url, headers={"Authorization": f"Bearer {api_key}"})
                except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout, httpx.ProxyError) as exc:
                    attempts.append(f"{mode} {url}: {type(exc).__name__}")
                    continue
                except httpx.HTTPError as exc:
                    attempts.append(f"{mode} {url}: {type(exc).__name__}")
                    continue

                if 200 <= response.status_code < 300:
                    return
                detail = _deepseek_error_from_response(response)
                attempts.append(f"{mode} {url}: HTTP {response.status_code}")
                if response.status_code in (401, 403):
                    auth_failure = f"DeepSeek API Key 认证失败：HTTP {response.status_code} {detail}".strip()
                elif response.status_code == 402:
                    billing_failure = f"DeepSeek 账户余额不足或计费状态异常：HTTP 402 {detail}".strip()
                elif response.status_code not in (404, 405):
                    raise ValueError(f"DeepSeek 连接测试失败：HTTP {response.status_code} {detail}".strip())

    if auth_failure:
        raise ValueError(auth_failure)
    if billing_failure:
        raise ValueError(billing_failure)
    raise ValueError("DeepSeek 连接测试失败，请检查网络、代理或 Base URL。尝试结果：" + "; ".join(attempts[:4]))


async def test_llm_api_key(
    llm_config: LLMConfig,
    *,
    caller: Callable[[str, Any], Awaitable[str]] = call_llm_async,
    deepseek_checker: Callable[[str, str], Awaitable[None]] = _check_deepseek_models_endpoint,
) -> dict[str, Any]:
    provider = (llm_config.provider or "").strip().lower()
    model = (llm_config.model or "").strip()
    base_url = _normalize_base_url(llm_config.base_url or "", DEFAULT_DEEPSEEK_BASE_URL if provider == "deepseek" else "")
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
