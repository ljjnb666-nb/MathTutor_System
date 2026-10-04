"""Generate structured lecture content JSON for Magic PPT."""
import json
import logging
from typing import Any

import httpx
from openai import OpenAI
from pydantic import ValidationError

from app.core.config import get_settings
from app.core.ai_runtime import LLMConfig, resolve_llm_arguments, assert_resolved_llm_config
from app.core.llm_sanitize import external_error_type
from app.schemas.ppt_dto import PPTContent
from app.services.json_repair_utils import strip_json_markdown

logger = logging.getLogger(__name__)

LECTURE_SYSTEM_PROMPT = """You are an expert math educator creating professional teaching slide decks for middle school (初中) math.
Output a JSON object with a list of slides. Use ONLY two layout types: "title" (first slide only) and "content" (all other slides). Do NOT create any standalone section divider or "以下为本章内容" page.

Structure (strict):
{
  "title": "Presentation Main Title",
  "slides": [
    { "layout": "title", "title": "Main Title", "subtitle": "Optional subtitle or grade/topic" },
    { "layout": "content", "title": "学习目标", "bullets": ["目标1", "目标2"] },
    { "layout": "content", "title": "概念讲解", "bullets": ["Point 1", "Point 2"] },
    { "layout": "content", "title": "例题", "bullets": ["题目：...", "解：步骤1", "步骤2", "答：..."] },
    { "layout": "content", "title": "本课总结", "bullets": ["要点1", "要点2"] }
  ]
}

Layout rules (must follow):
- "title": only the first slide; title + optional subtitle.
- "content": all other slides. Each slide has "title" and "bullets" (array of strings). Do NOT use "section" layout.
- Use content slides with clear titles (e.g. "学习目标", "概念讲解", "例题", "练习", "本课总结") so the structure is clear without any separate divider page.

Math notation rules (must follow):
- Every mathematical expression MUST be wrapped in explicit math delimiters:
  - inline math: $...$ or \\(...\\)
  - display math: $$...$$ or \\[...\\]
- Canonical formulas use LaTeX inside the delimiters, e.g. $a^2+b^2=c^2$, $x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}$.
- Do NOT emit Unicode pseudo-math (e.g. a²+b²=c², √2, x^2, ①) when a mathematical expression is intended; wrap it in delimiters instead. These characters are only acceptable inside regular prose text, never as a formula substitute.
- Do NOT emit HTML, KaTeX rendered output, MathML, SVG, or PowerPoint XML anywhere in the JSON.
- Remember valid JSON escaping: backslashes inside JSON strings must be doubled (e.g. "$c=\\\\sqrt{a^2+b^2}$" is stored as $c=\\sqrt{a^2+b^2}$).

Content rules:
- Be concise: each bullet one line; avoid long paragraphs.
- Use proper math terms; write every formula with the canonical delimiters above (e.g. "勾股定理: $a^2+b^2=c^2$").
- Include 1–2 example slides with title "例题" and clear steps in bullets, and a "本课总结" slide at the end.
- Total: 6–12 content slides (plus one title slide); no empty or divider-only slides.

Example slide with canonical math:
{
  "layout": "content",
  "title": "勾股定理",
  "bullets": [
    "在直角三角形中，$a^2+b^2=c^2$。",
    "若 $a=3$、$b=4$，则 $c=5$。",
    "$$c=\\\\sqrt{a^2+b^2}$$"
  ]
}

Output only valid JSON. No markdown code fences or extra text."""


def clean_json_string(raw: str) -> str:
    """Remove markdown fences from model JSON output."""
    return strip_json_markdown(raw)


def _log_invalid(reason: str) -> None:
    logger.warning("ppt_lecture_generate_failed external_error_type=%s", reason)


def generate_lecture_content(
    topic: str,
    grade: str,
    api_key: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
    llm_config: LLMConfig | None = None,
) -> PPTContent:
    """
    Generate structured lecture content JSON using an OpenAI-compatible provider.
    Request-level config takes precedence over env fallback.

    LLM 输出视为不可信数据：解析与结构校验失败统一返回受控的
    LLM_RESPONSE_INVALID；仅 provider/传输失败返回 LLM_PROVIDER_ERROR。
    两条路径都不向客户端或日志泄漏原始 provider 异常文本。
    """
    config = llm_config or resolve_llm_arguments(get_settings(), api_key=api_key or "", base_url=base_url or "", model=model or "")
    spec = assert_resolved_llm_config(config)
    key, url, model_name = config.api_key, config.base_url, config.model
    user_content = f"Topic: {topic}\nGrade level: {grade}"

    try:
        if spec.transport == "gemini":
            from app.services.gemini_rest_service import gemini_rest_text_sync
            raw = gemini_rest_text_sync(f"{LECTURE_SYSTEM_PROMPT}\n{user_content}", key, model_name,
                request_timeout=config.request_timeout, base_url=config.base_url,
                api_version=config.api_version, proxy_url=config.proxy_url)
        else:
            client = OpenAI(base_url=url, api_key=key, timeout=float(config.request_timeout), max_retries=config.max_retries,
                http_client=httpx.Client(proxy=config.proxy_url or None, trust_env=False, follow_redirects=False))
            resp = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": LECTURE_SYSTEM_PROMPT},
                    {"role": "user", "content": user_content},
                ],
                temperature=0.5,
            )
            raw = (resp.choices[0].message.content or "").strip()
    except Exception as exc:
        # Provider/transport failure only; never leak raw provider exception text.
        logger.warning("ppt_lecture_generate_failed external_error_type=%s", external_error_type(exc))
        raise ValueError("LLM_PROVIDER_ERROR: 讲稿生成服务暂时不可用，请稍后重试。") from None

    cleaned = clean_json_string(raw)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        _log_invalid("JSONDecodeError")
        raise ValueError("LLM_RESPONSE_INVALID: 讲稿服务返回格式无法解析，请调整主题后重试。") from None
    if not isinstance(data, dict):
        _log_invalid("PPTSchemaError")
        raise ValueError("LLM_RESPONSE_INVALID: 讲稿服务返回格式无法解析，请调整主题后重试。") from None

    try:
        return PPTContent.model_validate(data)
    except ValidationError:
        _log_invalid("PPTSchemaError")
        raise ValueError("LLM_RESPONSE_INVALID: 讲稿内容结构不符合要求，请调整主题后重试。") from None
