"""Low-level LLM client adapters used by generation services."""
import asyncio
import json
import logging
from typing import Any

import httpx

from app.services.gemini_rest_service import (
    gemini_rest_with_proxy as _gemini_rest_with_proxy,
    gemini_rest_sync as _gemini_rest_sync,
    resolve_gemini_proxy as _resolve_gemini_proxy,
)
from app.services.llm_output_service import (
    fallback_content_from_message as _fallback_content_from_message,
    get_message_content_safe as _get_message_content_safe,
    normalize_llm_output as _normalize_llm_output,
)

from app.core.ai_runtime import assert_resolved_llm_config

logger = logging.getLogger(__name__)



def _content_or_serialized(raw: Any, msg: Any) -> str:
    if raw is None:
        return str(msg)
    if isinstance(raw, (dict, list)):
        return json.dumps(raw, ensure_ascii=False)
    return str(raw)


def _extract_normalized_message(msg: Any) -> str:
    out = _get_message_content_safe(msg)
    if out is None:
        out = str(msg)
    try:
        return _normalize_llm_output(out)
    except KeyError:
        fallback = _fallback_content_from_message(msg)
        try:
            return _normalize_llm_output(fallback)
        except KeyError:
            return _content_or_serialized(fallback, msg)


def _openai_kwargs(
    *,
    api_key: str,
    model: str,
    base_url: str,
    temperature: float,
    max_tokens: int,
    json_mode: bool,
    request_timeout: int,
    proxy_url: str = "",
    async_mode: bool = False,
) -> dict[str, Any]:
    is_deepseek = bool(base_url and "deepseek" in base_url.lower())
    kwargs: dict[str, Any] = {
        "api_key": api_key,
        "model": model,
        "temperature": 1.0 if is_deepseek else temperature,
        "max_tokens": max_tokens,
        "request_timeout": request_timeout,
        "max_retries": 0,
    }
    if json_mode and not is_deepseek:
        kwargs["model_kwargs"] = {"response_format": {"type": "json_object"}}
    if base_url:
        kwargs["base_url"] = base_url.rstrip("/")
    if async_mode:
        kwargs["http_async_client"] = httpx.AsyncClient(proxy=proxy_url or None, trust_env=False, follow_redirects=False)
    else:
        kwargs["http_client"] = httpx.Client(proxy=proxy_url or None, trust_env=False, follow_redirects=False)
    return kwargs


def _auth_error_message(last_error: Exception | None, *, async_mode: bool) -> str | None:
    err_msg = getattr(last_error, "message", None) or str(last_error or "")
    is_auth_error = (
        type(last_error).__name__ == "AuthenticationError"
        or "api_key" in err_msg.lower()
        or "auth" in err_msg.lower()
        or "401" in err_msg
    )
    if not is_auth_error:
        return None
    if async_mode:
        return (
            "API Key 无效或认证失败。请在前端「设置」中核对 API Key、Base URL"
            "（如 DeepSeek 为 https://api.deepseek.com），保存后重试。"
        )
    return "API Key 无效或已过期，请检查设置中的 API Key"


