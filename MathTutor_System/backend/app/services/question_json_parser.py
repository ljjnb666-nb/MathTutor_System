import json
import logging
import re
from typing import Any

from app.schemas.generation import QuestionItem
from app.services.json_repair_utils import (
    escape_literal_newlines_in_json,
    extract_first_json_array,
    extract_first_json_object,
    fix_json_invalid_escapes,
    strip_json_markdown,
    try_repair_single_json_object,
    try_repair_truncated_json,
)

logger = logging.getLogger(__name__)


def resolve_question_type(item: dict, options: list, answer: str) -> str:
    raw = (item.get("question_type") or item.get("type") or "").strip()
    if raw:
        normalized = raw.replace("题", "").strip()
        if normalized in ("选择", "填空", "解答"):
            return normalized
        if "选择" in raw or raw.lower() in ("choice", "单选"):
            return "选择"
        if "填空" in raw or raw.lower() in ("fill", "填空"):
            return "填空"
        if "解答" in raw or raw.lower() in ("solution", "计算", "应用"):
            return "解答"
    if isinstance(options, list) and len(options) > 0:
        return "选择"
    content = (item.get("content") or item.get("body") or "").strip()
    if "______" in content or "_____" in content or "填空" in content:
        return "填空"
    return "解答"


def log_raw_on_parse_fail(raw: str, err: json.JSONDecodeError) -> None:
    prefix = (raw or "")[:500].replace("\r\n", "\n")
    logger.warning(
        "AI 返回内容解析失败 %s，内容前缀（前 500 字）: %s",
        err,
        prefix if prefix else "(空)",
    )


def extract_questions_from_truncated(raw: str) -> list[QuestionItem]:
    if not raw or not raw.strip():
        return []
    cleaned = strip_json_markdown(raw) or raw
    index = cleaned.find('"questions"')
    if index == -1:
        index = cleaned.find("questions")
        if index == -1:
            return []
    bracket = cleaned.find("[", index)
    if bracket == -1:
        return []

    result: list[QuestionItem] = []
    position = bracket + 1
    while position < len(cleaned):
        while position < len(cleaned) and cleaned[position] in " \t\n\r,":
            position += 1
        if position >= len(cleaned) or cleaned[position] != "{":
            break
        object_start = position
        depth = 0
        in_string = False
        escape = False
        i = object_start
        while i < len(cleaned):
            char = cleaned[i]
            if escape:
                escape = False
                i += 1
                continue
            if char == "\\" and in_string:
                escape = True
                i += 1
                continue
            if char == '"' and not escape:
                in_string = not in_string
                i += 1
                continue
            if not in_string:
                if char == "{":
                    depth += 1
                elif char == "}":
                    depth -= 1
                    if depth == 0:
                        chunk = cleaned[object_start : i + 1]
                        fixed = fix_json_invalid_escapes(chunk)
                        try:
                            item = json.loads(fixed)
                            if isinstance(item, dict) and (item.get("content") or item.get("body") is not None):
                                options = item.get("options") if isinstance(item.get("options"), list) else []
                                answer = str(item.get("answer", ""))
                                result.append(
                                    QuestionItem(
                                        content=item.get("content") or item.get("body", ""),
                                        options=options,
                                        answer=answer,
                                        analysis=item.get("analysis", "") or "",
                                        design_logic=item.get("design_logic"),
                                        type_tag=item.get("type_tag"),
                                        question_type=resolve_question_type(item, options, answer),
                                    )
                                )
                        except (json.JSONDecodeError, TypeError, KeyError):
                            pass
                        position = i + 1
                        break
            i += 1
        else:
            break
    return result


def parse_questions(raw: str) -> list[QuestionItem]:
    if not raw or not (raw and raw.strip()):
        raise ValueError("AI 未返回有效内容（可能为空），请检查 API Key、模型与网络后重试。")
    raw = fix_json_invalid_escapes(raw)
    cleaned = strip_json_markdown(raw)
    if not cleaned:
        raise ValueError("AI 未返回有效内容（可能为空），请检查 API Key、模型与网络后重试。")

    stripped = cleaned.lstrip()
    if not stripped.startswith("{") and not stripped.startswith("["):
        extracted = extract_first_json_object(raw)
        if extracted:
            cleaned = extracted
        else:
            extracted = extract_first_json_array(raw)
            if extracted:
                cleaned = extracted

    cleaned = fix_json_invalid_escapes(cleaned)
    data = None
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as err:
        extracted = extract_first_json_object(raw)
        if extracted:
            try:
                data = json.loads(fix_json_invalid_escapes(extracted))
            except json.JSONDecodeError:
                pass
        if data is None:
            extracted = extract_first_json_array(raw)
            if extracted:
                try:
                    data = json.loads(fix_json_invalid_escapes(extracted))
                except json.JSONDecodeError:
                    pass
        if data is None:
            repaired = try_repair_truncated_json(cleaned)
            if repaired:
                try:
                    data = json.loads(repaired)
                except json.JSONDecodeError:
                    pass
        if data is None:
            partial = extract_questions_from_truncated(raw)
            if partial:
                logger.warning(
                    "JSON 解析失败，从截断内容中解析出 %s 道题（部分结果）。错误: %s",
                    len(partial),
                    err,
                )
                return partial
            log_raw_on_parse_fail(raw, err)
            if "Expecting value" in str(err):
                raise ValueError(
                    "AI 返回内容为空、未包含完整 JSON 或被截断。若使用 DeepSeek-R1（会先输出思考），请改用 DeepSeek-V3（deepseek-chat）；或检查 API 超时与网络。"
                ) from err
            raise ValueError(f"AI 返回的不是合法 JSON: {err!s}。请检查 API 配置与模型是否支持出题。") from err

    if isinstance(data, list):
        questions = data
    elif isinstance(data, dict):
        questions = data.get("questions") or data.get('"questions"')
        if questions is None and ("content" in data or "body" in data):
            questions = [data]
    elif isinstance(data, str):
        raise ValueError(
            'AI 返回的 JSON 根节点为字符串，可能被截断或格式不符。请确认 Prompt 要求输出 {"questions": [...]} 或 [...]，并检查 API 超时与 max_tokens。'
        )
    else:
        raise ValueError("AI 返回的 JSON 根节点既不是数组也不是对象")

    if not isinstance(questions, list):
        raise ValueError('AI 返回的 JSON 中缺少题目列表（应为 {"questions": [...]} 或根节点数组 [...]）。')

    result: list[QuestionItem] = []
    for index, item in enumerate(questions):
        if not isinstance(item, dict):
            logger.warning("跳过非对象题目项 index=%s", index)
            continue
        content = item.get("content") or item.get("body", "")
        options = item.get("options")
        if not isinstance(options, list):
            options = []
        answer = str(item.get("answer", ""))
        try:
            result.append(
                QuestionItem(
                    content=content,
                    options=options,
                    answer=answer,
                    analysis=item.get("analysis", "") or "",
                    design_logic=item.get("design_logic"),
                    type_tag=item.get("type_tag"),
                    question_type=resolve_question_type(item, options, answer),
                )
            )
        except Exception as err:
            logger.warning("解析题目项 index=%s 失败: %s", index, err)
    return result


