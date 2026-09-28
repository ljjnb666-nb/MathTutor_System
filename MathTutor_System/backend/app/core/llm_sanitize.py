"""Mask credential-like fragments in provider error messages.

Provider SDKs and HTTP layers occasionally echo API keys inside exception
text (``sk-…`` keys, ``key=…`` query parameters, ``Authorization: Bearer …``
headers).  These helpers scrub such fragments before the text is surfaced in
API responses or logs.  Field names are preserved so downstream error
classification (e.g. detecting "api key" in a message) keeps working.
"""
import re

# (pattern, replacement template) — templates use \1 to keep field names so
# that downstream error classification still sees keywords like "api key".
_SECRET_RULES: tuple[tuple[re.Pattern[str], str], ...] = (
    # OpenAI/DeepSeek style keys
    (re.compile(r"\bsk-[A-Za-z0-9_-]{8,}\b"), "***"),
    # Google API keys
    (re.compile(r"\bAIza[0-9A-Za-z_-]{20,}\b"), "***"),
    # Authorization: Bearer <token>
    (re.compile(r"(?i)\b(bearer\s+)[A-Za-z0-9._~+/=-]{8,}"), r"\1***"),
    # api_key=<value> / api-key=<value> (keep the field name for classification)
    (re.compile(r"(?i)\b(api[_-]?key\s*[=:]\s*[\"']?)[A-Za-z0-9._~+/=-]{8,}"), r"\1***"),
    # ?key=<value> query parameters (Google style)
    (re.compile(r"(?i)([?&]key=)[A-Za-z0-9._~-]{8,}"), r"\1***"),
)

DEFAULT_MASK = "***"


def mask_secrets(text: str) -> str:
    """Return *text* with credential-like fragments masked."""
    if not text:
        return text
    masked = text
    for pattern, template in _SECRET_RULES:
        masked = pattern.sub(template, masked)
    return masked


def sanitize_llm_error_message(message: str, *, limit: int = 200) -> str:
    """Normalise a provider error message for safe surfacing.

    Masks credential-like fragments and truncates to *limit* characters.
    """
    return mask_secrets(str(message or ""))[:limit]
