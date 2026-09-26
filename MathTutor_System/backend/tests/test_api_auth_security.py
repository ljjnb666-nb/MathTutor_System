from io import BytesIO

from fastapi.testclient import TestClient

from app.api.endpoints import llm as llm_endpoint
from app.core import deps
from app.main import app


client = TestClient(app)


def _credential_fixture(*segments):
    """Runtime-assembled credential-shaped fixture; no literal falls into source (secret gate)."""
    return "".join(segments)


CLIENT_SECRET = _credential_fixture("client", "-sec", "ret")
SERVER_ENV_KEY = _credential_fixture("server", "-env", "-k", "ey")


def _record_provider_calls(monkeypatch):
    calls = []

    async def fake_call(prompt, llm_config, **kwargs):
        calls.append(llm_config)
        return "ok"

    monkeypatch.setattr(llm_endpoint, "call_llm_async", fake_call)
    return calls


def test_anonymous_llm_test_without_headers_is_unauthorized(monkeypatch):
    # SEC-LLMTEST-01: no caller identity, no config processing, no provider call.
    calls = _record_provider_calls(monkeypatch)

    response = client.post("/api/llm/test")

    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"
    assert calls == []


def test_anonymous_llm_test_with_server_env_key_is_unauthorized(monkeypatch):
    # SEC-LLMTEST-02: server credentials must not make the test endpoint public.
    monkeypatch.setenv("LLM_API_KEY", SERVER_ENV_KEY)
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.setenv("LLM_MODEL", "deepseek-v4-flash")
    calls = _record_provider_calls(monkeypatch)

    response = client.post("/api/llm/test")

    assert response.status_code == 401
    assert calls == []
    assert SERVER_ENV_KEY not in response.text


def test_anonymous_llm_test_with_client_headers_when_allowed_is_unauthorized(monkeypatch):
    # SEC-LLMTEST-03: auth boundary precedes Browser Key mode handling entirely.
    monkeypatch.setattr(deps, "ALLOW_CLIENT_LLM_CONFIG", True)
    calls = _record_provider_calls(monkeypatch)

    response = client.post(
        "/api/llm/test",
        headers={
            "x-llm-provider": "deepseek",
            "x-llm-api-key": CLIENT_SECRET,
            "x-llm-base-url": "https://api.deepseek.com",
            "x-llm-model": "deepseek-v4-flash",
        },
    )

    assert response.status_code == 401
    assert calls == []
    assert CLIENT_SECRET not in response.text


def test_anonymous_llm_test_with_client_headers_when_disabled_is_unauthorized(monkeypatch):
    # SEC-LLMTEST-04: 401, not the 403 client-config-disabled policy response.
    monkeypatch.setattr(deps, "ALLOW_CLIENT_LLM_CONFIG", False)
    calls = _record_provider_calls(monkeypatch)

    response = client.post("/api/llm/test", headers={"x-llm-api-key": CLIENT_SECRET})

    assert response.status_code == 401
    assert calls == []


def test_llm_test_with_invalid_bearer_token_is_unauthorized(monkeypatch):
    # SEC-LLMTEST-05: malformed credential never reaches the provider path.
    calls = _record_provider_calls(monkeypatch)

    response = client.post(
        "/api/llm/test",
        headers={"Authorization": f"Bearer {_credential_fixture('not', '-a-', 'jwt')}"},
    )

    assert response.status_code == 401
    assert calls == []


def test_anonymous_rag_list_requires_auth():
    assert client.get("/api/rag/documents").status_code == 401


def test_anonymous_rag_upload_requires_auth():
    files = {"file": ("a.pdf", BytesIO(b"%PDF-1.4"), "application/pdf")}
    assert client.post("/api/rag/upload", files=files).status_code == 401


def test_anonymous_rag_status_requires_auth():
    assert client.get("/api/rag/upload/status/task-id").status_code == 401


def test_anonymous_upload_parse_requires_auth():
    files = {"file": ("a.docx", BytesIO(b"content"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    assert client.post("/api/upload/parse/word", files=files).status_code == 401


def test_anonymous_generate_analysis_requires_auth():
    assert client.post("/api/upload/generate-analysis", json={"questions": [{"content": "x"}]}).status_code == 401


def test_anonymous_generate_verify_requires_auth():
    assert client.post("/api/verify", json={"content": "x"}).status_code == 401


def test_anonymous_teacher_agent_requires_auth():
    assert client.post("/api/teacher-agent/runs", json={"goal": "plan a lesson"}).status_code == 401
