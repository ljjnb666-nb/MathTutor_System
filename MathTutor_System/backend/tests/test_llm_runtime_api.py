from fastapi.testclient import TestClient

from app.api.endpoints import llm as llm_endpoint
from app.core import deps
from app.main import app

client = TestClient(app)


def test_llm_test_uses_client_headers_when_allowed(monkeypatch):
    async def fake_call(prompt, llm_config, **kwargs):
        assert llm_config.provider == "deepseek"
        assert llm_config.api_key == "client-secret"
        assert llm_config.base_url == "https://api.deepseek.com"
        assert llm_config.model == "deepseek-v4-flash"
        return "ok"

    monkeypatch.setattr(deps, "ALLOW_CLIENT_LLM_CONFIG", True)
    monkeypatch.setattr(llm_endpoint, "call_llm_async", fake_call)

    response = client.post(
        "/api/llm/test",
        headers={
            "x-llm-provider": "deepseek",
            "x-llm-api-key": "client-secret",
            "x-llm-base-url": "https://api.deepseek.com",
            "x-llm-model": "deepseek-v4-flash",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["key_source"] == "client"
    assert "client-secret" not in response.text


def test_llm_test_rejects_client_headers_when_disabled(monkeypatch):
    monkeypatch.setattr(deps, "ALLOW_CLIENT_LLM_CONFIG", False)

    response = client.post("/api/llm/test", headers={"x-llm-api-key": "client-secret"})

    assert response.status_code == 403
    assert "client-secret" not in response.text


def test_llm_test_missing_key_is_clear(monkeypatch):
    monkeypatch.setattr(deps, "ALLOW_CLIENT_LLM_CONFIG", False)
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.setenv("LLM_MODEL", "deepseek-v4-flash")

    response = client.post("/api/llm/test")

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is False
    assert data["code"] == "missing_key"
    assert "API Key" in data["message"]
