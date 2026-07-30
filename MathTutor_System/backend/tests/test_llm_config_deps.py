from app.core import deps


def test_production_ignores_client_llm_headers(monkeypatch):
    monkeypatch.setattr(deps, "ALLOW_CLIENT_LLM_CONFIG", False)
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
    monkeypatch.setattr(deps, "ALLOW_CLIENT_LLM_CONFIG", True)
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


def test_client_llm_override_falls_back_per_field(monkeypatch):
    monkeypatch.setattr(deps, "ALLOW_CLIENT_LLM_CONFIG", True)
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("LLM_API_KEY", "server-key")
    monkeypatch.setenv("LLM_BASE_URL", "https://server.example")
    monkeypatch.setenv("LLM_MODEL", "server-model")

    config = deps.get_llm_config(x_llm_provider="openai")

    assert config.provider == "openai"
    assert config.api_key == "server-key"
    assert config.base_url == "https://server.example"
    assert config.model == "server-model"
