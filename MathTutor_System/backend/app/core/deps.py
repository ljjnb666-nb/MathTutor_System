"""FastAPI dependencies for resolving runtime LLM configuration."""
import os
import socket
from dataclasses import dataclass, field
from ipaddress import ip_address
from urllib.parse import urlparse

from dotenv import load_dotenv
from fastapi import Header, HTTPException

from app.core.config import ALLOW_CLIENT_LLM_CONFIG

load_dotenv()

CLIENT_CONFIG_DISABLED_ERROR = (
    "Browser API Key mode is not enabled for this deployment. "
    "Ask an administrator to configure the backend key."
)
CLIENT_BASE_URL_ERROR = "Client Base URL is not trusted or allowed."

CLIENT_PROVIDER_ALLOWED_URLS = {
    "deepseek": "https://api.deepseek.com",
    "openai": "https://api.openai.com/v1",
    "gemini": "https://generativelanguage.googleapis.com",
    "anthropic": "https://api.anthropic.com/v1",
    "openrouter": "https://openrouter.ai/api/v1",
    "moonshot": "https://api.moonshot.cn/v1",
    "zhipu": "https://open.bigmodel.cn/api/paas/v4",
    "qwen": "https://dashscope.aliyuncs.com/compatible-mode/v1",
}
CLIENT_PROVIDER_ALLOWED_HOSTS = {
    provider: {urlparse(base_url).hostname or ""}
    for provider, base_url in CLIENT_PROVIDER_ALLOWED_URLS.items()
}


@dataclass
class LLMConfig:
    """Resolved LLM configuration. api_key is never included in repr()."""

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
    """Resolve LLM settings from client headers or server environment."""
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
        raise HTTPException(status_code=403, detail=CLIENT_CONFIG_DISABLED_ERROR)

    if has_client_config and ALLOW_CLIENT_LLM_CONFIG:
        provider = (x_llm_provider or os.getenv("LLM_PROVIDER", "gemini")).strip().lower()
        api_key = (x_llm_api_key or "").strip() or os.getenv("LLM_API_KEY", "").strip()
        base_url = (x_llm_base_url or "").strip().rstrip("/")
        api_version = (x_llm_api_version or os.getenv("LLM_API_VERSION", "")).strip()
        model = (x_llm_model or os.getenv("LLM_MODEL", "")).strip()
        base_url = _validate_client_base_url(provider, base_url)
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


def _safe_base_url_error() -> HTTPException:
    return HTTPException(status_code=400, detail=CLIENT_BASE_URL_ERROR)


def _allow_custom_llm_base_url() -> bool:
    return os.getenv("ALLOW_CUSTOM_LLM_BASE_URL", "").strip().lower() == "true"


def _normalize_host(host: str | None) -> str:
    return (host or "").strip().lower().rstrip(".")


def _client_allowed_hosts() -> set[str]:
    raw = os.getenv("CLIENT_LLM_ALLOWED_HOSTS", "")
    return {_normalize_host(item) for item in raw.split(",") if _normalize_host(item)}


def _assert_global_ip(value: str) -> None:
    try:
        parsed_ip = ip_address(value)
    except ValueError:
        return
    if (
        not parsed_ip.is_global
        or parsed_ip.is_private
        or parsed_ip.is_loopback
        or parsed_ip.is_link_local
        or parsed_ip.is_multicast
        or parsed_ip.is_reserved
        or parsed_ip.is_unspecified
    ):
        raise _safe_base_url_error()


def _validate_resolved_addresses(host: str, port: int) -> None:
    try:
        results = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise _safe_base_url_error() from exc
    if not results:
        raise _safe_base_url_error()

    addresses = {item[4][0] for item in results if item and item[4]}
    if not addresses:
        raise _safe_base_url_error()
    for address in addresses:
        _assert_global_ip(address)


def _validate_client_base_url(provider: str, base_url: str) -> str:
    provider = (provider or "").strip().lower()
    if provider != "custom" and provider not in CLIENT_PROVIDER_ALLOWED_URLS:
        raise _safe_base_url_error()

    if not base_url:
        if provider == "custom":
            raise _safe_base_url_error()
        base_url = CLIENT_PROVIDER_ALLOWED_URLS[provider]

    if any(char in base_url for char in ("\\", "\r", "\n")) or any(ord(char) < 32 for char in base_url):
        raise _safe_base_url_error()

    parsed = urlparse(base_url)
    host = _normalize_host(parsed.hostname)
    if (
        parsed.scheme != "https"
        or not host
        or parsed.username
        or parsed.password
        or parsed.fragment
        or (parsed.port not in (None, 443))
    ):
        raise _safe_base_url_error()

    _assert_global_ip(host)

    if provider == "custom":
        if not _allow_custom_llm_base_url() or host not in _client_allowed_hosts():
            raise _safe_base_url_error()
    elif host not in CLIENT_PROVIDER_ALLOWED_HOSTS[provider]:
        raise _safe_base_url_error()

    _validate_resolved_addresses(host, parsed.port or 443)
    return base_url.rstrip("/")
