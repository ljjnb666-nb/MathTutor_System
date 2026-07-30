"""Generic JSON cleanup, extraction, and repair helpers for LLM output."""
import json
import re


def strip_json_markdown(text: str) -> str:
    if not text:
        return ""
    text = text.strip().lstrip("\ufeff")
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if match:
        return match.group(1).strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*\n?", "", text, count=1).strip()
    if text.startswith("`"):
        first_line, _, rest = text.partition("\n")
        if first_line.strip().startswith("```"):
            text = rest.strip()
    return text


def fix_json_invalid_escapes(text: str) -> str:
    if not text:
        return text
    result: list[str] = []
    i = 0
    while i < len(text):
        char = text[i]
        if char != "\\":
            result.append(char)
            i += 1
            continue
        if i + 1 >= len(text):
            result.append("\\\\")
            i += 1
            continue
        next_char = text[i + 1]
        if next_char in "tfnr" and i + 2 < len(text) and text[i + 2].isalpha():
            result.append("\\\\")
            result.append(next_char)
            i += 2
            continue
        if next_char in '"\\/bfnrt':
            result.append(char)
            result.append(next_char)
            i += 2
            continue
        if next_char == "u" and i + 5 <= len(text) and re.match(r"[0-9a-fA-F]{4}", text[i + 2 : i + 6]):
            result.append(char)
            result.append(next_char)
            result.append(text[i + 2 : i + 6])
            i += 6
            continue
        result.append("\\\\")
        result.append(next_char)
        i += 2
    return "".join(result)


def escape_literal_newlines_in_json(text: str) -> str:
    if not text:
        return text
    result: list[str] = []
    in_string = False
    escape = False
    i = 0
    while i < len(text):
        char = text[i]
        if escape:
            escape = False
            result.append(char)
            i += 1
            continue
        if char == "\\" and in_string:
            escape = True
            result.append(char)
            i += 1
            continue
        if char == '"':
            in_string = not in_string
            result.append(char)
            i += 1
            continue
        if in_string:
            if char == "\n":
                result.append("\\n")
                i += 1
                continue
            if char == "\r":
                result.append("\\r")
                i += 1
                continue
        result.append(char)
        i += 1
    return "".join(result)


def try_repair_truncated_json(text: str) -> str | None:
    if not text or not text.strip().startswith("{"):
        return None
    candidate = text.rstrip()
    if candidate.endswith("}"):
        return None
    while candidate.endswith("\\") and not candidate.endswith("\\\\"):
        candidate = candidate[:-1].rstrip()
    for suffix in ('"}]}', '"}}]}'):
        repaired = candidate + suffix
        try:
            json.loads(repaired)
            return repaired
        except json.JSONDecodeError:
            continue
    return None


def try_repair_single_json_object(text: str) -> str | None:
    if not text or not text.strip().startswith("{"):
        return None
    candidate = text.rstrip()
    if candidate.endswith("}"):
        return None
    while candidate.endswith("\\") and not candidate.endswith("\\\\"):
        candidate = candidate[:-1].rstrip()
    for suffix in ('"}', '"', '}'):
        try:
            if json.loads(candidate + suffix):
                return candidate + suffix
        except json.JSONDecodeError:
            continue
    return None


def extract_first_json_object(text: str) -> str:
    return extract_first_balanced_json(text, "{", "}")


def extract_first_json_array(text: str) -> str:
    return extract_first_balanced_json(text, "[", "]")


def extract_first_balanced_json(text: str, open_char: str, close_char: str) -> str:
    if not text or not text.strip():
        return ""
    start = text.find(open_char)
    if start == -1:
        return ""
    depth = 0
    in_string = False
    escape = False
    i = start
    while i < len(text):
        char = text[i]
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
            if char == open_char:
                depth += 1
            elif char == close_char:
                depth -= 1
                if depth == 0:
                    return text[start : i + 1]
        i += 1
    return ""
