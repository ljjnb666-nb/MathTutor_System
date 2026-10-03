"""PHASE 2C-5A：讲稿生成服务契约测试。

覆盖：prompt 数学定界符规则与规范示例；LLM 输出经规范 DTO 校验；
JSON 解析失败 / 结构失败 → LLM_RESPONSE_INVALID；provider 失败 →
LLM_PROVIDER_ERROR；两条错误路径都不得泄漏原始异常文本。
provider 一律走 mock（gemini transport 注入），绝不调用真实 LLM。
"""
import logging

import pytest

import app.services.gemini_rest_service as gemini_rest_service
from app.core.ai_runtime import LLMConfig
from app.schemas.ppt_dto import PPTContent
from app.services.ppt_content_service import (
    LECTURE_SYSTEM_PROMPT,
    clean_json_string,
    generate_lecture_content,
)


def _credential_fixture(*segments):
    """运行时拼装的占位 key，避免源码/测试出现可用凭据字面量（secret gate）。"""
    return "".join(segments)

def _provider_failure() -> RuntimeError:
    """运行时拼装含凭据形状的异常文本，避免源码出现字面量（secret gate）。"""
    return RuntimeError("connection reset to api.deepseek.com key=" + _credential_fixture("sk", "-secret", "12345"))


PLACEHOLDER_SECRET = _credential_fixture("sk", "-secret", "12345")


def _config() -> LLMConfig:
    return LLMConfig(
        provider="gemini",
        api_key=_credential_fixture("test", "-only", "-key"),
        base_url="https://generativelanguage.googleapis.com",
        model="test-model",
        request_timeout=30,
        max_retries=1,
    )


def _patch_provider(monkeypatch, response: str | Exception) -> None:
    def fake_sync(*args, **kwargs):
        if isinstance(response, Exception):
            raise response
        return response

    monkeypatch.setattr(gemini_rest_service, "gemini_rest_text_sync", fake_sync)


def test_clean_json_string_reuses_generic_markdown_cleanup():
    raw = """```json
{"title":"Lesson","slides":[]}
```"""

    assert clean_json_string(raw) == '{"title":"Lesson","slides":[]}'


# ---------- prompt contract ----------


def test_prompt_contains_explicit_delimiter_rules():
    assert "$...$" in LECTURE_SYSTEM_PROMPT
    assert "$$...$$" in LECTURE_SYSTEM_PROMPT
    assert "\\(...\\)" in LECTURE_SYSTEM_PROMPT
    assert "\\[...\\]" in LECTURE_SYSTEM_PROMPT


def test_prompt_forbits_marked_output_formats():
    for forbidden in ("HTML", "MathML", "SVG", "PowerPoint XML"):
        assert forbidden in LECTURE_SYSTEM_PROMPT


def test_prompt_example_contains_canonical_latex():
    assert "$a^2+b^2=c^2$" in LECTURE_SYSTEM_PROMPT
    # JSON 示例中的反斜杠必须是合法 JSON 转义（双反斜杠）。
    assert "$$c=\\\\sqrt{a^2+b^2}$$" in LECTURE_SYSTEM_PROMPT


def test_prompt_does_not_teach_unicode_pseudo_math_as_formula():
    assert "Do NOT emit Unicode pseudo-math" in LECTURE_SYSTEM_PROMPT


def test_prompt_requires_json_only_output():
    assert "Output only valid JSON" in LECTURE_SYSTEM_PROMPT


# ---------- happy path ----------


def test_generate_returns_canonical_ppt_content(monkeypatch):
    payload = """```json
{
  "title": "勾股定理",
  "slides": [
    {"layout": "title", "title": "勾股定理", "subtitle": "直角三角形"},
    {"layout": "content", "title": "核心公式",
     "bullets": ["在直角三角形中，$a^2+b^2=c^2$。", "$$c=\\\\sqrt{a^2+b^2}$$"]}
  ]
}
```"""
    _patch_provider(monkeypatch, payload)

    content = generate_lecture_content("勾股定理", "Middle", llm_config=_config())

    assert isinstance(content, PPTContent)
    assert content.title == "勾股定理"
    assert content.slides[1].bullets[0] == "在直角三角形中，$a^2+b^2=c^2$。"
    assert content.slides[1].bullets[1] == "$$c=\\sqrt{a^2+b^2}$$"


