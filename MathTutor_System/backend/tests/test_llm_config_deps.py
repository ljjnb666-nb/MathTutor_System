import socket

import pytest
from fastapi import HTTPException

from app.core import deps


PUBLIC_IP = "93.184.216.34"
PRIVATE_IP = "10.0.0.8"


@pytest.fixture(autouse=True)
def mock_public_dns(monkeypatch):
    def fake_getaddrinfo(host, port, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (PUBLIC_IP, port))]

    monkeypatch.setattr(deps.socket, "getaddrinfo", fake_getaddrinfo)
    monkeypatch.delenv("ALLOW_CUSTOM_LLM_BASE_URL", raising=False)
    monkeypatch.delenv("CLIENT_LLM_ALLOWED_HOSTS", raising=False)


def resolve_client_config(monkeypatch, *, provider="deepseek", base_url="https://api.deepseek.com", api_key="client-key"):
    monkeypatch.setattr(deps, "ALLOW_CLIENT_LLM_CONFIG", True)
    return deps.get_llm_config(
        x_llm_provider=provider,
        x_llm_api_key=api_key,
        x_llm_base_url=base_url,
        x_llm_model="model-a",
    )


def assert_rejected(monkeypatch, *, provider="deepseek", base_url="https://api.deepseek.com"):
    with pytest.raises(HTTPException) as exc_info:
        resolve_client_config(monkeypatch, provider=provider, base_url=base_url)
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == deps.CLIENT_BASE_URL_ERROR
    assert base_url not in str(exc_info.value)


def test_disabled_client_llm_headers_are_rejected(monkeypatch):
    monkeypatch.setattr(deps, "ALLOW_CLIENT_LLM_CONFIG", False)

    with pytest.raises(HTTPException) as exc_info:
        deps.get_llm_config(x_llm_api_key="client-secret")

    assert exc_info.value.status_code == 403
    assert "client-secret" not in str(exc_info.value)


def test_development_allows_client_llm_override_for_official_host(monkeypatch):
    config = resolve_client_config(
        monkeypatch,
        provider="openai",
        base_url="https://api.openai.com/v1",
        api_key="client-key",
    )

    assert config.provider == "openai"
    assert config.api_key == "client-key"
    assert config.base_url == "https://api.openai.com/v1"
    assert config.model == "model-a"
    assert config.source == "client"


def test_client_llm_override_falls_back_per_field_without_server_base_url(monkeypatch):
    monkeypatch.setattr(deps, "ALLOW_CLIENT_LLM_CONFIG", True)
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("LLM_API_KEY", "server-key")
    monkeypatch.setenv("LLM_BASE_URL", "https://server.example")
    monkeypatch.setenv("LLM_MODEL", "server-model")

    config = deps.get_llm_config(x_llm_provider="openai")

    assert config.provider == "openai"
    assert config.api_key == "server-key"
    assert config.base_url == "https://api.openai.com/v1"
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


def test_preset_deepseek_official_host_is_allowed(monkeypatch):
    config = resolve_client_config(monkeypatch, provider="deepseek", base_url="https://api.deepseek.com")

    assert config.base_url == "https://api.deepseek.com"


@pytest.mark.parametrize(
    "base_url",
    [
        "https://api.evil.example",
        "https://api.deepseek.com.evil.example",
        "https://evil-api.deepseek.com",
    ],
)
def test_preset_deepseek_non_official_hosts_are_rejected(monkeypatch, base_url):
    assert_rejected(monkeypatch, provider="deepseek", base_url=base_url)


@pytest.mark.parametrize(
    "base_url",
    [
        "http://api.deepseek.com",
        "https://user@api.deepseek.com",
        "https://user:pass@api.deepseek.com",
        "https://api.deepseek.com/#fragment",
        "https://api.deepseek.com:8443",
        "https://api.deepseek.com\\@evil.example",
        "https://api.deepseek.com/\r\nx-test: value",
    ],
)
def test_unsafe_url_structure_is_rejected(monkeypatch, base_url):
    assert_rejected(monkeypatch, provider="deepseek", base_url=base_url)


