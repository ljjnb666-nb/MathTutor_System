from fastapi.testclient import TestClient

from app.api.endpoints import auth as auth_routes
from app.api.endpoints import tools as tools_routes
from app.main import app
from app.models.user import User


client = TestClient(app)


def test_llm_key_test_uses_request_body_even_when_headers_are_ignored(monkeypatch):
    seen = {}

    async def fake_test_llm_api_key(config):
        seen["provider"] = config.provider
        seen["api_key"] = config.api_key
        seen["base_url"] = config.base_url
        seen["model"] = config.model
        return {
            "ok": True,
            "provider": config.provider,
            "model": config.model,
            "base_url": config.base_url,
            "latency_ms": 1,
            "message": "API Key 可用",
        }

    monkeypatch.setattr(tools_routes, "test_llm_api_key", fake_test_llm_api_key)
    app.dependency_overrides[auth_routes.get_current_user] = lambda: User(id=1, username="teacher", role="teacher")
    try:
        response = client.post(
            "/api/tools/test-llm-key",
            json={
                "provider": "deepseek",
                "api_key": "body-key",
                "base_url": "https://api.deepseek.com",
                "model": "deepseek-v4-flash",
            },
            headers={
                "x-llm-api-key": "wrong-header-key",
                "x-llm-provider": "openai",
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert seen == {
        "provider": "deepseek",
        "api_key": "body-key",
        "base_url": "https://api.deepseek.com",
        "model": "deepseek-v4-flash",
    }
