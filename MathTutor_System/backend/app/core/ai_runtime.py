"""AI capability policy and pure runtime resolution from ingested AppSettings."""

import socket
from dataclasses import dataclass, field
from ipaddress import ip_address
from urllib.parse import urlparse

from app.core.config import (
    AppSettings,
    DEFAULT_AI_REQUEST_TIMEOUT,
    DEFAULT_AI_MAX_RETRIES,
)


@dataclass(frozen=True)
class ProviderSpec:
    provider_id: str
    transport: str
    canonical_base_url: str
    default_model: str = ""
    requires_explicit_model: bool = True
    supports_request_level_credentials: bool = True
    embedding_adapter: str = ""
    embedding_model: str = ""
    api_version: str = "v1"


PROVIDERS = {
    "deepseek": ProviderSpec(
        "deepseek",
        "openai_compatible",
        "https://api.deepseek.com",
        "deepseek-v4-flash",
        False,
        embedding_adapter="openai_compatible",
        embedding_model="deepseek-embedding-v2",
        api_version="",
    ),
    "openai": ProviderSpec(
        "openai",
        "openai_compatible",
        "https://api.openai.com/v1",
        "gpt-4.1-mini",
        False,
        embedding_adapter="openai_compatible",
        embedding_model="text-embedding-3-small",
    ),
    "gemini": ProviderSpec(
        "gemini",
        "gemini",
        "https://generativelanguage.googleapis.com",
        "gemini-2.5-flash",
        False,
        embedding_adapter="gemini",
        embedding_model="models/gemini-embedding-001",
        api_version="v1beta",
    ),
    "anthropic": ProviderSpec(
        "anthropic",
        "unsupported",
        "https://api.anthropic.com/v1",
        supports_request_level_credentials=False,
    ),
    "openrouter": ProviderSpec(
        "openrouter",
        "openai_compatible",
        "https://openrouter.ai/api/v1",
        embedding_adapter="openai_compatible",
        embedding_model="openai/text-embedding-3-small",
    ),
    "moonshot": ProviderSpec(
        "moonshot",
        "openai_compatible",
        "https://api.moonshot.cn/v1",
        embedding_adapter="openai_compatible",
        embedding_model="text-embedding-3-small",
    ),
    "zhipu": ProviderSpec(
        "zhipu",
        "openai_compatible",
        "https://open.bigmodel.cn/api/paas/v4",
        embedding_adapter="openai_compatible",
        embedding_model="text-embedding-3-small",
        api_version="v4",
    ),
    "qwen": ProviderSpec(
        "qwen",
        "openai_compatible",
        "https://dashscope.aliyuncs.com/compatible-mode/v1",
        embedding_adapter="openai_compatible",
        embedding_model="text-embedding-3-small",
    ),
    "custom": ProviderSpec(
        "custom",
        "openai_compatible",
        "",
        embedding_adapter="openai_compatible",
        embedding_model="text-embedding-3-small",
        api_version="",
    ),
}


class AIConfigError(ValueError):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(f"{code}: {message}")


@dataclass(frozen=True)
class LLMConfig:
    provider: str
    api_key: str = field(repr=False)
    base_url: str = field(repr=False)
    model: str = field(repr=False)
    api_version: str = field(default="", repr=False)
    source: str = "server"
    request_timeout: int = DEFAULT_AI_REQUEST_TIMEOUT
    max_retries: int = DEFAULT_AI_MAX_RETRIES
    proxy_url: str = field(default="", repr=False)


@dataclass(frozen=True)
class EmbeddingConfig:
    provider: str
    api_key: str = field(repr=False)
    base_url: str = field(repr=False)
    model: str = field(repr=False)
    request_timeout: int
    source: str
    max_retries: int = DEFAULT_AI_MAX_RETRIES
    proxy_url: str = field(default="", repr=False)


def provider_spec(provider: str) -> ProviderSpec:
    spec = PROVIDERS.get(provider.strip().lower())
    if spec is None or spec.transport == "unsupported":
        raise AIConfigError(
            "LLM_CONFIG_UNSUPPORTED_PROVIDER",
            "unsupported_provider：当前服务商尚未实现适配器。",
        )
    return spec


def _invalid_url() -> AIConfigError:
    return AIConfigError(
        "LLM_CONFIG_INVALID_BASE_URL", "模型服务地址不受信任或不被允许。"
    )


