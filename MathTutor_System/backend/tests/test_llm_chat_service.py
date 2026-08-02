import sys
from types import SimpleNamespace

import pytest

from app.services.llm_chat_service import (
    build_chat_messages,
    chat_completion_async,
    chat_completion_stream_async,
    messages_to_proxy_prompt,
)


class EmptyConfig:
    provider = "openai"
    api_key = ""
    base_url = ""
    model = ""


class OpenAIConfig:
    provider = "openai"
    api_key = "fake-key"
    base_url = "https://api.openai.com/v1"
    model = "fake-model"


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
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "hi"},
        ],
        "system prompt",
    )

    assert messages_to_proxy_prompt(messages) == "[System]\nsystem prompt\n\n[User]\nhello\n\n[Assistant]\nhi"


@pytest.mark.asyncio
async def test_chat_completion_requires_api_key_before_provider_imports():
    with pytest.raises(ValueError):
        await chat_completion_async([{"role": "user", "content": "hello"}], None, EmptyConfig())


@pytest.mark.asyncio
async def test_chat_completion_async_disables_redirects(monkeypatch):
    captured = {}

    class FakeChatOpenAI:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        async def ainvoke(self, messages):
            return SimpleNamespace(content="ok")

    monkeypatch.setitem(sys.modules, "langchain_openai", SimpleNamespace(ChatOpenAI=FakeChatOpenAI))

    out = await chat_completion_async([{"role": "user", "content": "hello"}], None, OpenAIConfig())

    assert out == "ok"
    assert captured["http_async_client"].follow_redirects is False
    await captured["http_async_client"].aclose()


@pytest.mark.asyncio
async def test_chat_completion_stream_async_disables_redirects(monkeypatch):
    captured = {}

    class FakeChatOpenAI:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        async def astream(self, messages):
            yield SimpleNamespace(content="ok")

    monkeypatch.setitem(sys.modules, "langchain_openai", SimpleNamespace(ChatOpenAI=FakeChatOpenAI))

    chunks = [
        chunk
        async for chunk in chat_completion_stream_async([{"role": "user", "content": "hello"}], None, OpenAIConfig())
    ]

    assert chunks == ["ok"]
    assert captured["http_async_client"].follow_redirects is False
    await captured["http_async_client"].aclose()
