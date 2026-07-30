"""Generate structured lecture content JSON for Magic PPT."""
import json
import logging
from typing import Any

from openai import OpenAI

from app.core.config import AI_REQUEST_TIMEOUT, DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL
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

Content rules:
- Be concise: each bullet one line; avoid long paragraphs.
- Use proper math terms; formulas in text (e.g. "勾股定理: a²+b²=c²").
- Include 1–2 example slides with title "例题" and clear steps in bullets, and a "本课总结" slide at the end.
- Total: 6–12 content slides (plus one title slide); no empty or divider-only slides.

Output only valid JSON. No markdown code fences or extra text."""


def clean_json_string(raw: str) -> str:
    """Remove markdown fences from model JSON output."""
    return strip_json_markdown(raw)


def generate_lecture_content(
    topic: str,
    grade: str,
    api_key: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
) -> dict[str, Any]:
    """
    Generate structured lecture content JSON using an OpenAI-compatible provider.
    Request-level config takes precedence over env fallback.
    """
    key = (api_key or "").strip() or DEEPSEEK_API_KEY
    if not key:
        raise ValueError(
            "未配置 API Key。请在前端「设置」中选择 DeepSeek 并填写 API Key 后保存，或在 .env 中设置 DEEPSEEK_API_KEY。"
        )

    url = (base_url or "").strip() or DEEPSEEK_BASE_URL
    client = OpenAI(base_url=url, api_key=key, timeout=float(AI_REQUEST_TIMEOUT))
    model_name = (model or "").strip() or DEEPSEEK_MODEL
    user_content = f"Topic: {topic}\nGrade level: {grade}"

    try:
        resp = client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": LECTURE_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            temperature=0.5,
        )
        raw = (resp.choices[0].message.content or "").strip()
        cleaned = clean_json_string(raw)
        data = json.loads(cleaned)
        if not isinstance(data, dict):
            raise ValueError("AI 未返回有效的 JSON 对象")
        if "slides" not in data or not isinstance(data["slides"], list):
            raise ValueError("返回的 JSON 中缺少 slides 数组")
        return data
    except json.JSONDecodeError as exc:
        logger.warning(
            "ppt_lecture_generate_failed",
            extra={"error_type": "JSONDecodeError", "detail": str(exc)},
            exc_info=True,
        )
        raise ValueError(f"AI 返回内容不是合法 JSON: {exc}") from exc
    except Exception as exc:
        logger.warning(
            "ppt_lecture_generate_failed",
            extra={"error_type": type(exc).__name__, "detail": str(exc)},
            exc_info=True,
        )
        raise ValueError(f"生成讲稿失败: {str(exc)}") from exc
