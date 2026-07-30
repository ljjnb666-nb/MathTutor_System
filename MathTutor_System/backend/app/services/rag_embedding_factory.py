"""Embedding factory for the local RAG service."""
import os
from typing import Any

from app.core.config import (
    AI_REQUEST_TIMEOUT,
    DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL,
    DEEPSEEK_EMBED_MODEL,
    LLM_API_KEY,
    LLM_BASE_URL,
    LLM_PROVIDER,
)

# Default embedding models by provider. Non-Gemini providers use OpenAI-compatible
# /v1/embeddings endpoints.
EMBED_MODEL_BY_PROVIDER: dict[str, str] = {
    "deepseek": "deepseek-embedding-v2",
    "openai": "text-embedding-3-small",
    "openrouter": "openai/text-embedding-3-small",
    "moonshot": "text-embedding-3-small",
    "zhipu": "text-embedding-3-small",
    "qwen": "text-embedding-3-small",
    "anthropic": "openai/text-embedding-3-small",
    "custom": "text-embedding-3-small",
    "gemini": "",
}


def use_deepseek_embedding() -> bool:
    """Return whether env fallback should prefer DeepSeek embeddings."""
    if DEEPSEEK_API_KEY:
        return True
    if (LLM_PROVIDER or "").strip().lower() == "deepseek" and (LLM_API_KEY or "").strip():
        return True
    return False


def get_embedding_key() -> str:
    """Get fallback embedding API key when request-level LLM config is absent."""
    if use_deepseek_embedding():
        return (DEEPSEEK_API_KEY or LLM_API_KEY or "").strip()
    return (os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY") or LLM_API_KEY or "").strip()


def normalize_embed_base_url(base_url: str) -> str:
    """OpenAI-compatible embedding endpoints normally need a /v1 suffix."""
    url = (base_url or "").strip()
    if url and not url.endswith("/v1"):
        url = url.rstrip("/") + "/v1"
    return url


def create_embeddings_from_config(provider: str, api_key: str, base_url: str, model: str) -> Any:
    """Create embeddings from request settings."""
    provider_name = (provider or "").strip().lower()
    key = (api_key or "").strip()
    if not key:
        raise ValueError("未配置 API Key。请在「设置」中选择服务商并填写 API Key。")

    if provider_name == "gemini":
        from langchain_google_genai import GoogleGenerativeAIEmbeddings

        return GoogleGenerativeAIEmbeddings(
            model="models/gemini-embedding-001",
            google_api_key=key,
        )

    from langchain_openai import OpenAIEmbeddings

    embed_model = EMBED_MODEL_BY_PROVIDER.get(provider_name) or "text-embedding-3-small"
    if provider_name == "deepseek":
        embed_model = (DEEPSEEK_EMBED_MODEL or "deepseek-embedding-v2").strip() or "deepseek-embedding-v2"
    url = normalize_embed_base_url(
        base_url or (DEEPSEEK_BASE_URL if provider_name == "deepseek" else "") or "https://api.openai.com/v1"
    )
    return OpenAIEmbeddings(
        openai_api_key=key,
        openai_api_base=url,
        model=embed_model,
        request_timeout=min(60, max(30, AI_REQUEST_TIMEOUT)),
    )


def create_embeddings():
    """Create embeddings from env fallback settings."""
    if use_deepseek_embedding():
        from langchain_openai import OpenAIEmbeddings

        api_key = (DEEPSEEK_API_KEY or LLM_API_KEY or "").strip()
        if not api_key:
            raise ValueError(
                "未配置 DeepSeek API Key。请设置 DEEPSEEK_API_KEY 或 LLM_PROVIDER=deepseek 并设置 LLM_API_KEY。"
            )
        base_url = (DEEPSEEK_BASE_URL or LLM_BASE_URL or "").strip() or "https://api.deepseek.com"
        url = normalize_embed_base_url(base_url)
        return OpenAIEmbeddings(
            openai_api_key=api_key,
            openai_api_base=url,
            model=(DEEPSEEK_EMBED_MODEL or "deepseek-embedding-v2").strip() or "deepseek-embedding-v2",
            request_timeout=min(60, max(30, AI_REQUEST_TIMEOUT)),
        )

    from langchain_google_genai import GoogleGenerativeAIEmbeddings

    api_key = get_embedding_key()
    if not api_key:
        raise ValueError(
            "未配置 Embedding API Key。请在「设置」中选择服务商并填写 API Key，或设置 DEEPSEEK_API_KEY / GOOGLE_API_KEY / LLM_API_KEY。"
        )
    return GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-001",
        google_api_key=api_key,
    )
