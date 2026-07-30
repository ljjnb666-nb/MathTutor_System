import pytest

from app.core.deps import LLMConfig
from app.services.llm_key_test_service import TEST_PROMPT, test_llm_api_key as run_llm_key_test


@pytest.mark.asyncio
async def test_llm_key_test_requires_key_without_provider_imports():
    result = await run_llm_key_test(LLMConfig(provider="openai", api_key="", base_url="", model="gpt-4.1-mini"))

    assert result["ok"] is False
    assert result["latency_ms"] == 0
    assert result["message"] == "未配置 API Key"


@pytest.mark.asyncio
async def test_llm_key_test_success_uses_minimal_probe():
    async def fake_caller(prompt, config):
        assert prompt == TEST_PROMPT
        assert config.api_key == "test-key"
        return '{"ok": true}'

    result = await run_llm_key_test(
        LLMConfig(provider="openai", api_key="test-key", base_url="https://api.openai.com/v1", model="gpt-4.1-mini"),
        caller=fake_caller,
    )

    assert result["ok"] is True
    assert result["provider"] == "openai"
    assert result["model"] == "gpt-4.1-mini"
    assert result["message"] == "API Key 可用"


@pytest.mark.asyncio
async def test_llm_key_test_failure_redacts_key_material():
    async def fake_caller(prompt, config):
        raise RuntimeError("invalid sk-secret-1234567890 token")

    result = await run_llm_key_test(
        LLMConfig(provider="openai", api_key="sk-secret-1234567890", base_url="", model="gpt-4.1-mini"),
        caller=fake_caller,
    )

    assert result["ok"] is False
    assert "sk-secret-1234567890" not in result["message"]
    assert "sk-secre" not in result["message"]