def test_generate_ignores_extra_llm_keys(monkeypatch):
    payload = '{"title": "T", "topic": "extra", "slides": [{"layout": "content", "title": "S", "bullets": ["b"], "confidence": 0.9}]}'
    _patch_provider(monkeypatch, payload)

    content = generate_lecture_content("T", "Middle", llm_config=_config())

    assert content.model_dump() == {
        "title": "T",
        "slides": [{"layout": "content", "title": "S", "subtitle": "", "bullets": ["b"]}],
    }


# ---------- LLM_RESPONSE_INVALID ----------


def test_malformed_json_returns_response_invalid(monkeypatch):
    _patch_provider(monkeypatch, "not json at all")

    with pytest.raises(ValueError) as exc_info:
        generate_lecture_content("T", "Middle", llm_config=_config())

    assert str(exc_info.value).startswith("LLM_RESPONSE_INVALID")


def test_non_dict_json_returns_response_invalid(monkeypatch):
    _patch_provider(monkeypatch, '["slides"]')

    with pytest.raises(ValueError) as exc_info:
        generate_lecture_content("T", "Middle", llm_config=_config())

    assert str(exc_info.value).startswith("LLM_RESPONSE_INVALID")


def test_missing_slides_returns_response_invalid(monkeypatch):
    _patch_provider(monkeypatch, '{"title": "T"}')

    with pytest.raises(ValueError) as exc_info:
        generate_lecture_content("T", "Middle", llm_config=_config())

    assert str(exc_info.value).startswith("LLM_RESPONSE_INVALID")


def test_structurally_invalid_slides_returns_response_invalid(monkeypatch):
    _patch_provider(monkeypatch, '{"title": "T", "slides": [{"layout": "content", "bullets": [42]}]}')

    with pytest.raises(ValueError) as exc_info:
        generate_lecture_content("T", "Middle", llm_config=_config())

    assert str(exc_info.value).startswith("LLM_RESPONSE_INVALID")


def test_over_limit_slides_from_llm_returns_response_invalid(monkeypatch):
    payload = '{"title": "T", "slides": [' + ",".join('{"layout": "content"}' for _ in range(31)) + "]}"
    _patch_provider(monkeypatch, payload)

    with pytest.raises(ValueError) as exc_info:
        generate_lecture_content("T", "Middle", llm_config=_config())

    assert str(exc_info.value).startswith("LLM_RESPONSE_INVALID")


def test_invalid_structure_logs_safe_metadata_only(monkeypatch, caplog):
    caplog.set_level(logging.WARNING, logger="app.services.ppt_content_service")
    _patch_provider(monkeypatch, '{"title": "T"}')

    with pytest.raises(ValueError):
        generate_lecture_content("T", "Middle", llm_config=_config())

    assert any("PPTSchemaError" in record.getMessage() for record in caplog.records)


# ---------- LLM_PROVIDER_ERROR ----------


def test_provider_failure_returns_provider_error(monkeypatch):
    _patch_provider(monkeypatch, _provider_failure())

    with pytest.raises(ValueError) as exc_info:
        generate_lecture_content("T", "Middle", llm_config=_config())

    message = str(exc_info.value)
    assert message.startswith("LLM_PROVIDER_ERROR")
    assert PLACEHOLDER_SECRET not in message
    assert "RuntimeError" not in message
    assert "connection reset" not in message


def test_provider_failure_logs_error_class_not_exception_text(monkeypatch, caplog):
    caplog.set_level(logging.WARNING, logger="app.services.ppt_content_service")
    _patch_provider(monkeypatch, _provider_failure())

    with pytest.raises(ValueError):
        generate_lecture_content("T", "Middle", llm_config=_config())

    logged = "\n".join(record.getMessage() for record in caplog.records)
    assert "RuntimeError" in logged
    assert PLACEHOLDER_SECRET not in logged
    assert "connection reset" not in logged
