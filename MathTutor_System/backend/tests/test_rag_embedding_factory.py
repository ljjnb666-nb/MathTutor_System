import pytest

from app.services.rag_embedding_factory import (
    EMBED_MODEL_BY_PROVIDER,
    create_embeddings_from_config,
    normalize_embed_base_url,
)


def test_normalize_embed_base_url_appends_v1_once():
    assert normalize_embed_base_url("https://api.example.com") == "https://api.example.com/v1"
    assert normalize_embed_base_url("https://api.example.com/v1") == "https://api.example.com/v1"
    assert normalize_embed_base_url(" https://api.example.com/ ") == "https://api.example.com/v1"


def test_create_embeddings_from_config_requires_api_key_before_optional_imports():
    with pytest.raises(ValueError, match="未配置 API Key"):
        create_embeddings_from_config("openai", "", "https://api.openai.com", "text-embedding-3-small")


def test_embedding_model_defaults_cover_supported_providers():
    assert EMBED_MODEL_BY_PROVIDER["deepseek"] == "deepseek-embedding-v2"
    assert EMBED_MODEL_BY_PROVIDER["openrouter"] == "openai/text-embedding-3-small"
    assert "custom" in EMBED_MODEL_BY_PROVIDER
