import json
from typing import Any


def get_message_content_safe(msg: Any) -> Any:
    """Extract content without triggering fragile LangChain/OpenAI content properties first."""
    data = getattr(msg, "__dict__", None) or {}
    output = data.get("content")
    if output is not None:
        return output

    response_metadata = getattr(msg, "response_metadata", None) or {}
    if isinstance(response_metadata, dict):
        output = response_metadata.get("content")
        if output is not None:
            return output
        body = response_metadata.get("body")
        if isinstance(body, dict):
            choices = body.get("choices")
            if isinstance(choices, list) and choices:
                message = choices[0].get("message") if isinstance(choices[0], dict) else None
                if isinstance(message, dict):
                    output = message.get("content")
                    if output is not None:
                        return output
        if body is not None:
            return body

    additional_kwargs = getattr(msg, "additional_kwargs", None) or {}
    output = additional_kwargs.get("content") if isinstance(additional_kwargs, dict) else None
    if output is not None:
        return output

    try:
        return getattr(msg, "content", None)
    except KeyError:
        return None


def normalize_llm_output(output: Any) -> str:
    """Normalize provider output blocks into a single string."""
    if output is None:
        return ""
    if isinstance(output, str):
        return output
    if isinstance(output, dict):
        try:
            return json.dumps(output, ensure_ascii=False)
        except (TypeError, ValueError):
            return str(output)
    if isinstance(output, list):
        parts: list[str] = []
        for item in output:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                parts.append(normalize_llm_output(item.get("text") or item.get("content")))
            elif hasattr(item, "content"):
                try:
                    raw = getattr(item, "content", None)
                except KeyError:
                    raw = getattr(item, "__dict__", {}).get("content") if hasattr(item, "__dict__") else None
                try:
                    parts.append(normalize_llm_output(raw))
                except KeyError:
                    parts.append(str(raw) if raw is not None else "")
            else:
                parts.append(str(item))
        return "".join(parts) if parts else ""
    return str(output)


def fallback_content_from_message(msg: Any) -> str:
    output = get_message_content_safe(msg)
    if isinstance(output, str):
        return output
    if isinstance(output, (dict, list)):
        try:
            return json.dumps(output, ensure_ascii=False)
        except (TypeError, ValueError):
            pass
    return str(msg)
