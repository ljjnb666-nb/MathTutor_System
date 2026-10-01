"""Transport construction from a separately resolved embedding capability."""
from typing import Any
import httpx
from app.core.config import get_settings
from app.core.ai_runtime import EmbeddingConfig, LLMConfig, PROVIDERS, resolve_embedding_config

EMBED_MODEL_BY_PROVIDER = {name: spec.embedding_model for name, spec in PROVIDERS.items() if spec.embedding_adapter}


def build_embeddings(config: EmbeddingConfig) -> Any:
    spec = PROVIDERS[config.provider]
    if spec.embedding_adapter == "gemini":
        from langchain_google_genai import GoogleGenerativeAIEmbeddings
        return GoogleGenerativeAIEmbeddings(model=config.model, google_api_key=config.api_key, base_url=config.base_url,
            request_options={"timeout": config.request_timeout},
            client_args={"timeout": config.request_timeout, "proxy": config.proxy_url or None, "trust_env": False, "follow_redirects": False}, vertexai=False)
    if spec.embedding_adapter == "openai_compatible":
        from langchain_openai import OpenAIEmbeddings
        return OpenAIEmbeddings(openai_api_key=config.api_key, openai_api_base=config.base_url,
            model=config.model, request_timeout=config.request_timeout, max_retries=config.max_retries,
            http_client=httpx.Client(proxy=config.proxy_url or None, trust_env=False, follow_redirects=False),
            http_async_client=httpx.AsyncClient(proxy=config.proxy_url or None, trust_env=False, follow_redirects=False))
    raise ValueError("EMBEDDING_CONFIG_ERROR: 当前服务商没有 Embedding 适配器。")


def create_embeddings(llm_config: LLMConfig | None = None) -> Any:
    return build_embeddings(resolve_embedding_config(get_settings(), llm_config))