def normalize_question_content_and_options(content: str, options: list) -> tuple[str, list]:
    if not content or not isinstance(content, str):
        return (content or "", options if isinstance(options, list) else [])
    normalized_options = list(options) if isinstance(options, list) else []
    if normalized_options and any(isinstance(item, str) and len(item.strip()) > 1 for item in normalized_options):
        return (content.strip(), normalized_options)

    text = content.replace("\\n", "\n").strip()
    lines = [line for line in text.split("\n") if line.strip()]
    option_line_re = re.compile(r"^([A-D])\.\s*(.+)$", re.IGNORECASE)
    collected: list[tuple[int, str]] = []
    first_option_index = -1
    for index, line in enumerate(lines):
        match = option_line_re.match(line.strip())
        if match:
            letter = match.group(1).upper()
            option_index = ord(letter) - ord("A")
            if 0 <= option_index <= 3:
                collected.append((option_index, match.group(2).strip()))
                if first_option_index < 0:
                    first_option_index = index
    if first_option_index < 0 or len(collected) < 2:
        return (content.strip(), normalized_options)

    collected.sort(key=lambda item: item[0])
    new_options = [text for _, text in collected]
    stem = "\n".join(lines[:first_option_index]).strip() or content.strip()
    return (stem, new_options)


def try_repair_sync_tutoring_json(cleaned: str) -> dict[str, Any] | None:
    if not cleaned or not cleaned.strip().startswith("{"):
        return None
    candidate = cleaned.rstrip()
    if candidate.endswith("}"):
        return None
    while candidate.endswith("\\") and not candidate.endswith("\\\\"):
        candidate = candidate[:-1].rstrip()
    for suffix in ('"}]}', '"}}]}', '"]}', '"}}', '"}'):
        try:
            data = json.loads(candidate + suffix)
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            continue
    repaired = try_repair_truncated_json(cleaned)
    if repaired:
        try:
            data = json.loads(repaired)
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass
    return None


def parse_sync_tutoring_response(raw: str) -> dict[str, Any]:
    if not raw or not raw.strip():
        raise ValueError("AI 未返回有效内容，请检查 API 与网络后重试。")
    raw = fix_json_invalid_escapes(raw)
    cleaned = strip_json_markdown(raw)
    if not cleaned:
        raise ValueError("AI 未返回有效内容，请检查 API 与网络后重试。")
    cleaned = escape_literal_newlines_in_json(cleaned)
    if not cleaned.lstrip().startswith("{"):
        extracted = extract_first_json_object(raw)
        if extracted:
            cleaned = fix_json_invalid_escapes(extracted)
            cleaned = escape_literal_newlines_in_json(cleaned)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as err:
        repaired = try_repair_sync_tutoring_json(cleaned)
        if repaired is not None:
            data = repaired
        else:
            log_raw_on_parse_fail(raw, err)
            raise ValueError(f"同步辅导返回的不是合法 JSON: {err!s}") from err

    if not isinstance(data, dict):
        raise ValueError("同步辅导返回的根节点必须是对象，包含 knowledge_card、examples、questions。")

    knowledge_card = data.get("knowledge_card")
    if not isinstance(knowledge_card, dict):
        knowledge_card = {"title": "", "summary": "", "key_points": []}
    examples = data.get("examples")
    if not isinstance(examples, list):
        examples = []
    raw_questions = data.get("questions")
    if not isinstance(raw_questions, list):
        raw_questions = []

    questions: list[QuestionItem] = []
    for index, item in enumerate(raw_questions):
        if not isinstance(item, dict):
            continue
        content = item.get("content") or item.get("body", "")
        options = item.get("options")
        if not isinstance(options, list):
            options = []
        content, options = normalize_question_content_and_options(content, options)
        answer = str(item.get("answer", ""))
        try:
            questions.append(
                QuestionItem(
                    content=content,
                    options=options,
                    answer=answer,
                    analysis=item.get("analysis", "") or "",
                    design_logic=item.get("design_logic"),
                    type_tag=item.get("type_tag"),
                    question_type=resolve_question_type(item, options, answer),
                )
            )
        except Exception as err:
            logger.warning("同步辅导题目项 index=%s 解析失败: %s", index, err)

    return {
        "knowledge_card": knowledge_card,
        "examples": examples,
        "questions": questions,
    }
