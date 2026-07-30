"""Chat-oriented LLM calls, separated from question generation logic."""
import asyncio
import logging
from typing import Any, AsyncGenerator

from app.core.config import AI_REQUEST_TIMEOUT
from app.services.gemini_rest_service import (
    gemini_rest_with_proxy as _gemini_rest_with_proxy,
    resolve_gemini_proxy as _resolve_gemini_proxy,
)
from app.services.llm_output_service import get_message_content_safe as _get_message_content_safe

logger = logging.getLogger(__name__)

MAX_RETRIES = 2


def build_chat_messages(
    messages: list[dict],
    system_prompt: str | None,
) -> list[Any]:
    """Convert [{role, content}] payloads to LangChain chat messages."""
    from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

    out: list[Any] = []
    if system_prompt and system_prompt.strip():
        out.append(SystemMessage(content=system_prompt.strip()))
    for message in messages:
        role = (message.get("role") or "user").strip().lower()
        content = (message.get("content") or "").strip()
        if role == "assistant":
            out.append(AIMessage(content=content))
        else:
            out.append(HumanMessage(content=content))
    return out


def messages_to_proxy_prompt(lc_messages: list[Any]) -> str:
    """Flatten multi-turn chat messages for Gemini REST proxy fallback."""
    parts = []
    for message in lc_messages:
        cls_name = type(message).__name__
        if cls_name == "SystemMessage":
            parts.append(f"[System]\n{message.content}")
        elif cls_name == "HumanMessage":
            parts.append(f"[User]\n{message.content}")
        elif cls_name == "AIMessage":
            parts.append(f"[Assistant]\n{message.content}")
    return "\n\n".join(parts)


async def chat_completion_async(
    messages: list[dict],
    system_prompt: str | None,
    llm_config: Any,
    *,
    temperature: float = 0.5,
    max_tokens: int = 4096,
) -> str:
    """
    Free-form chat completion. JSON mode is intentionally disabled.
    """
    if not (llm_config.api_key or "").strip():
        raise ValueError("未配置 API Key，请在「设置」中填写或于 .env 中设置 LLM_API_KEY")

    lc_messages = build_chat_messages(messages, system_prompt)
    if not lc_messages:
        raise ValueError("对话消息不能为空")

    provider = (llm_config.provider or "gemini").strip().lower()
    api_key = (llm_config.api_key or "").strip()
    base_url = (llm_config.base_url or "").strip()
    model = (llm_config.model or "").strip()
    timeout = getattr(llm_config, "request_timeout", None) or AI_REQUEST_TIMEOUT

    last_error: Exception | None = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            if provider == "gemini":
                proxy = _resolve_gemini_proxy()
                if proxy:
                    out = await _gemini_rest_with_proxy(
                        messages_to_proxy_prompt(lc_messages),
                        api_key,
                        model or "gemini-1.5-flash",
                        temperature,
                        max_tokens,
                        proxy,
                    )
                    return (out or "").strip() or "（无回复）"

                from langchain_google_genai import ChatGoogleGenerativeAI

                llm = ChatGoogleGenerativeAI(
                    model=model or "gemini-1.5-flash",
                    api_key=api_key,
                    temperature=temperature,
                    max_output_tokens=max_tokens,
                )
                if hasattr(llm, "ainvoke"):
                    msg = await llm.ainvoke(lc_messages)
                else:
                    msg = await asyncio.to_thread(llm.invoke, lc_messages)
                out = _get_message_content_safe(msg)
                return (str(out).strip() if out is not None else "") or "（无回复）"

            try:
                from langchain_openai import ChatOpenAI
            except ImportError as exc:
                raise ValueError("当前环境未安装 langchain-openai，请执行: pip install langchain-openai") from exc

            is_deepseek = base_url and "deepseek" in base_url.lower()
            kwargs: dict[str, Any] = {
                "api_key": api_key,
                "model": model or "gpt-4o-mini",
                "temperature": 1.0 if is_deepseek else temperature,
                "max_tokens": max_tokens,
                "request_timeout": timeout,
            }
            if base_url:
                kwargs["base_url"] = base_url.rstrip("/")
            llm = ChatOpenAI(**kwargs)
            if hasattr(llm, "ainvoke"):
                msg = await llm.ainvoke(lc_messages)
            else:
                msg = await asyncio.to_thread(llm.invoke, lc_messages)
            out = _get_message_content_safe(msg)
            return (str(out).strip() if out is not None else "") or "（无回复）"
        except ValueError:
            raise
        except Exception as exc:
            last_error = exc
            logger.warning("chat_completion_async 第 %s 次失败: %s", attempt + 1, type(exc).__name__)

    err_msg = getattr(last_error, "message", None) or str(last_error or "")
    if "api_key" in err_msg.lower() or "auth" in err_msg.lower() or "401" in err_msg:
        raise ValueError("API Key 无效或认证失败。请在前端「设置」中核对 API Key 与 Base URL，保存后重试。")
    raise ValueError(f"对话请求失败：{err_msg[:200]}")


async def chat_completion_stream_async(
    messages: list[dict],
    system_prompt: str | None,
    llm_config: Any,
    *,
    temperature: float = 0.5,
    max_tokens: int = 4096,
) -> AsyncGenerator[str, None]:
    """Stream chat completion chunks. Gemini falls back to non-streaming."""
    if not (llm_config.api_key or "").strip():
        raise ValueError("未配置 API Key，请在「设置」中填写或于 .env 中设置 LLM_API_KEY")

    lc_messages = build_chat_messages(messages, system_prompt)
    if not lc_messages:
        raise ValueError("对话消息不能为空")

    provider = (llm_config.provider or "gemini").strip().lower()
    api_key = (llm_config.api_key or "").strip()
    base_url = (llm_config.base_url or "").strip()
    model = (llm_config.model or "").strip()
    timeout = getattr(llm_config, "request_timeout", None) or AI_REQUEST_TIMEOUT

    if provider == "gemini":
        yield await chat_completion_async(messages, system_prompt, llm_config)
        return

    try:
        from langchain_openai import ChatOpenAI
    except ImportError as exc:
        raise ValueError("当前环境未安装 langchain-openai，请执行: pip install langchain-openai") from exc

    is_deepseek = base_url and "deepseek" in base_url.lower()
    kwargs: dict[str, Any] = {
        "api_key": api_key,
        "model": model or "gpt-4o-mini",
        "temperature": 1.0 if is_deepseek else temperature,
        "max_tokens": max_tokens,
        "request_timeout": timeout,
    }
    if base_url:
        kwargs["base_url"] = base_url.rstrip("/")
    llm = ChatOpenAI(**kwargs)
    if hasattr(llm, "astream"):
        async for chunk in llm.astream(lc_messages):
            part = _get_message_content_safe(chunk)
            if part is not None and str(part).strip():
                yield str(part)
    else:
        msg = await asyncio.to_thread(llm.invoke, lc_messages)
        out = _get_message_content_safe(msg)
        if out:
            yield str(out).strip()
