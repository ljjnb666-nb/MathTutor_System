"""HTTP collection only; AI policy and resolution live in ai_runtime."""
import socket  # Compatibility for DNS test injection; shared socket module.
from fastapi import Header, HTTPException, Request
from app.core.config import get_settings
from app.core.ai_runtime import (
    AIConfigError, LLMConfig, EmbeddingConfig, PROVIDERS, resolve_client_llm_config, resolve_server_llm_config,
    resolve_client_embedding_config, resolve_server_embedding_config,
)

CLIENT_CONFIG_DISABLED_ERROR = "本部署未启用浏览器 AI 配置，请由管理员配置后端密钥。"
CLIENT_BASE_URL_ERROR = "LLM_CONFIG_INVALID_BASE_URL: 模型服务地址不受信任或不被允许。"
CLIENT_PROVIDER_ALLOWED_URLS = {name: spec.canonical_base_url for name, spec in PROVIDERS.items() if name != "custom"}


def client_llm_config_allowed() -> bool:
    return get_settings().client_llm_config_allowed


def _collect_client_config(request, raw_values):
    values = [value if isinstance(value, str) else None for value in raw_values]
    client_mode = any(value is not None for value in values) or (
        request is not None and any(h.lower().startswith("x-llm-") for h in request.headers)
    )
    settings = get_settings()
    if client_mode and not settings.client_llm_config_allowed:
        raise HTTPException(status_code=403, detail=CLIENT_CONFIG_DISABLED_ERROR)
    return settings, client_mode, [value or "" for value in values]


def get_llm_config(
    x_llm_provider: str | None = Header(None, alias="x-llm-provider"),
    x_llm_api_key: str | None = Header(None, alias="x-llm-api-key"),
    x_llm_base_url: str | None = Header(None, alias="x-llm-base-url"),
    x_llm_api_version: str | None = Header(None, alias="x-llm-api-version"),
    x_llm_model: str | None = Header(None, alias="x-llm-model"),
    request: Request = None,
) -> LLMConfig:
    settings, client_mode, values = _collect_client_config(request, (
        x_llm_provider, x_llm_api_key, x_llm_base_url, x_llm_api_version, x_llm_model,
    ))
    try:
        if client_mode:
            provider, key, base, version, model = [v or "" for v in values]
            return resolve_client_llm_config(settings, provider=provider, api_key=key, base_url=base, api_version=version, model=model)
        # Keyless server mode remains inspectable (/llm/test, RAG with separate credentials).
        # Generation adapters enforce the non-empty key invariant before transport.
        return resolve_server_llm_config(settings, require_key=False)
    except AIConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None



def get_embedding_config(
    x_llm_provider: str | None = Header(None, alias="x-llm-provider"),
    x_llm_api_key: str | None = Header(None, alias="x-llm-api-key"),
    x_llm_base_url: str | None = Header(None, alias="x-llm-base-url"),
    x_llm_api_version: str | None = Header(None, alias="x-llm-api-version"),
    x_llm_model: str | None = Header(None, alias="x-llm-model"),
    request: Request = None,
) -> EmbeddingConfig:
    settings, client_mode, values = _collect_client_config(request, (
        x_llm_provider, x_llm_api_key, x_llm_base_url, x_llm_api_version, x_llm_model,
    ))
    try:
        if client_mode:
            provider, key, base, _, _ = values
            return resolve_client_embedding_config(settings, provider=provider, api_key=key, base_url=base)
        return resolve_server_embedding_config(settings)
    except AIConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
