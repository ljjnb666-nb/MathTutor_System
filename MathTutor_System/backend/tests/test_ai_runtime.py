"""Runtime authority, capability provenance and transport regression contracts."""

import ast
import asyncio
from pathlib import Path
import socket
import sys
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.core import config, deps
from app.core.config import AppSettings
from app.core.ai_runtime import (
    AIConfigError,
    LLMConfig,
    PROVIDERS,
    resolve_client_llm_config,
    resolve_server_llm_config,
    resolve_embedding_config,
    resolve_server_embedding_config,
)
from app.services import llm_client_service as generation, llm_chat_service as chat


@pytest.fixture
def settings(monkeypatch):
    value = AppSettings(
        _env_file=None,
        ENV="development",
        DEBUG=True,
        LLM_PROVIDER="openai",
        LLM_API_KEY="".join(["server", "-credential"]),
        LLM_MODEL="",
        LLM_BASE_URL="",
        DEEPSEEK_API_KEY="",
        GOOGLE_API_KEY="",
        GEMINI_API_KEY="",
        EMBEDDING_PROVIDER="",
        EMBEDDING_API_KEY="",
        EMBEDDING_BASE_URL="",
        EMBEDDING_MODEL="",
        AI_REQUEST_TIMEOUT=73,
        AI_TEST_TIMEOUT=11,
        AI_MAX_RETRIES=1,
        LLM_HTTPS_PROXY="",
        HTTPS_PROXY="",
        ALLOW_CLIENT_LLM_CONFIG=True,
    )
    monkeypatch.setattr(config, "settings", value)
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda host, port, **kw: [(2, 1, 6, "", ("93.184.216.34", port))],
    )
    return value


def test_settings_snapshot_is_the_only_authority(settings, monkeypatch):
    expected = resolve_server_llm_config(settings)
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setenv("LLM_API_KEY", "other")
    monkeypatch.setenv("AI_REQUEST_TIMEOUT", "5")
    assert deps.get_llm_config() == expected
    assert expected.request_timeout == 73
    assert expected.max_retries == 1
    assert expected.api_key not in repr(expected)


@pytest.mark.parametrize(
    "header",
    [
        "x_llm_provider",
        "x_llm_model",
        "x_llm_base_url",
        "x_llm_api_version",
        "x_llm_api_key",
    ],
)
@pytest.mark.parametrize("value", ["", " ", "override"])
def test_any_client_header_requires_client_key(settings, header, value):
    if header == "x_llm_api_key" and value.strip():
        assert deps.get_llm_config(**{header: value}).source == "client"
        return
    with pytest.raises(HTTPException, match="LLM_CONFIG_MISSING_KEY") as error:
        deps.get_llm_config(**{header: value})
    assert error.value.status_code == 400
    assert settings.llm_api_key not in str(error.value)


def test_client_uses_only_public_defaults(settings):
    settings.llm_model = "private-server-model"
    settings.llm_provider = "deepseek"
    settings.llm_api_version = "private-version"
    client = resolve_client_llm_config(
        settings, provider="openai", api_key="client-marker"
    )
    assert client.source == "client"
    assert client.api_key == "client-marker"
    assert client.model == PROVIDERS["openai"].default_model
    assert client.api_version == "v1"
    assert client.base_url == PROVIDERS["openai"].canonical_base_url


@pytest.mark.parametrize(
    "provider",
    [
        p
        for p, s in PROVIDERS.items()
        if s.requires_explicit_model and s.transport != "unsupported"
    ],
)
def test_no_default_requires_explicit_model(settings, provider):
    with pytest.raises(AIConfigError, match="LLM_CONFIG_MISSING_MODEL"):
        resolve_client_llm_config(settings, provider=provider, api_key="marker")


def test_anthropic_never_reaches_openai_transport(settings):
    with pytest.raises(AIConfigError, match="LLM_CONFIG_UNSUPPORTED_PROVIDER"):
        resolve_client_llm_config(
            settings, provider="anthropic", api_key="marker", model="claude"
        )


