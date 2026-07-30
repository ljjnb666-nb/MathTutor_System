from app.core import llm_config as config_module
from app.core import deps


def test_production_ignores_client_llm_headers(monkeypatch):
    monkeypatch.setattr(config_module, "ALLOW_CLIENT_LLM_CONFIG", False)
    monkeypatch.setattr(config_module, "IS_PRODUCTION", True)
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.setenv("LLM_API_KEY", "server-key")
    monkeypatch.setenv("LLM_BASE_URL", "https://server.example")
    monkeypatch.setenv("LLM_MODEL", "server-model")

    config = deps.get_llm_config(
        x_llm_provider="openai",
        x_llm_api_key="client-secret",
        x_llm_base_url="https://client.example",
        x_llm_model="client-model",
    )

    assert config.provider == "deepseek"
    assert config.api_key == "server-key"
    assert config.base_url == "https://server.example"
    assert config.model == "server-model"
    assert "client-secret" not in repr(config)


def test_development_allows_client_llm_override(monkeypatch):
    monkeypatch.setattr(config_module, "ALLOW_CLIENT_LLM_CONFIG", True)
    monkeypatch.setattr(config_module, "IS_PRODUCTION", False)
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("LLM_API_KEY", "server-key")

    config = deps.get_llm_config(
        x_llm_provider="openai",
        x_llm_api_key="client-key",
        x_llm_base_url="https://client.example",
        x_llm_model="client-model",
    )

    assert config.provider == "openai"
    assert config.api_key == "client-key"
    assert config.base_url == "https://client.example"
    assert config.model == "client-model"


def test_client_llm_override_requires_complete_client_config(monkeypatch):
    monkeypatch.setattr(config_module, "ALLOW_CLIENT_LLM_CONFIG", True)
    monkeypatch.setattr(config_module, "IS_PRODUCTION", False)
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("LLM_API_KEY", "server-key")
    monkeypatch.setenv("LLM_BASE_URL", "https://server.example")
    monkeypatch.setenv("LLM_MODEL", "server-model")

    config = deps.get_llm_config(x_llm_provider="openai", x_llm_api_key="client-key")

    assert config.provider == "openai"
    assert config.api_key == "client-key"
    assert config.base_url == ""
    assert config.model == ""


def test_development_default_does_not_allow_client_llm_override(monkeypatch):
    monkeypatch.setattr(config_module, "ALLOW_CLIENT_LLM_CONFIG", False)
    monkeypatch.setattr(config_module, "IS_PRODUCTION", False)
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("LLM_API_KEY", "server-key")
    monkeypatch.setenv("LLM_MODEL", "server-model")

    config = deps.get_llm_config(
        x_llm_provider="openai",
        x_llm_api_key="client-key",
        x_llm_base_url="https://client.example",
        x_llm_model="client-model",
    )

    assert config.source == "server"
    assert config.provider == "gemini"
    assert config.api_key == "server-key"
