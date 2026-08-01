"""
FastAPI 依赖：从请求头读取 LLM 配置，无则回退到 .env。
Key 仅用于内存，不打印日志。
"""
import os
from dataclasses import dataclass, field
from urllib.parse import urlparse

from dotenv import load_dotenv
from fastapi import Header, HTTPException

from app.core.config import ALLOW_CLIENT_LLM_CONFIG

load_dotenv()


@dataclass
class LLMConfig:
    """LLM 配置：优先请求头，否则 .env。"""

    provider: str
    api_key: str = field(repr=False)
    base_url: str
    model: str
    api_version: str = ""
    source: str = "server"


def get_llm_config(
    x_llm_provider: str | None = Header(None, alias="x-llm-provider"),
    x_llm_api_key: str | None = Header(None, alias="x-llm-api-key"),
    x_llm_base_url: str | None = Header(None, alias="x-llm-base-url"),
    x_llm_api_version: str | None = Header(None, alias="x-llm-api-version"),
    x_llm_model: str | None = Header(None, alias="x-llm-model"),
) -> LLMConfig:
    """
    从 Header 读取 LLM 配置；若未传则使用 .env 默认值。
    不记录 api_key 到日志。
    """
    x_llm_provider = x_llm_provider if isinstance(x_llm_provider, str) else None
    x_llm_api_key = x_llm_api_key if isinstance(x_llm_api_key, str) else None
    x_llm_base_url = x_llm_base_url if isinstance(x_llm_base_url, str) else None
    x_llm_api_version = x_llm_api_version if isinstance(x_llm_api_version, str) else None
    x_llm_model = x_llm_model if isinstance(x_llm_model, str) else None

    has_client_config = any(
        value and value.strip()
        for value in (x_llm_provider, x_llm_api_key, x_llm_base_url, x_llm_api_version, x_llm_model)
    )
    if has_client_config and not ALLOW_CLIENT_LLM_CONFIG:
        raise HTTPException(
            status_code=403,
            detail="当前部署未启用浏览器 API Key 模式，请由管理员配置后端密钥。",
        )

    if has_client_config and ALLOW_CLIENT_LLM_CONFIG:
        provider = (x_llm_provider or os.getenv("LLM_PROVIDER", "gemini")).strip().lower()
        api_key = (x_llm_api_key or "").strip() or os.getenv("LLM_API_KEY", "").strip()
        base_url = (x_llm_base_url or os.getenv("LLM_BASE_URL", "")).strip().rstrip("/")
        api_version = (x_llm_api_version or os.getenv("LLM_API_VERSION", "")).strip()
        model = (x_llm_model or os.getenv("LLM_MODEL", "")).strip()
        _validate_client_base_url(base_url)
        return LLMConfig(
            provider=provider,
            api_key=api_key,
            base_url=base_url,
            api_version=api_version,
            model=model,
            source="client",
        )

    return LLMConfig(
        provider=os.getenv("LLM_PROVIDER", "gemini").strip().lower(),
        api_key=os.getenv("LLM_API_KEY", "").strip(),
        base_url=os.getenv("LLM_BASE_URL", "").strip().rstrip("/"),
        api_version=os.getenv("LLM_API_VERSION", "").strip(),
        model=os.getenv("LLM_MODEL", "").strip(),
        source="server",
    )


def _validate_client_base_url(base_url: str) -> None:
    if not base_url:
        return
    parsed = urlparse(base_url)
    if parsed.scheme != "https":
        raise HTTPException(status_code=400, detail="Base URL 必须使用 HTTPS。")
    host = (parsed.hostname or "").lower()
    if host in {"localhost", "127.0.0.1", "::1"} or host.startswith("10.") or host.startswith("192.168."):
        raise HTTPException(status_code=400, detail="浏览器 LLM 配置不允许使用本地或内网 Base URL。")