@pytest.mark.parametrize("provider", ["openai", "deepseek", "gemini"])
@pytest.mark.asyncio
async def test_generation_chat_test_share_model_timeout_and_no_env_read(
    settings, provider, monkeypatch
):
    settings.llm_provider = provider
    resolved = resolve_server_llm_config(settings)
    seen = []

    class FakeLLM:
        def __init__(self, **kwargs):
            seen.append(kwargs)

        def invoke(self, prompt):
            return SimpleNamespace(content="ok")

        async def ainvoke(self, prompt):
            return self.invoke(prompt)

    monkeypatch.setitem(
        sys.modules, "langchain_openai", SimpleNamespace(ChatOpenAI=FakeLLM)
    )

    async def rest(*args, **kwargs):
        seen.append({"model": args[2], "request_timeout": kwargs["request_timeout"]})
        return "ok"

    def sync_rest(*args, **kwargs):
        seen.append({"model": args[2], "request_timeout": kwargs["request_timeout"]})
        return "ok"

    monkeypatch.setattr(generation, "_gemini_rest_with_proxy", rest)
    monkeypatch.setattr(generation, "_gemini_rest_sync", sync_rest)
    monkeypatch.setattr(chat, "_gemini_rest_with_proxy", rest)
    # SDKs are replaced; forbid any application runtime env side channel.
    from app.api.endpoints.llm import test_llm_connection

    chat.build_chat_messages(
        [], None
    )  # Initialize third-party lazy imports before env guard.
    import os

    monkeypatch.setattr(
        os,
        "getenv",
        lambda *a, **kw: (_ for _ in ()).throw(AssertionError("env side channel")),
    )
    monkeypatch.setattr(generation.httpx, "Client", lambda **kw: SimpleNamespace())
    monkeypatch.setattr(generation.httpx, "AsyncClient", lambda **kw: SimpleNamespace())
    assert deps.get_llm_config() == resolved
    assert generation.call_llm("prompt", resolved) == "ok"
    assert await generation.call_llm_async("prompt", resolved) == "ok"
    assert (
        await chat.chat_completion_async(
            [{"role": "user", "content": "hi"}], None, resolved
        )
        == "ok"
    )
    from app.api.endpoints.llm import test_llm_connection

    result = await test_llm_connection(current_user=object(), llm_config=resolved)
    assert result.ok
    assert [s["model"] for s in seen] == [resolved.model] * 4
    assert [s["request_timeout"] for s in seen] == [73, 73, 73, 11]


def test_explicit_embedding_capability(settings):
    settings.embedding_provider = "openai"
    settings.embedding_api_key = "embedding-marker"
    settings.embedding_model = "text-embedding-3-small"
    embedded = resolve_server_embedding_config(settings)
    assert embedded.api_key == "embedding-marker"
    assert embedded.request_timeout == 73
    assert embedded.source == "server"
    assert embedded.api_key not in repr(embedded)


@pytest.mark.parametrize("provider", ["anthropic", "unknown"])
def test_unsupported_embedding_request_falls_back_only_to_server(settings, provider):
    request = LLMConfig(provider, "wrong-provider-marker", "", "", source="client")
    embedded = resolve_embedding_config(settings, request)
    assert embedded.provider == "openai"
    assert embedded.api_key == settings.llm_api_key
    settings.llm_api_key = ""
    with pytest.raises(AIConfigError, match="EMBEDDING_CONFIG_ERROR") as error:
        resolve_embedding_config(settings, request)
    assert request.api_key not in str(error.value)


@pytest.mark.parametrize("provider", ["openai", "deepseek", "gemini"])
def test_legacy_llm_embedding_key_matches_provider(settings, provider):
    settings.llm_provider = provider
    embedded = resolve_server_embedding_config(settings)
    assert embedded.provider == provider
    assert embedded.api_key == settings.llm_api_key


def test_explicit_partial_embedding_does_not_borrow_generation_key(settings):
    settings.embedding_provider = "gemini"
    with pytest.raises(AIConfigError, match="EMBEDDING_CONFIG_ERROR"):
        resolve_server_embedding_config(settings)


def test_client_embedding_model_is_separate_from_generation(settings):
    request = resolve_client_llm_config(
        settings, provider="openai", api_key="client-marker", model="generation-model"
    )
    embedded = resolve_embedding_config(settings, request)
    assert embedded.source == "client"
    assert embedded.api_key == "client-marker"
    assert embedded.model == PROVIDERS["openai"].embedding_model