def _assert_global_ip(value: str) -> None:
    try:
        ip = ip_address(value)
    except ValueError:
        return
    if not ip.is_global or any(
        (
            ip.is_private,
            ip.is_loopback,
            ip.is_link_local,
            ip.is_multicast,
            ip.is_reserved,
            ip.is_unspecified,
        )
    ):
        raise _invalid_url()


def validate_base_url(spec: ProviderSpec, base_url: str, settings: AppSettings) -> str:
    url = (base_url or spec.canonical_base_url).strip().rstrip("/")
    if any(c in url for c in ("\\", "\r", "\n")) or any(ord(c) < 32 for c in url):
        raise _invalid_url()
    try:
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower().rstrip(".")
        port = parsed.port
        if (
            parsed.scheme != "https"
            or not host
            or parsed.username is not None
            or parsed.password is not None
            or "#" in url
            or "?" in url
            or host == "localhost"
            or host.endswith(".localhost")
            or port not in (None, 443)
        ):
            raise _invalid_url()
        _assert_global_ip(host)
        if spec.provider_id == "custom":
            allowed = {
                h.strip().lower().rstrip(".")
                for h in settings.client_llm_allowed_hosts.split(",")
                if h.strip()
            }
            if not settings.allow_custom_llm_base_url or host not in allowed:
                raise _invalid_url()
        elif host != urlparse(spec.canonical_base_url).hostname:
            raise _invalid_url()
        results = socket.getaddrinfo(host, port or 443, type=socket.SOCK_STREAM)
        addresses = {r[4][0] for r in results if r and r[4]}
        if not addresses:
            raise _invalid_url()
        for address in addresses:
            _assert_global_ip(address)
    except (ValueError, OSError) as exc:
        if isinstance(exc, AIConfigError):
            raise
        raise _invalid_url() from None
    return url


def _resolve(
    settings: AppSettings,
    *,
    provider: str,
    key: str,
    base_url: str,
    model: str,
    api_version: str,
    source: str,
) -> LLMConfig:
    spec = provider_spec(provider)
    if source == "client" and not spec.supports_request_level_credentials:
        raise AIConfigError(
            "LLM_CONFIG_UNSUPPORTED_PROVIDER",
            "unsupported_provider：当前服务商不支持请求级凭据。",
        )
    model = model.strip()
    if not model and not spec.requires_explicit_model:
        model = (
            settings.deepseek_model.strip()
            if spec.provider_id == "deepseek" and source == "server"
            else ""
        ) or spec.default_model
    if not model:
        raise AIConfigError("LLM_CONFIG_MISSING_MODEL", "请明确选择模型后重试。")
    return LLMConfig(
        spec.provider_id,
        key.strip(),
        validate_base_url(spec, base_url, settings),
        model,
        api_version.strip() or spec.api_version,
        source,
        settings.ai_request_timeout,
        settings.ai_max_retries,
        settings.proxy_url,
    )


def resolve_server_llm_config(
    settings: AppSettings, *, require_key: bool = True
) -> LLMConfig:
    provider = settings.llm_provider.strip().lower()
    key = settings.llm_api_key.strip()
    if provider == "deepseek":
        key = key or settings.deepseek_api_key.strip()
    elif provider == "gemini":
        key = key or settings.google_api_key.strip() or settings.gemini_api_key.strip()
    if require_key and not key:
        raise AIConfigError(
            "LLM_CONFIG_MISSING_KEY", "未配置 API Key，请由管理员配置后端密钥。"
        )
    base_url = settings.llm_base_url.strip() or (
        settings.deepseek_base_url if provider == "deepseek" else ""
    )
    return _resolve(
        settings,
        provider=provider,
        key=key,
        base_url=base_url,
        model=settings.llm_model,
        api_version=settings.llm_api_version,
        source="server",
    )


def resolve_client_llm_config(
    settings: AppSettings,
    *,
    provider: str = "",
    api_key: str = "",
    base_url: str = "",
    model: str = "",
    api_version: str = "",
) -> LLMConfig:
    if not api_key.strip():
        raise AIConfigError(
            "LLM_CONFIG_MISSING_KEY",
            "浏览器 AI 配置缺少 API Key，请在设置中填写后重试。",
        )
    # Only public policy defaults may fill client fields, never server routing or secrets.
    return _resolve(
        settings,
        provider=provider or "gemini",
        key=api_key,
        base_url=base_url,
        model=model,
        api_version=api_version,
        source="client",
    )


