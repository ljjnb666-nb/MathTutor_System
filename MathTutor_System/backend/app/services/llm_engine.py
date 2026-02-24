"""
LLM 调用封装：Google Generative AI / OpenAI，用于智能出题
"""
import json
import re
from typing import Any

from app.core.config import LLM_API_KEY, LLM_PROVIDER
from app.core.prompts import GENERATE_QUESTIONS_PROMPT
from app.schemas.question_dto import QuestionResponse


def _extract_json(text: str) -> str:
    """从返回文本中提取 JSON，兼容 ```json ... ``` 或裸 JSON。"""
    text = text.strip()
    # 去掉 markdown 代码块
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if match:
        return match.group(1).strip()
    return text


def _parse_questions_json(raw: str) -> list[dict[str, Any]]:
    """解析 JSON 字符串为题目列表，失败返回空列表。"""
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, dict):
        return []
    questions = data.get("questions")
    if not isinstance(questions, list):
        return []
    return questions


def _raw_to_question_list(raw: str) -> list[QuestionResponse]:
    """将 LLM 返回的字符串解析为 QuestionResponse 列表。"""
    json_str = _extract_json(raw)
    items = _parse_questions_json(json_str)
    result: list[QuestionResponse] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        try:
            result.append(
                QuestionResponse(
                    body=item.get("body", ""),
                    options=item.get("options") if isinstance(item.get("options"), list) else [],
                    answer=str(item.get("answer", "")),
                    analysis=item.get("analysis", "") or "",
                )
            )
        except Exception:
            continue
    return result


def _call_llm(prompt: str, max_retries: int = 2) -> str:
    """根据 LLM_PROVIDER 调用对应 LLM，返回回复文本。"""
    if not LLM_API_KEY:
        raise ValueError("未配置 LLM_API_KEY，请在 .env 中设置")

    last_error: Exception | None = None
    for _ in range(max_retries + 1):
        try:
            if LLM_PROVIDER.lower() == "gemini":
                from langchain_google_genai import ChatGoogleGenerativeAI

                llm = ChatGoogleGenerativeAI(
                    model="gemini-1.5-flash",
                    api_key=LLM_API_KEY,
                    temperature=0.3,
                )
                msg = llm.invoke(prompt)
                return msg.content if hasattr(msg, "content") else str(msg)
            if LLM_PROVIDER.lower() == "openai":
                from openai import OpenAI

                client = OpenAI(api_key=LLM_API_KEY)
                resp = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.3,
                )
                content = resp.choices[0].message.content
                return content or ""
            raise ValueError(f"不支持的 LLM_PROVIDER: {LLM_PROVIDER}，请使用 gemini 或 openai")
        except Exception as e:
            last_error = e
            continue
    raise last_error or RuntimeError("LLM 调用失败")


def generate_math_questions(
    knowledge_point: str,
    difficulty: str,
    count: int = 3,
) -> list[QuestionResponse]:
    """
    根据知识点、难度和数量调用 LLM 生成数学题，解析为 QuestionResponse 列表。
    若 JSON 解析失败则重试一次；仍失败则返回包含错误信息的默认结构。
    """
    prompt = GENERATE_QUESTIONS_PROMPT.format(
        knowledge_point=knowledge_point,
        difficulty=difficulty,
        count=count,
    )
    default_error = [
        QuestionResponse(
            body="题目生成失败，请检查 LLM 配置或稍后重试。",
            options=[],
            answer="",
            analysis="",
        )
    ]
    try:
        raw = _call_llm(prompt)
    except Exception as e:
        return [
            QuestionResponse(
                body=f"调用 LLM 失败：{e!s}",
                options=[],
                answer="",
                analysis="",
            )
        ]
    questions = _raw_to_question_list(raw)
    if not questions:
        # 解析失败，重试一次
        try:
            raw = _call_llm(prompt)
            questions = _raw_to_question_list(raw)
        except Exception:
            pass
    if not questions:
        return default_error
    return questions
