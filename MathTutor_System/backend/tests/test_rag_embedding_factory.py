import pytest
from app.core.config import AppSettings
from app.core.ai_runtime import resolve_server_embedding_config
from app.services.rag_embedding_factory import EMBED_MODEL_BY_PROVIDER


def test_deepseek_embedding_base_url_appends_v1_once(monkeypatch):
    import socket

    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda host, port, **kw: [(2, 1, 6, "", ("93.184.216.34", port))],
    )
    for base in (
        "https://api.deepseek.com",
        "https://api.deepseek.com/v1",
        " https://api.deepseek.com/ ",
    ):
        settings = AppSettings(
            _env_file=None,
            EMBEDDING_PROVIDER="deepseek",
            EMBEDDING_API_KEY="marker",
            EMBEDDING_BASE_URL=base,
        )
        assert (
            resolve_server_embedding_config(settings).base_url
            == "https://api.deepseek.com/v1"
        )


def test_missing_embedding_key_rejected_before_optional_imports():
    settings = AppSettings(
        _env_file=None, EMBEDDING_PROVIDER="openai", EMBEDDING_API_KEY=""
    )
    with pytest.raises(ValueError, match="EMBEDDING_CONFIG_ERROR"):
        resolve_server_embedding_config(settings)


def test_embedding_model_defaults_cover_implemented_adapters():
    assert EMBED_MODEL_BY_PROVIDER["deepseek"] == "deepseek-embedding-v2"
    assert EMBED_MODEL_BY_PROVIDER["openrouter"] == "openai/text-embedding-3-small"
    assert "anthropic" not in EMBED_MODEL_BY_PROVIDER