def test_architecture_no_env_or_adapter_model_authority():
    root = Path(__file__).parents[1] / "app"
    assert not (root / "services/llm_engine.py").exists()
    for path in root.rglob("*.py"):
        source = path.read_text(encoding="utf-8-sig")
        tree = ast.parse(source)
        assert "app.services.llm_engine" not in source
        if path.name not in {"config.py", "security.py"}:
            for node in ast.walk(tree):
                if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                    assert not (
                        isinstance(node.func.value, ast.Name)
                        and node.func.value.id == "os"
                        and node.func.attr in {"getenv", "environ"}
                    ), path
        if path.parent.name == "services":
            assert all(
                m not in source
                for m in [
                    "gemini-1.5-flash",
                    "gemini-2.5-flash",
                    "gpt-4o-mini",
                    "gpt-4.1-mini",
                ]
            ), path


def test_all_ai_entrypoints_use_http_resolver():
    from app.main import app

    targets = {
        "/api/generate",
        "/api/exam",
        "/api/verify",
        "/api/chat",
        "/api/llm/test",
        "/api/teacher-agent/runs",
        "/api/rag/upload",
    }
    found = set()
    for route in app.routes:
        if getattr(route, "path", None) in targets and "POST" in route.methods:
            assert any(
                d.call
                == (
                    deps.get_embedding_config
                    if route.path == "/api/rag/upload"
                    else deps.get_llm_config
                )
                for d in route.dependant.dependencies
            ), route.path
            found.add(route.path)
    assert found == targets


def test_frontend_provider_policy_parity():
    import re

    source = (
        Path(__file__).parents[2] / "frontend/src/constants/ai-providers.js"
    ).read_text(encoding="utf-8")
    entries = dict(
        re.findall(
            r"value: '([^']+)',\s*(?:disabled: true,[^\n]*\n\s*)?baseUrl: '([^']*)'",
            source,
        )
    )
    assert entries == {
        name: spec.canonical_base_url for name, spec in PROVIDERS.items()
    }


