from fastapi.testclient import TestClient

from app.api.endpoints import llm as llm_endpoint
from app.core import llm_config as config_module
from app.main import app


def test_llm_status_does_not_expose_key(monkeypatch):
    monkeypatch.setattr(config_module, "ALLOW_CLIENT_LLM_CONFIG", False)
    monkeypatch.setattr(config_module, "IS_PRODUCTION", True)
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.setenv("LLM_API_KEY", "sk-test-secret-never-log-123456")
    monkeypatch.setenv("LLM_BASE_URL", "https://server.example")
    monkeypatch.setenv("LLM_MODEL", "deepseek-chat")

    response = TestClient(app).get("/api/llm/status")

    assert response.status_code == 200
    data = response.json()
    assert data["configured"] is True
    assert data["provider"] == "deepseek"
    assert data["model"] == "deepseek-chat"
    assert "api" not in str(data).lower()
    assert "sk-test-secret-never-log-123456" not in response.text


def test_llm_test_uses_client_config_only_when_allowed(monkeypatch):
    seen = {}

    async def fake_call(prompt, llm_config, **kwargs):
        seen["config"] = llm_config
        return "正常"

    monkeypatch.setattr(config_module, "ALLOW_CLIENT_LLM_CONFIG", True)
    monkeypatch.setattr(config_module, "IS_PRODUCTION", False)
    monkeypatch.setattr(llm_endpoint, "call_llm_async", fake_call)
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("LLM_API_KEY", "server-key")
    monkeypatch.setenv("LLM_MODEL", "server-model")

    response = TestClient(app).post(
        "/api/llm/test",
        headers={
            "x-llm-provider": "openai",
            "x-llm-api-key": "sk-test-secret-never-log-123456",
            "x-llm-base-url": "https://client.example",
            "x-llm-model": "client-model",
        },
    )

    assert response.status_code == 200
    assert response.json()["success"] is True
    assert seen["config"].source == "client"
    assert seen["config"].api_key == "sk-test-secret-never-log-123456"
    assert "sk-test-secret-never-log-123456" not in response.text


def test_llm_test_ignores_client_key_in_production(monkeypatch):
    seen = {}

    async def fake_call(prompt, llm_config, **kwargs):
        seen["config"] = llm_config
        return "正常"

    monkeypatch.setattr(config_module, "ALLOW_CLIENT_LLM_CONFIG", True)
    monkeypatch.setattr(config_module, "IS_PRODUCTION", True)
    monkeypatch.setattr(llm_endpoint, "call_llm_async", fake_call)
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.setenv("LLM_API_KEY", "server-key")
    monkeypatch.setenv("LLM_MODEL", "server-model")

    response = TestClient(app).post(
        "/api/llm/test",
        headers={
            "x-llm-provider": "openai",
            "x-llm-api-key": "sk-test-secret-never-log-123456",
            "x-llm-model": "client-model",
        },
    )

    assert response.status_code == 200
    assert response.json()["success"] is True
    assert seen["config"].source == "server"
    assert seen["config"].api_key == "server-key"
    assert "sk-test-secret-never-log-123456" not in response.text


def test_llm_auth_failure_returns_code_without_secret(monkeypatch):
    async def fake_call(prompt, llm_config, **kwargs):
        raise RuntimeError("401 unauthorized")

    monkeypatch.setattr(config_module, "ALLOW_CLIENT_LLM_CONFIG", True)
    monkeypatch.setattr(config_module, "IS_PRODUCTION", False)
    monkeypatch.setattr(llm_endpoint, "call_llm_async", fake_call)

    response = TestClient(app).post(
        "/api/llm/test",
        headers={
            "x-llm-provider": "openai",
            "x-llm-api-key": "sk-test-secret-never-log-123456",
            "x-llm-model": "client-model",
        },
    )

    assert response.status_code == 200
    assert response.json()["success"] is False
    assert response.json()["code"] == "LLM_AUTH_FAILED"
    assert "sk-test-secret-never-log-123456" not in response.text
