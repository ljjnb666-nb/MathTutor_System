"""Tests for credential masking in provider error messages."""
import pytest

from app.core.llm_sanitize import mask_secrets, sanitize_llm_error_message


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
    assert "LLM 调用失败" in msg


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
