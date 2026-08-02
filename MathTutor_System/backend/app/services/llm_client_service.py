"""Low-level LLM client adapters used by generation services."""
import asyncio
import json
import logging
from typing import Any

import httpx

from app.services.gemini_rest_service import (
    gemini_rest_with_proxy as _gemini_rest_with_proxy,
    resolve_gemini_proxy as _resolve_gemini_proxy,
)
from app.services.llm_output_service import (
    fallback_content_from_message as _fallback_content_from_message,
    get_message_content_safe as _get_message_content_safe,
    normalize_llm_output as _normalize_llm_output,
)

logger = logging.getLogger(__name__)

MAX_RETRIES = 2
DEFAULT_MODEL_OPENAI = "gpt-4.1-mini"
DEFAULT_MODEL_GEMINI = "gemini-2.5-flash"


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
    async_mode: bool = False,
) -> dict[str, Any]:
    is_deepseek = bool(base_url and "deepseek" in base_url.lower())
    kwargs: dict[str, Any] = {
        "api_key": api_key,
        "model": model or DEFAULT_MODEL_OPENAI,
        "temperature": 1.0 if is_deepseek else temperature,
        "max_tokens": max_tokens,
        "request_timeout": 120,
    }
    if json_mode and not is_deepseek:
        kwargs["model_kwargs"] = {"response_format": {"type": "json_object"}}
    if base_url:
        kwargs["base_url"] = base_url.rstrip("/")
    if async_mode:
        kwargs["http_async_client"] = httpx.AsyncClient(follow_redirects=False)
    else:
        kwargs["http_client"] = httpx.Client(follow_redirects=False)
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
    if not (llm_config.api_key or "").strip():
        raise ValueError("未配置 API Key，请在「设置」中填写或于 .env 中设置 LLM_API_KEY")

    provider = (llm_config.provider or "gemini").strip().lower()
    api_key = (llm_config.api_key or "").strip()
    base_url = (llm_config.base_url or "").strip()
    model = (llm_config.model or "").strip()

    last_error: Exception | None = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            if provider == "gemini":
                from langchain_google_genai import ChatGoogleGenerativeAI

                gemini_kwargs: dict[str, Any] = {
                    "model": model or DEFAULT_MODEL_GEMINI,
                    "api_key": api_key,
                    "temperature": temperature,
                    "max_output_tokens": 8192,
                }
                proxy = _resolve_gemini_proxy()
                if proxy:
                    gemini_kwargs["client_args"] = {"proxy": proxy}
                llm = ChatGoogleGenerativeAI(**gemini_kwargs)
                return _extract_normalized_message(llm.invoke(prompt))

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
                    async_mode=False,
                )
            )
            return _extract_normalized_message(llm.invoke(prompt))
        except ValueError:
            raise
        except Exception as exc:
            last_error = exc
            logger.warning("LLM 调用第 %s 次失败: %s", attempt + 1, type(exc).__name__)

    auth_message = _auth_error_message(last_error, async_mode=False)
    if auth_message:
        raise ValueError(auth_message)
    err_msg = getattr(last_error, "message", None) or str(last_error or "")
    raise ValueError(f"LLM 调用失败，请检查 Base URL、模型与网络：{err_msg[:200]}")


async def call_llm_async(
    prompt: str,
    llm_config: Any,
    *,
    temperature: float = 0.3,
    max_tokens: int = 8192,
) -> str:
    """Async JSON-oriented LLM call for concurrent generation."""
    if not (llm_config.api_key or "").strip():
        raise ValueError("未配置 API Key，请在「设置」中填写或于 .env 中设置 LLM_API_KEY")

    provider = (llm_config.provider or "gemini").strip().lower()
    api_key = (llm_config.api_key or "").strip()
    base_url = (llm_config.base_url or "").strip()
    model = (llm_config.model or "").strip()

    last_error: Exception | None = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            if provider == "gemini":
                proxy = _resolve_gemini_proxy()
                if proxy:
                    out = await _gemini_rest_with_proxy(
                        prompt,
                        api_key,
                        model or DEFAULT_MODEL_GEMINI,
                        temperature,
                        max_tokens,
                        proxy,
                    )
                    try:
                        return _normalize_llm_output(out)
                    except KeyError:
                        return out

                from langchain_google_genai import ChatGoogleGenerativeAI

                llm = ChatGoogleGenerativeAI(
                    model=model or DEFAULT_MODEL_GEMINI,
                    api_key=api_key,
                    temperature=temperature,
                    max_output_tokens=max_tokens,
                )
                try:
                    if hasattr(llm, "ainvoke"):
                        msg = await llm.ainvoke(prompt)
                    else:
                        msg = await asyncio.to_thread(llm.invoke, prompt)
                    return _extract_normalized_message(msg)
                except KeyError:
                    logger.warning("LLM 返回解析 KeyError（Gemini），返回空题目列表")
                    return '{"questions":[]}'

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
        except ValueError:
            raise
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
        raise ValueError(auth_message)
    err_msg = getattr(last_error, "message", None) or str(last_error or "")
    raise ValueError(f"LLM 调用失败，请检查 Base URL、模型与网络：{err_msg[:200]}")
