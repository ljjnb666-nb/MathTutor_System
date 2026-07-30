import pytest

from app.services.llm_chat_service import (
    build_chat_messages,
    chat_completion_async,
    messages_to_proxy_prompt,
)


class FakeConfig:
    provider = "openai"
    api_key = ""
    base_url = ""
    model = ""


def test_build_chat_messages_adds_system_and_maps_roles():
    messages = build_chat_messages(
        [
            {"role": "user", "content": "  hello  "},
            {"role": "assistant", "content": "hi"},
            {"role": "unknown", "content": "fallback"},
        ],
        " system prompt ",
    )

    assert [type(message).__name__ for message in messages] == [
        "SystemMessage",
        "HumanMessage",
        "AIMessage",
        "HumanMessage",
    ]
    assert [message.content for message in messages] == ["system prompt", "hello", "hi", "fallback"]


def test_messages_to_proxy_prompt_flattens_chat_history():
    messages = build_chat_messages(
        [
            {"role": "user", "content": "你好"},
            {"role": "assistant", "content": "你好，有什么问题？"},
        ],
        "你是数学老师",
    )

    assert messages_to_proxy_prompt(messages) == (
        "[System]\n你是数学老师\n\n"
        "[User]\n你好\n\n"
        "[Assistant]\n你好，有什么问题？"
    )


@pytest.mark.asyncio
async def test_chat_completion_requires_api_key_before_provider_imports():
    with pytest.raises(ValueError, match="未配置 API Key"):
        await chat_completion_async([{"role": "user", "content": "hello"}], None, FakeConfig())
