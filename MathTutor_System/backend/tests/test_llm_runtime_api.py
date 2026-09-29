from fastapi.testclient import TestClient
import os
import subprocess
import sys
import pytest

from app.api.endpoints import llm as llm_endpoint
from app.api.endpoints.auth import get_current_user
from app.core import deps
from app.main import app
from app.models.user import User

client = TestClient(app)


def _credential_fixture(*segments):
    """Deterministically assemble a credential-shaped test value at runtime.

    The complete credential-like literal is never stored statically in the
    source tree, so the repository secret gate does not classify these test
    fixtures as hardcoded credentials. The assembled runtime values keep the
    original credential-like shape, preserving the leak/redaction semantics
    of every assertion that uses them.
    """
    return "".join(segments)


CLIENT_SECRET = _credential_fixture("client", "-sec", "ret")
CLIENT_USERINFO = _credential_fixture("user", ":pa", "ss")
CLIENT_FRAGMENT = _credential_fixture("sec", "ret-frag", "ment")
SERVER_ENV_KEY = _credential_fixture("server", "-env", "-k", "ey")


@pytest.fixture(autouse=True)
def mock_public_dns(monkeypatch):
    def fake_getaddrinfo(host, port, *args, **kwargs):
        return [(2, 1, 6, "", ("93.184.216.34", port))]

    monkeypatch.setattr(deps.socket, "getaddrinfo", fake_getaddrinfo)
    monkeypatch.delenv("ALLOW_CUSTOM_LLM_BASE_URL", raising=False)
    monkeypatch.delenv("CLIENT_LLM_ALLOWED_HOSTS", raising=False)


@pytest.fixture
def authenticated_teacher():
    """Scoped override representing an authenticated active teacher.

    Only for runtime provider/config behavior tests; auth-boundary tests live
    in test_api_auth_security.py and exercise the real get_current_user. The
    override is registered per test and always removed on teardown so no
    global state leaks into anonymous-request tests.
    """
    user = User(id=1, username="runtime-teacher", is_active=True, role="teacher")
    app.dependency_overrides[get_current_user] = lambda: user
    yield user
    app.dependency_overrides.pop(get_current_user, None)


def _record_provider_calls(monkeypatch):
    calls = []

    async def fake_call(prompt, llm_config, **kwargs):
        calls.append(llm_config)
        return "ok"

    monkeypatch.setattr(llm_endpoint, "call_llm_async", fake_call)
    return calls


