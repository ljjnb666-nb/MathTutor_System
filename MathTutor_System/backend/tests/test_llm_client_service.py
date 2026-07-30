import pytest

from app.services.llm_client_service import _openai_kwargs, call_llm, call_llm_async


class EmptyConfig:
    provider = "openai"
    api_key = ""
    base_url = ""
    model = ""


def test_openai_kwargs_enables_json_mode_for_non_deepseek():
    kwargs = _openai_kwargs(
        api_key="key",
        model="model",
        base_url="https://api.openai.com/v1",
        temperature=0.2,
        max_tokens=100,
        json_mode=True,
    )

    assert kwargs["temperature"] == 0.2
    assert kwargs["base_url"] == "https://api.openai.com/v1"
    assert kwargs["model_kwargs"] == {"response_format": {"type": "json_object"}}


def test_openai_kwargs_disables_json_mode_and_forces_temperature_for_deepseek():
    kwargs = _openai_kwargs(
        api_key="key",
        model="model",
        base_url="https://api.deepseek.com",
        temperature=0.2,
        max_tokens=100,
        json_mode=True,
    )

    assert kwargs["temperature"] == 1.0
    assert "model_kwargs" not in kwargs


def test_call_llm_requires_api_key_before_provider_imports():
    with pytest.raises(ValueError, match="未配置 API Key"):
        call_llm("prompt", EmptyConfig())


@pytest.mark.asyncio
async def test_call_llm_async_requires_api_key_before_provider_imports():
    with pytest.raises(ValueError, match="未配置 API Key"):
        await call_llm_async("prompt", EmptyConfig())
