"""Unified LLM configuration resolution and safe status helpers."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Mapping

from app.core.config import ALLOW_CLIENT_LLM_CONFIG, ENV, IS_PRODUCTION

LLM_NOT_CONFIGURED_DETAIL = {
    "code": "LLM_NOT_CONFIGURED",
    "message": "服务器尚未配置可用的 AI 模型，请联系管理员完成模型配置。",
}


@dataclass
class LLMConfig:
    provider: str
    api_key: str = field(repr=False)
    base_url: str
    model: str
    source: str = "server"

    @property
    def configured(self) -> bool:
        return bool((self.provider or "").strip() and (self.api_key or "").strip() and (self.model or "").strip())


def _clean(value: str | None) -> str:
    return value.strip() if isinstance(value, str) else ""


def _server_config() -> LLMConfig:
    return LLMConfig(
        provider=_clean(os.getenv("LLM_PROVIDER", "gemini")).lower(),
        api_key=_clean(os.getenv("LLM_API_KEY", "")),
        base_url=_clean(os.getenv("LLM_BASE_URL", "")),
        model=_clean(os.getenv("LLM_MODEL", "")),
        source="server",
    )


def _header(headers: Mapping[str, str | None] | None, name: str) -> str:
    if not headers:
        return ""
    value = headers.get(name) or headers.get(name.lower()) or headers.get(name.title())
    return _clean(value)


def client_config_allowed() -> bool:
    return bool(ALLOW_CLIENT_LLM_CONFIG and not IS_PRODUCTION)


def resolve_llm_config(headers: Mapping[str, str | None] | None = None) -> LLMConfig:
    """Resolve LLM config without mixing client API keys with server fields."""
    server = _server_config()
    if not client_config_allowed():
        return server

    client_api_key = _header(headers, "x-llm-api-key")
    if not client_api_key:
        return server

    return LLMConfig(
        provider=_header(headers, "x-llm-provider").lower(),
        api_key=client_api_key,
        base_url=_header(headers, "x-llm-base-url"),
        model=_header(headers, "x-llm-model"),
        source="client",
    )


def llm_status_payload() -> dict:
    config = _server_config()
    return {
        "configured": config.configured,
        "source": "server",
        "provider": config.provider or None,
        "model": config.model or None,
        "base_url_configured": bool(config.base_url),
        "client_config_allowed": client_config_allowed(),
        "environment": ENV,
    }


def require_llm_configured(config: LLMConfig) -> None:
    if not config.configured:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail=LLM_NOT_CONFIGURED_DETAIL)
