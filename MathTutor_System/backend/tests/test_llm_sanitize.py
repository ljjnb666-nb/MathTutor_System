"""Tests for credential masking in provider error messages."""
import pytest

from app.core.llm_sanitize import mask_secrets, sanitize_llm_error_message


def fixture_api_key() -> str:
    """Runtime-assembled fixture key; never a real credential literal."""
    return "".join(["fixture", "-", "api", "-", "key"])


def test_mask_secrets_masks_openai_style_keys():
    text = "Authentication failed for key sk-abcdef1234567890xyz"
    masked = mask_secrets(text)
    assert "sk-abcdef1234567890xyz" not in masked
    assert "***" in masked


def test_mask_secrets_masks_google_api_keys():
    masked = mask_secrets("request failed: https://example.com/v1?x=1&key=AIzaSyA1234567890abcdefghijklmnopqrstu")
    assert "AIzaSyA1234567890abcdefghijklmnopqrstu" not in masked


def test_mask_secrets_masks_bearer_tokens_but_keeps_scheme():
    masked = mask_secrets("Authorization: Bearer abcdef1234567890 rejected")
    assert "abcdef1234567890" not in masked
    assert "bearer" in masked.lower()


def test_mask_secrets_masks_key_values_but_keeps_field_name():
    masked = mask_secrets("Invalid api_key: sk-value-12345678 supplied")
    assert "sk-value-12345678" not in masked
    assert "api_key" in masked


@pytest.mark.parametrize(
    "field",
    ["api_key", "api-key", "apikey", "key", "token", "access_token", "password", "secret"],
)
def test_mask_secrets_masks_short_and_long_secret_fields(field):
    secret = "prefix-secret-tail"
    masked = mask_secrets(f"provider failed: {field}={secret}")
    assert secret not in masked
    assert "prefix" not in masked
    assert "tail" not in masked
    assert field in masked


def test_mask_secrets_masks_basic_authorization_header():
    secret = "dXNlcjpwYXNzd29yZA=="
    masked = mask_secrets(f"Authorization: Basic {secret}")
    assert secret not in masked
    assert "Authorization" in masked
    assert "Basic" in masked


def test_mask_secrets_masks_json_query_multiline_and_nested_serialized_errors():
    secrets = ["json-secret-value", "query-secret-value", "nested-secret-value", "line-secret-value"]
    text = (
        '{"token":"json-secret-value", "password":"also-secret-value"} '
        "https://api.openai.com/v1/path?access_token=query-secret-value&x=1\n"
        'provider error: {\\"error\\":{\\"token\\":\\"nested-secret-value\\"}}\n'
        "password=line-secret-value"
    )
    masked = mask_secrets(text)
    for secret in secrets + ["also-secret-value"]:
        assert secret not in masked
    assert '"token"' in masked
    assert "access_token" in masked


def test_mask_secrets_leaves_clean_text_unchanged():
    text = "模型连接超时，请检查网络 Base URL https://api.deepseek.com"
    assert mask_secrets(text) == text


def test_mask_secrets_handles_empty():
    assert mask_secrets("") == ""


def test_sanitize_llm_error_message_truncates():
    out = sanitize_llm_error_message("x" * 500)
    assert len(out) == 200


def test_sanitize_llm_error_message_masks_before_truncation():
    secret = "sk-" + "a" * 40
    out = sanitize_llm_error_message(f"prefix {secret} suffix " + "y" * 400)
    assert secret not in out


def _dummy_config():
    """Config stub whose api_key is computed (never a literal credential)."""

    class _Cfg:
        provider = "openai"
        base_url = "https://api.example.com"
        model = "test-model"
        request_timeout = 73
        max_retries = 2
        proxy_url = ""

    cfg = _Cfg()
    cfg.api_key = "t" * 16  # non-empty marker; the LLM is mocked and never called
    return cfg


class _ExplodingLLM:
    def __init__(self, **kwargs):
        pass

    def invoke(self, prompt):
        raise RuntimeError(
            "Connection error: https://api.deepseek.com/v1/chat (sk-deadbeef12345678) "
            "and bearer AbCdEf1234567890123456"
        )