@pytest.mark.asyncio
async def test_missing_browser_key_has_zero_transport_calls(settings, monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.api.endpoints.auth import get_current_user
    from app.api.endpoints import llm

    calls = []

    async def transport(*a, **kw):
        calls.append(a)
        return "ok"

    app.dependency_overrides[get_current_user] = lambda: object()
    monkeypatch.setattr(llm, "call_llm_async", transport)
    try:
        client = TestClient(app)
        response = client.post(
            "/api/llm/test",
            headers={"x-llm-provider": "openai", "x-llm-model": "override"},
        )
        assert response.status_code == 400
        assert "LLM_CONFIG_MISSING_KEY" in response.text
        assert calls == []
        assert settings.llm_api_key not in response.text
        settings.env = "production"
        for headers in ({"x-llm-provider": ""}, {"x-llm-unknown": ""}):
            assert client.post("/api/llm/test", headers=headers).status_code == 403
        assert calls == []
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_embedding_constructor_receives_resolved_capability_only(settings, monkeypatch):
    from app.services.rag_embedding_factory import create_embeddings

    seen = []

    def embedding(**kw):
        seen.append(kw)
        return object()

    monkeypatch.setitem(
        sys.modules, "langchain_openai", SimpleNamespace(OpenAIEmbeddings=embedding)
    )
    monkeypatch.setitem(
        sys.modules,
        "langchain_google_genai",
        SimpleNamespace(GoogleGenerativeAIEmbeddings=embedding),
    )
    incompatible = LLMConfig(
        "anthropic", "wrong-provider-marker", "", "", source="client"
    )
    create_embeddings(incompatible)
    assert seen[0]["openai_api_key"] == settings.llm_api_key
    assert seen[0]["request_timeout"] == 73
    seen[0]["http_client"].close()
    asyncio.run(seen[0]["http_async_client"].aclose())
    assert "wrong-provider-marker" not in str(seen)
    settings.llm_provider = "gemini"
    create_embeddings()
    assert seen[1]["google_api_key"] == settings.llm_api_key
    assert seen[1]["request_options"]["timeout"] == 73


def test_gemini_rest_receives_resolved_timeout_base_and_version(settings, monkeypatch):
    from app.services.gemini_rest_service import gemini_rest_sync

    seen = {}

    class Client:
        def __init__(self, **kwargs):
            seen.update(kwargs)

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def post(self, url, **kwargs):
            seen["url"] = url
            return SimpleNamespace(
                status_code=200,
                json=lambda: {"candidates": [{"content": {"parts": [{"text": "ok"}]}}]},
            )

    monkeypatch.setattr(generation.httpx, "Client", Client)
    settings.llm_provider = "gemini"
    resolved = resolve_server_llm_config(settings)
    assert (
        gemini_rest_sync(
            "hi",
            resolved.api_key,
            resolved.model,
            0.2,
            8,
            "",
            request_timeout=resolved.request_timeout,
            base_url=resolved.base_url,
            api_version=resolved.api_version,
        )
        == "ok"
    )
    assert seen["timeout"] == 73
    assert seen["trust_env"] is False
    assert (
        seen["url"]
        == f"{resolved.base_url}/{resolved.api_version}/models/{resolved.model}:generateContent"
    )


@pytest.mark.asyncio
async def test_provider_retry_budget_is_not_multiplied_by_sdk(
    settings, monkeypatch, caplog
):
    attempts = []

    class Failing:
        def __init__(self, **kwargs):
            assert kwargs["max_retries"] == 0

        async def ainvoke(self, *args):
            attempts.append(1)
            raise RuntimeError(settings.llm_api_key)

    monkeypatch.setitem(
        sys.modules, "langchain_openai", SimpleNamespace(ChatOpenAI=Failing)
    )
    resolved = resolve_server_llm_config(settings)
    with pytest.raises(ValueError, match="LLM_PROVIDER_ERROR") as error:
        await generation.call_llm_async("hi", resolved)
    assert len(attempts) == resolved.max_retries + 1
    assert settings.llm_api_key not in str(error.value)
    assert settings.llm_api_key not in caplog.text


@pytest.mark.parametrize("timeout,retries", [(0, 1), (-1, 1), (73, -1), (73, 6)])
def test_invalid_limits_rejected_at_ingestion(timeout, retries):
    with pytest.raises(ValueError):
        AppSettings(_env_file=None, AI_REQUEST_TIMEOUT=timeout, AI_MAX_RETRIES=retries)


def test_rag_http_dependency_is_independent_and_preserves_provenance(settings):
    settings.llm_provider = "anthropic"
    settings.llm_model = ""
    settings.embedding_provider = "openai"
    settings.embedding_api_key = "embedding-marker"
    settings.embedding_model = "text-embedding-3-small"
    server = deps.get_embedding_config()
    assert server.provider == "openai" and server.source == "server"
    assert server.api_key == "embedding-marker"
    fallback = deps.get_embedding_config(
        x_llm_provider="anthropic", x_llm_api_key="wrong-provider-marker"
    )
    assert fallback == server
    assert "wrong-provider-marker" not in repr(fallback)
    client = deps.get_embedding_config(
        x_llm_provider="gemini",
        x_llm_api_key="client-marker",
        x_llm_model="generation-model",
    )
    assert client.provider == "gemini" and client.source == "client"
    assert client.api_key == "client-marker"
    assert client.model == PROVIDERS["gemini"].embedding_model
    with pytest.raises(HTTPException, match="LLM_CONFIG_MISSING_KEY"):
        deps.get_embedding_config(x_llm_provider="anthropic")
    settings.env = "production"
    with pytest.raises(HTTPException) as error:
        deps.get_embedding_config(x_llm_provider="", x_llm_api_key="client-marker")
    assert error.value.status_code == 403


def test_rag_upload_uses_server_embedding_when_client_capability_is_unsupported(
    settings, monkeypatch
):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.api.endpoints import rag
    from app.api.endpoints.auth import get_current_user
    from app.models.base import get_db

    settings.llm_provider = "anthropic"
    settings.embedding_provider = "openai"
    settings.embedding_api_key = "embedding-marker"
    seen = []

    def service(*args, **kwargs):
        seen.append(kwargs["embedding_config"])
        return SimpleNamespace(add_document=lambda *a, **kw: "document-id")

    monkeypatch.setattr(rag, "get_rag_service", service)
    monkeypatch.setattr(rag, "_require_rag", lambda *a: None)
    monkeypatch.setattr(rag, "parse_file_from_bytes", lambda *a: "fixture")
    monkeypatch.setattr(
        rag, "write_rag_for_account_instance", lambda user, subject, action: action()
    )
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id=1, auth_subject="fixture-subject"
    )
    app.dependency_overrides[get_db] = lambda: None
    try:
        client = TestClient(app)
        response = client.post(
            "/api/rag/upload",
            files={"file": ("file.pdf", b"fixture", "application/pdf")},
            headers={
                "x-llm-provider": "anthropic",
                "x-llm-api-key": "wrong-provider-marker",
            },
        )
        assert response.status_code == 200
        assert seen[0].provider == "openai" and seen[0].source == "server"
        assert seen[0].api_key == "embedding-marker"
        assert "wrong-provider-marker" not in response.text
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)
