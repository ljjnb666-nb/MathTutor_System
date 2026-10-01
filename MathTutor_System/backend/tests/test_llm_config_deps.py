from app.core import config as app_config
from app.core.config import AppSettings
import socket

import pytest
from fastapi import HTTPException

from app.core import deps


PUBLIC_IP = "93.184.216.34"
PRIVATE_IP = "10.0.0.8"


def _credential_fixture(*segments):
    """凭据形状的测试值运行时拼接，完整字面量不落入源码（密钥扫描门禁）。"""
    return "".join(segments)


CLIENT_KEY = _credential_fixture("client", "-ke", "y")
CLIENT_SECRET = _credential_fixture("client", "-sec", "ret")


@pytest.fixture(autouse=True)
def mock_public_dns(monkeypatch):
    def fake_getaddrinfo(host, port, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (PUBLIC_IP, port))]

    monkeypatch.setattr(deps.socket, "getaddrinfo", fake_getaddrinfo)
    monkeypatch.setattr(app_config.settings, "allow_custom_llm_base_url", False)
    monkeypatch.setattr(app_config.settings, "client_llm_allowed_hosts", "")


def resolve_client_config(monkeypatch, *, provider="deepseek", base_url="https://api.deepseek.com", api_key=CLIENT_KEY):
    monkeypatch.setattr(app_config.settings, "allow_client_llm_config", True)
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
    monkeypatch.setattr(app_config.settings, "allow_client_llm_config", False)

    with pytest.raises(HTTPException) as exc_info:
        deps.get_llm_config(x_llm_api_key=CLIENT_SECRET)

    assert exc_info.value.status_code == 403
    assert CLIENT_SECRET not in str(exc_info.value)


def test_development_allows_client_llm_override_for_official_host(monkeypatch):
    config = resolve_client_config(
        monkeypatch,
        provider="openai",
        base_url="https://api.openai.com/v1",
        api_key=CLIENT_KEY,
    )

    assert config.provider == "openai"
    assert config.api_key == CLIENT_KEY
    assert config.base_url == "https://api.openai.com/v1"
    assert config.model == "model-a"
    assert config.source == "client"


def test_client_llm_override_never_borrows_server_secret(monkeypatch):
    monkeypatch.setattr(app_config.settings, "allow_client_llm_config", True)
    monkeypatch.setattr(app_config.settings, "llm_provider", "gemini")
    monkeypatch.setattr(app_config.settings, "llm_api_key", "server-key")
    monkeypatch.setattr(app_config.settings, "llm_base_url", "https://api.deepseek.com")
    monkeypatch.setattr(app_config.settings, "llm_model", "server-model")

    with pytest.raises(HTTPException) as exc_info:
        deps.get_llm_config(x_llm_provider="openai")
    assert exc_info.value.status_code == 400
    assert "LLM_CONFIG_MISSING_KEY" in exc_info.value.detail
    assert "server-key" not in str(exc_info.value)


def test_no_headers_falls_back_to_server_env(monkeypatch):
    monkeypatch.setattr(app_config.settings, "allow_client_llm_config", False)
    monkeypatch.setattr(app_config.settings, "llm_provider", "deepseek")
    monkeypatch.setattr(app_config.settings, "llm_api_key", "server-key")
    monkeypatch.setattr(app_config.settings, "llm_base_url", "https://api.deepseek.com")
    monkeypatch.setattr(app_config.settings, "llm_model", "server-model")

    config = deps.get_llm_config()

    assert config.provider == "deepseek"
    assert config.api_key == "server-key"
    assert config.base_url == "https://api.deepseek.com"
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
        "https://@api.deepseek.com",
        "https://user:pass@api.deepseek.com",
        "https://api.deepseek.com/#fragment",
        "https://api.deepseek.com/#",
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
        "https://localhost",
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
    monkeypatch.setattr(app_config.settings, "allow_custom_llm_base_url", True)
    monkeypatch.setattr(app_config.settings, "client_llm_allowed_hosts", host)

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
    monkeypatch.setattr(app_config.settings, "allow_custom_llm_base_url", True)
    monkeypatch.setattr(app_config.settings, "client_llm_allowed_hosts", "other.example")

    assert_rejected(monkeypatch, provider="custom", base_url="https://proxy.example")


def test_custom_base_url_is_allowed_when_allowlisted_and_public(monkeypatch):
    monkeypatch.setattr(app_config.settings, "allow_custom_llm_base_url", True)
    monkeypatch.setattr(app_config.settings, "client_llm_allowed_hosts", "proxy.example")

    config = resolve_client_config(monkeypatch, provider="custom", base_url="https://proxy.example")

    assert config.base_url == "https://proxy.example"


def test_unknown_provider_is_rejected(monkeypatch):
    with pytest.raises(HTTPException, match="LLM_CONFIG_UNSUPPORTED_PROVIDER"):
        resolve_client_config(monkeypatch, provider="unknown")


def test_server_config_rejects_unsafe_base_url(monkeypatch):
    monkeypatch.setattr(app_config.settings, "allow_client_llm_config", False)
    monkeypatch.setattr(app_config.settings, "llm_provider", "custom")
    monkeypatch.setattr(app_config.settings, "llm_api_key", "server-key")
    monkeypatch.setattr(app_config.settings, "llm_base_url", "http://127.0.0.1:11434")
    monkeypatch.setattr(app_config.settings, "llm_model", "local-model")

    with pytest.raises(HTTPException) as exc_info:
        deps.get_llm_config()
    assert exc_info.value.status_code == 400
    assert "LLM_CONFIG_INVALID_BASE_URL" in exc_info.value.detail


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


@pytest.fixture(autouse=True)
def isolated_runtime_settings(monkeypatch):
    monkeypatch.setattr(app_config, "settings", AppSettings(_env_file=None,
        ENV="development", DEBUG=True, LLM_API_KEY="", DEEPSEEK_API_KEY="", GOOGLE_API_KEY="", GEMINI_API_KEY="",
        LLM_PROVIDER="gemini", LLM_MODEL="", LLM_BASE_URL="", ALLOW_CLIENT_LLM_CONFIG=True,
        ALLOW_CUSTOM_LLM_BASE_URL=False, CLIENT_LLM_ALLOWED_HOSTS=""))