def assert_resolved_llm_config(config: LLMConfig) -> ProviderSpec:
    if not config.api_key.strip():
        raise AIConfigError(
            "LLM_CONFIG_MISSING_KEY", "未配置 API Key，请检查模型配置。"
        )
    spec = provider_spec(config.provider)
    if not config.model.strip():
        raise AIConfigError("LLM_CONFIG_MISSING_MODEL", "请明确选择模型后重试。")
    if (
        not config.base_url
        or config.request_timeout <= 0
        or not 0 <= config.max_retries <= 5
    ):
        raise _invalid_url()
    return spec


def _embedding(
    settings: AppSettings, provider: str, key: str, base: str, model: str, source: str
) -> EmbeddingConfig:
    spec = PROVIDERS.get(provider.strip().lower())
    if spec is None or not spec.embedding_adapter or not key.strip():
        raise AIConfigError(
            "EMBEDDING_CONFIG_ERROR", "未配置兼容的 Embedding 服务，请由管理员配置。"
        )
    try:
        url = validate_base_url(spec, base, settings)
    except AIConfigError:
        raise AIConfigError(
            "EMBEDDING_CONFIG_ERROR", "Embedding 服务地址不受信任或不被允许。"
        ) from None
    if spec.provider_id == "deepseek" and source == "server":
        model = model.strip() or settings.deepseek_embed_model.strip()
    model = model.strip() or spec.embedding_model
    if not model:
        raise AIConfigError("EMBEDDING_CONFIG_ERROR", "请配置 Embedding 模型。")
    if spec.provider_id == "deepseek" and not url.endswith("/v1"):
        url += "/v1"
    return EmbeddingConfig(
        spec.provider_id,
        key.strip(),
        url,
        model,
        settings.ai_request_timeout,
        source,
        settings.ai_max_retries,
        settings.proxy_url,
    )


def resolve_server_embedding_config(settings: AppSettings) -> EmbeddingConfig:
    if any(
        (
            settings.embedding_provider,
            settings.embedding_api_key,
            settings.embedding_base_url,
            settings.embedding_model,
        )
    ):
        # Explicit capability configuration is complete and never borrows generation secrets.
        return _embedding(
            settings,
            settings.embedding_provider,
            settings.embedding_api_key,
            settings.embedding_base_url,
            settings.embedding_model,
            "server",
        )
    if settings.deepseek_api_key.strip():
        return _embedding(
            settings,
            "deepseek",
            settings.deepseek_api_key,
            settings.deepseek_base_url,
            settings.deepseek_embed_model,
            "server",
        )
    if settings.google_api_key.strip() or settings.gemini_api_key.strip():
        return _embedding(
            settings,
            "gemini",
            settings.google_api_key or settings.gemini_api_key,
            "",
            "",
            "server",
        )
    provider = settings.llm_provider.strip().lower()
    return _embedding(
        settings,
        provider,
        settings.llm_api_key,
        settings.llm_base_url
        or (settings.deepseek_base_url if provider == "deepseek" else ""),
        "",
        "server",
    )


def resolve_embedding_config(
    settings: AppSettings, llm_config: LLMConfig | None = None
) -> EmbeddingConfig:
    if llm_config is not None and llm_config.source == "client":
        return resolve_client_embedding_config(
            settings,
            provider=llm_config.provider,
            api_key=llm_config.api_key,
            base_url=llm_config.base_url,
        )
    return resolve_server_embedding_config(settings)


def resolve_client_embedding_config(
    settings: AppSettings, *, provider: str, api_key: str, base_url: str
) -> EmbeddingConfig:
    if not api_key.strip():
        raise AIConfigError(
            "LLM_CONFIG_MISSING_KEY",
            "浏览器 AI 配置缺少 API Key，请在设置中填写后重试。",
        )
    spec = PROVIDERS.get((provider or "gemini").strip().lower())
    if spec and spec.embedding_adapter:
        return _embedding(settings, spec.provider_id, api_key, base_url, "", "client")
    return resolve_server_embedding_config(settings)


def resolve_llm_arguments(
    settings: AppSettings,
    *,
    provider: str = "deepseek",
    api_key: str = "",
    base_url: str = "",
    model: str = "",
) -> LLMConfig:
    """Compatibility boundary for legacy service signatures, without secret mixing."""
    if any((api_key, base_url, model)):
        return resolve_client_llm_config(
            settings, provider=provider, api_key=api_key, base_url=base_url, model=model
        )
    return resolve_server_llm_config(settings)