@pytest.mark.parametrize(
    "base_url",
    [
        "https://127.0.0.1",
        "https://10.0.0.1",
        "https://192.168.1.1",
        "https://172.16.0.1",
        "https://172.31.255.255",
        "https://169.254.169.254",
        "https://100.64.0.1",
        "https://0.0.0.0",
        "https://[::1]",
        "https://[fc00::1]",
        "https://[fe80::1]",
        "https://224.0.0.1",
        "https://198.18.0.1",
    ],
)
def test_custom_direct_non_global_ips_are_rejected(monkeypatch, base_url):
    host = base_url.removeprefix("https://").strip("[]")
    monkeypatch.setenv("ALLOW_CUSTOM_LLM_BASE_URL", "true")
    monkeypatch.setenv("CLIENT_LLM_ALLOWED_HOSTS", host)

    assert_rejected(monkeypatch, provider="custom", base_url=base_url)


def test_dns_public_addresses_are_allowed_for_official_host(monkeypatch):
    config = resolve_client_config(monkeypatch, provider="deepseek", base_url="https://api.deepseek.com")

    assert config.base_url == "https://api.deepseek.com"


def test_dns_private_address_is_rejected(monkeypatch):
    def fake_getaddrinfo(host, port, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (PRIVATE_IP, port))]

    monkeypatch.setattr(deps.socket, "getaddrinfo", fake_getaddrinfo)

    assert_rejected(monkeypatch, provider="deepseek", base_url="https://api.deepseek.com")


def test_dns_mixed_addresses_are_rejected(monkeypatch):
    def fake_getaddrinfo(host, port, *args, **kwargs):
        return [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", (PUBLIC_IP, port)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", (PRIVATE_IP, port)),
        ]

    monkeypatch.setattr(deps.socket, "getaddrinfo", fake_getaddrinfo)

    assert_rejected(monkeypatch, provider="deepseek", base_url="https://api.deepseek.com")


def test_dns_failure_is_rejected(monkeypatch):
    def fake_getaddrinfo(host, port, *args, **kwargs):
        raise OSError("dns failed")

    monkeypatch.setattr(deps.socket, "getaddrinfo", fake_getaddrinfo)

    assert_rejected(monkeypatch, provider="deepseek", base_url="https://api.deepseek.com")


def test_custom_base_url_is_disabled_by_default(monkeypatch):
    assert_rejected(monkeypatch, provider="custom", base_url="https://proxy.example")


def test_custom_base_url_requires_admin_allowlist(monkeypatch):
    monkeypatch.setenv("ALLOW_CUSTOM_LLM_BASE_URL", "true")
    monkeypatch.setenv("CLIENT_LLM_ALLOWED_HOSTS", "other.example")

    assert_rejected(monkeypatch, provider="custom", base_url="https://proxy.example")


def test_custom_base_url_is_allowed_when_allowlisted_and_public(monkeypatch):
    monkeypatch.setenv("ALLOW_CUSTOM_LLM_BASE_URL", "true")
    monkeypatch.setenv("CLIENT_LLM_ALLOWED_HOSTS", "proxy.example")

    config = resolve_client_config(monkeypatch, provider="custom", base_url="https://proxy.example")

    assert config.base_url == "https://proxy.example"


def test_unknown_provider_is_rejected(monkeypatch):
    assert_rejected(monkeypatch, provider="unknown", base_url="https://api.deepseek.com")


def test_server_env_base_url_fallback_keeps_existing_compatibility(monkeypatch):
    monkeypatch.setattr(deps, "ALLOW_CLIENT_LLM_CONFIG", False)
    monkeypatch.setenv("LLM_PROVIDER", "custom")
    monkeypatch.setenv("LLM_API_KEY", "server-key")
    monkeypatch.setenv("LLM_BASE_URL", "http://127.0.0.1:11434")

    config = deps.get_llm_config()

    assert config.source == "server"
    assert config.base_url == "http://127.0.0.1:11434"


def test_api_key_is_not_exposed_by_repr_or_validation_error(monkeypatch):
    secret = "client-secret-value"

    config = resolve_client_config(monkeypatch, api_key=secret)
    assert secret not in repr(config)

    with pytest.raises(HTTPException) as exc_info:
        resolve_client_config(
            monkeypatch,
            api_key=secret,
            base_url="https://user:pass@api.deepseek.com/#fragment",
        )
    assert secret not in str(exc_info.value)
    assert "user:pass" not in str(exc_info.value)