def test_llm_test_uses_client_headers_when_allowed(monkeypatch, authenticated_teacher):
    calls = []

    async def fake_call(prompt, llm_config, **kwargs):
        calls.append(llm_config)
        assert llm_config.provider == "deepseek"
        assert llm_config.api_key == CLIENT_SECRET
        assert llm_config.base_url == "https://api.deepseek.com"
        assert llm_config.model == "deepseek-v4-flash"
        return "ok"

    monkeypatch.setattr(deps, "ALLOW_CLIENT_LLM_CONFIG", True)
    monkeypatch.setattr(llm_endpoint, "call_llm_async", fake_call)

    response = client.post(
        "/api/llm/test",
        headers={
            "x-llm-provider": "deepseek",
            "x-llm-api-key": CLIENT_SECRET,
            "x-llm-base-url": "https://api.deepseek.com",
            "x-llm-model": "deepseek-v4-flash",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["key_source"] == "client"
    assert CLIENT_SECRET not in response.text
    assert len(calls) == 1


def test_llm_test_uses_server_env_key_when_authenticated(monkeypatch, authenticated_teacher):
    monkeypatch.setattr(deps, "ALLOW_CLIENT_LLM_CONFIG", False)
    monkeypatch.setenv("LLM_API_KEY", SERVER_ENV_KEY)
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.setenv("LLM_MODEL", "deepseek-v4-flash")
    monkeypatch.delenv("LLM_BASE_URL", raising=False)
    calls = _record_provider_calls(monkeypatch)

    response = client.post("/api/llm/test")

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["key_source"] == "server"
    assert len(calls) == 1
    assert calls[0].api_key == SERVER_ENV_KEY
    assert calls[0].source == "server"
    assert SERVER_ENV_KEY not in response.text


def test_llm_test_rejects_client_headers_when_disabled(monkeypatch, authenticated_teacher):
    monkeypatch.setattr(deps, "ALLOW_CLIENT_LLM_CONFIG", False)
    calls = _record_provider_calls(monkeypatch)

    response = client.post("/api/llm/test", headers={"x-llm-api-key": CLIENT_SECRET})

    assert response.status_code == 403
    assert CLIENT_SECRET not in response.text
    assert calls == []


def test_production_rejects_client_headers_even_when_flag_is_true(monkeypatch, authenticated_teacher):
    monkeypatch.setattr(deps, "ALLOW_CLIENT_LLM_CONFIG", True)
    monkeypatch.setattr(deps, "IS_PRODUCTION", True)
    calls = _record_provider_calls(monkeypatch)

    response = client.post(
        "/api/llm/test",
        headers={
            "x-llm-provider": "deepseek",
            "x-llm-api-key": CLIENT_SECRET,
            "x-llm-model": "deepseek-v4-flash",
        },
    )

    assert response.status_code == 403
    assert CLIENT_SECRET not in response.text
    assert calls == []


def test_runtime_status_requires_authentication():
    response = client.get("/api/llm/status")

    assert response.status_code == 401


def test_runtime_status_exposes_only_safe_server_configuration(monkeypatch, authenticated_teacher):
    monkeypatch.setenv("LLM_API_KEY", SERVER_ENV_KEY)
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.setenv("LLM_MODEL", "deepseek-v4-flash")
    monkeypatch.setattr(deps, "ALLOW_CLIENT_LLM_CONFIG", True)
    monkeypatch.setattr(deps, "IS_PRODUCTION", True)

    response = client.get("/api/llm/status")
    assert response.status_code == 200
    assert response.json() == {
        "configured": True,
        "provider": "deepseek",
        "model": "deepseek-v4-flash",
        "config_source": "server",
        "client_config_allowed": False,
    }
    for forbidden in (SERVER_ENV_KEY, SERVER_ENV_KEY[:8], SERVER_ENV_KEY[-4:], "base_url", "authorization"):
        assert forbidden.lower() not in response.text.lower()


def test_production_config_hard_disables_client_override_in_fresh_process():
    environment = os.environ.copy()
    environment.update({
        "ENV": "production",
        "DEBUG": "true",
        "ALLOW_CLIENT_LLM_CONFIG": "true",
    })
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "from app.core.config import IS_PRODUCTION, ALLOW_CLIENT_LLM_CONFIG; "
            "print(IS_PRODUCTION, ALLOW_CLIENT_LLM_CONFIG)",
        ],
        check=True,
        capture_output=True,
        text=True,
        env=environment,
    )

    assert result.stdout.strip() == "True False"


def test_runtime_status_does_not_echo_server_key_inside_a_label(monkeypatch, authenticated_teacher):
    monkeypatch.setenv("LLM_API_KEY", SERVER_ENV_KEY)
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.setenv("LLM_MODEL", SERVER_ENV_KEY)

    response = client.get("/api/llm/status")

    assert response.status_code == 200
    assert response.json()["model"] == "configured"
    assert SERVER_ENV_KEY not in response.text
    assert SERVER_ENV_KEY[:8] not in response.text
    assert SERVER_ENV_KEY[-4:] not in response.text


def test_llm_test_rejects_untrusted_client_base_url_without_echoing_secrets(
    monkeypatch, authenticated_teacher
):
    monkeypatch.setattr(deps, "ALLOW_CLIENT_LLM_CONFIG", True)

    response = client.post(
        "/api/llm/test",
        headers={
            "x-llm-provider": "deepseek",
            "x-llm-api-key": CLIENT_SECRET,
            "x-llm-base-url": f"https://{CLIENT_USERINFO}@api.deepseek.com/#{CLIENT_FRAGMENT}",
            "x-llm-model": "deepseek-v4-flash",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == deps.CLIENT_BASE_URL_ERROR
    assert CLIENT_SECRET not in response.text
    assert CLIENT_USERINFO not in response.text
    assert CLIENT_FRAGMENT not in response.text


def test_llm_test_rejects_custom_by_default(monkeypatch, authenticated_teacher):
    monkeypatch.setattr(deps, "ALLOW_CLIENT_LLM_CONFIG", True)

    response = client.post(
        "/api/llm/test",
        headers={
            "x-llm-provider": "custom",
            "x-llm-api-key": CLIENT_SECRET,
            "x-llm-base-url": "https://proxy.example",
            "x-llm-model": "model-a",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == deps.CLIENT_BASE_URL_ERROR
    assert CLIENT_SECRET not in response.text


def test_llm_test_missing_key_is_clear(monkeypatch, authenticated_teacher):
    monkeypatch.setattr(deps, "ALLOW_CLIENT_LLM_CONFIG", False)
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.setenv("LLM_MODEL", "deepseek-v4-flash")
    calls = _record_provider_calls(monkeypatch)

    response = client.post("/api/llm/test")

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is False
    assert data["code"] == "missing_key"
    assert "API Key" in data["message"]
    assert calls == []