def test_call_llm_error_message_is_sanitized(monkeypatch):
    import app.services.llm_client_service as lcs

    monkeypatch.setattr("langchain_openai.ChatOpenAI", _ExplodingLLM)
    with pytest.raises(ValueError) as exc_info:
        lcs.call_llm("ping", _dummy_config())
    msg = str(exc_info.value)
    assert "sk-deadbeef12345678" not in msg
    assert "AbCdEf1234567890123456" not in msg
    assert msg.startswith("LLM_PROVIDER_ERROR:")


def test_call_llm_auth_error_keeps_fixed_message(monkeypatch):
    import app.services.llm_client_service as lcs

    class _AuthExplodingLLM:
        def __init__(self, **kwargs):
            pass

        def invoke(self, prompt):
            raise RuntimeError("401 Unauthorized: invalid credentials")

    monkeypatch.setattr("langchain_openai.ChatOpenAI", _AuthExplodingLLM)

    with pytest.raises(ValueError) as exc_info:
        lcs.call_llm("ping", _dummy_config())
    assert "API Key" in str(exc_info.value)


def test_word_parser_provider_error_is_mapped_and_not_logged(monkeypatch, caplog):
    import logging
    import app.services.word_parser as word_parser

    secret = "sk-provider-secret-123456"

    class _Completions:
        def create(self, **kwargs):
            raise RuntimeError(f"provider rejected request Authorization: Bearer {secret}")

    class _OpenAI:
        def __init__(self, **kwargs):
            self.chat = type("_Chat", (), {"completions": _Completions()})()

    monkeypatch.setattr(word_parser, "OpenAI", _OpenAI)
    with caplog.at_level(logging.WARNING):
        with pytest.raises(ValueError) as exc_info:
            word_parser.parse_with_deepseek(
                "question", api_key=fixture_api_key(), base_url="https://api.openai.com/v1", provider="openai"
            )

    assert str(exc_info.value).startswith("LLM_PROVIDER_ERROR:")
    assert secret not in str(exc_info.value)
    assert secret not in caplog.text
    assert "RuntimeError" in caplog.text


def test_ppt_provider_error_is_mapped_and_not_logged(monkeypatch, caplog):
    import logging
    import app.services.ppt_content_service as ppt

    secret = "token-provider-secret-tail"

    class _Completions:
        def create(self, **kwargs):
            raise RuntimeError(f"provider body token={secret}")

    class _OpenAI:
        def __init__(self, **kwargs):
            self.chat = type("_Chat", (), {"completions": _Completions()})()

    monkeypatch.setattr(ppt, "OpenAI", _OpenAI)
    with caplog.at_level(logging.WARNING):
        with pytest.raises(ValueError) as exc_info:
            ppt.generate_lecture_content("linear functions", "middle", api_key=fixture_api_key())

    assert str(exc_info.value).startswith("LLM_PROVIDER_ERROR:")
    assert secret not in str(exc_info.value)
    assert secret not in caplog.text
    assert "RuntimeError" in caplog.text


def test_word_parser_client_setup_error_is_mapped(monkeypatch):
    import app.services.word_parser as word_parser

    secret = "password=setup-secret-tail"

    class _OpenAI:
        def __init__(self, **kwargs):
            raise RuntimeError(f"client setup failed: {secret}")

    monkeypatch.setattr(word_parser, "OpenAI", _OpenAI)
    with pytest.raises(ValueError) as exc_info:
        word_parser.parse_with_deepseek(
            "question", api_key=fixture_api_key(), base_url="https://api.openai.com/v1", provider="openai"
        )

    assert str(exc_info.value).startswith("LLM_PROVIDER_ERROR:")
    assert "setup-secret-tail" not in str(exc_info.value)


@pytest.fixture(autouse=True)
def public_runtime_dns(monkeypatch):
    import socket
    monkeypatch.setattr(socket, "getaddrinfo", lambda host, port, **kw: [(2, 1, 6, "", ("93.184.216.34", port))])