def call_llm(prompt: str, llm_config: Any, *, temperature: float = 0.3) -> str:
    """Synchronous JSON-oriented LLM call."""
    spec = assert_resolved_llm_config(llm_config)
    provider = spec.transport
    api_key = (llm_config.api_key or "").strip()
    base_url = (llm_config.base_url or "").strip()
    model = (llm_config.model or "").strip()

    last_error: Exception | None = None
    for attempt in range(llm_config.max_retries + 1):
        try:
            if provider == "gemini":
                out = _gemini_rest_sync(prompt, api_key, model, temperature, 8192,
                    _resolve_gemini_proxy(llm_config.proxy_url), request_timeout=llm_config.request_timeout,
                    base_url=llm_config.base_url, api_version=llm_config.api_version)
                return _normalize_llm_output(out)

            try:
                from langchain_openai import ChatOpenAI
            except ImportError as exc:
                raise ValueError("当前环境未安装 langchain-openai，请执行: pip install langchain-openai") from exc

            llm = ChatOpenAI(
                **_openai_kwargs(
                    api_key=api_key,
                    model=model,
                    base_url=base_url,
                    temperature=temperature,
                    max_tokens=8192,
                    json_mode=True,
                    request_timeout=llm_config.request_timeout,
                    proxy_url=llm_config.proxy_url,
                    async_mode=False,
                )
            )
            return _extract_normalized_message(llm.invoke(prompt))
        except ValueError as exc:
            message = str(exc)
            if message.startswith("Gemini 接口返回：当前地区不可用"):
                raise
            raise ValueError("LLM_PROVIDER_ERROR: LLM 调用失败，请检查服务配置与网络后重试。") from None
        except Exception as exc:
            last_error = exc
            logger.warning("LLM 调用第 %s 次失败: %s", attempt + 1, type(exc).__name__)

    auth_message = _auth_error_message(last_error, async_mode=False)
    if auth_message:
        raise ValueError(f"LLM_AUTH_ERROR: {auth_message}") from None
    raise ValueError("LLM_PROVIDER_ERROR: LLM 调用失败，请检查服务配置与网络后重试。") from None


async def call_llm_async(
    prompt: str,
    llm_config: Any,
    *,
    temperature: float = 0.3,
    max_tokens: int = 8192,
) -> str:
    """Async JSON-oriented LLM call for concurrent generation."""
    spec = assert_resolved_llm_config(llm_config)
    provider = spec.transport
    api_key = (llm_config.api_key or "").strip()
    base_url = (llm_config.base_url or "").strip()
    model = (llm_config.model or "").strip()

    last_error: Exception | None = None
    for attempt in range(llm_config.max_retries + 1):
        try:
            if provider == "gemini":
                out = await _gemini_rest_with_proxy(prompt, api_key, model, temperature, max_tokens,
                    _resolve_gemini_proxy(llm_config.proxy_url), request_timeout=llm_config.request_timeout,
                    base_url=llm_config.base_url, api_version=llm_config.api_version)
                try:
                    return _normalize_llm_output(out)
                except KeyError:
                    return out

            try:
                from langchain_openai import ChatOpenAI
            except ImportError as exc:
                raise ValueError("当前环境未安装 langchain-openai，请执行: pip install langchain-openai") from exc

            llm = ChatOpenAI(
                **_openai_kwargs(
                    api_key=api_key,
                    model=model,
                    base_url=base_url,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    json_mode=True,
                    request_timeout=llm_config.request_timeout,
                    proxy_url=llm_config.proxy_url,
                    async_mode=True,
                )
            )
            try:
                if hasattr(llm, "ainvoke"):
                    msg = await llm.ainvoke(prompt)
                else:
                    msg = await asyncio.to_thread(llm.invoke, prompt)
                return _extract_normalized_message(msg)
            except KeyError:
                logger.warning("LLM 返回解析 KeyError（OpenAI/DeepSeek），返回空题目列表")
                return '{"questions":[]}'
        except ValueError as exc:
            message = str(exc)
            if message.startswith("Gemini 接口返回：当前地区不可用"):
                raise
            raise ValueError("LLM_PROVIDER_ERROR: LLM 调用失败，请检查服务配置与网络后重试。") from None
        except Exception as exc:
            last_error = exc
            exc_name = type(exc).__name__
            if exc_name == "AuthenticationError":
                logger.warning(
                    "LLM 异步调用第 %s 次失败: 认证失败，请检查「设置」中的 API Key 与 Base URL 是否正确",
                    attempt + 1,
                )
            else:
                logger.warning("LLM 异步调用第 %s 次失败: %s", attempt + 1, exc_name)

    auth_message = _auth_error_message(last_error, async_mode=True)
    if auth_message:
        raise ValueError(f"LLM_AUTH_ERROR: {auth_message}") from None
    raise ValueError("LLM_PROVIDER_ERROR: LLM 调用失败，请检查服务配置与网络后重试。") from None
