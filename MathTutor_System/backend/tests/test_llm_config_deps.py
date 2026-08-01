from app.core import deps
from fastapi import HTTPException


def test_disabled_client_llm_headers_are_rejected(monkeypatch):
    monkeypatch.setattr(deps, "ALLOW_CLIENT_LLM_CONFIG", False)

    try:
        deps.get_llm_config(x_llm_api_key="client-secret")
    except HTTPException as exc:
        assert exc.status_code == 403
        assert "浏览器 API Key 模式" in exc.detail
    else:
        raise AssertionError("client headers should be rejected when disabled")


def test_development_allows_client_llm_override(monkeypatch):
    monkeypatch.setattr(deps, "ALLOW_CLIENT_LLM_CONFIG", True)
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("LLM_API_KEY", "server-key")

    config = deps.get_llm_config(
        x_llm_provider="openai",
        x_llm_api_key="client-key",
        x_llm_base_url="https://client.example",
        x_llm_api_version="v1",
        x_llm_model="client-model",
    )

    assert config.provider == "openai"
    assert config.api_key == "client-key"
    assert config.base_url == "https://client.example"
    assert config.api_version == "v1"
    assert config.model == "client-model"
    assert config.source == "client"


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


def test_no_headers_falls_back_to_server_env(monkeypatch):
    monkeypatch.setattr(deps, "ALLOW_CLIENT_LLM_CONFIG", False)
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.setenv("LLM_API_KEY", "server-key")
    monkeypatch.setenv("LLM_BASE_URL", "https://server.example")
    monkeypatch.setenv("LLM_MODEL", "server-model")

    config = deps.get_llm_config()

    assert config.provider == "deepseek"
    assert config.api_key == "server-key"
    assert config.base_url == "https://server.example"
    assert config.model == "server-model"
    assert config.source == "server"
    assert "server-key" not in repr(config)


def test_client_base_url_must_be_https(monkeypatch):
    monkeypatch.setattr(deps, "ALLOW_CLIENT_LLM_CONFIG", True)

    try:
        deps.get_llm_config(x_llm_api_key="client-key", x_llm_base_url="http://127.0.0.1:11434")
    except HTTPException as exc:
        assert exc.status_code == 400
    else:
        raise AssertionError("insecure client Base URL should be rejected")
