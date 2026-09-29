"""Sanitize provider error text before it can reach clients or logs."""
import re

DEFAULT_MASK = "***"

_SECRET_FIELDS = (
    r"(?:api[_-]?key|apikey|key|access[_-]?token|token|password|passwd|secret|"
    r"client[_-]?secret|x[_-](?:api[_-]?key|goog[_-]api[_-]key)|authorization)"
)
_UNQUOTED_SECRET_FIELDS = (
    r"(?:api[_-]?key|apikey|key|access[_-]?token|token|password|passwd|secret|"
    r"client[_-]?secret|x[_-](?:api[_-]?key|goog[_-]api[_-]key))"
)

# Keep labels and auth schemes for useful classification while removing the
# complete credential value. The quoted rule also handles JSON and escaped
# JSON embedded in provider messages; the unquoted rule covers headers and
# query strings, including values shorter than a typical API key.
_QUOTED_FIELD = re.compile(
    rf"(?i)(?P<prefix>(?:\\?[\"'])?{_SECRET_FIELDS}(?:\\?[\"'])?\s*[:=]\s*)"
    rf"(?P<quote>\\?[\"'])(?P<value>.*?)(?P=quote)",
    re.DOTALL,
)
_UNQUOTED_FIELD = re.compile(
    rf"(?i)(?P<prefix>(?:\\?[\"'])?{_UNQUOTED_SECRET_FIELDS}(?:\\?[\"'])?\s*[:=]\s*)"
    r"(?P<value>[^&\s,;\}\]\r\n]+)"
)
_AUTHORIZATION = re.compile(
    r"(?i)(\bauthorization\s*[:=]\s*)(?P<scheme>bearer|basic)(\s+)[^\s,;\}\]]+"
)
_BEARER = re.compile(r"(?i)(\bbearer\s+)[A-Za-z0-9._~+/=-]+")
_BASIC = re.compile(r"(?i)(\bbasic\s+)[A-Za-z0-9+/]+={0,2}")
_AUTHORIZATION_RAW = re.compile(
    r"(?i)(\bauthorization\s*[:=]\s*)(?!bearer\s|basic\s)[^\s,;\}\]]+"
)
_OPENAI_KEY = re.compile(r"\bsk-[A-Za-z0-9_-]{8,}\b")
_GOOGLE_KEY = re.compile(r"\bAIza[0-9A-Za-z_-]{20,}\b")


def mask_secrets(text: str) -> str:
    """Mask credential-like values in plain text, URLs, and serialized errors."""
    if not text:
        return text

    masked = str(text)
    masked = _AUTHORIZATION.sub(r"\1\g<scheme>\3" + DEFAULT_MASK, masked)
    masked = _BEARER.sub(r"\1" + DEFAULT_MASK, masked)
    masked = _BASIC.sub(r"\1" + DEFAULT_MASK, masked)
    masked = _AUTHORIZATION_RAW.sub(r"\1" + DEFAULT_MASK, masked)
    masked = _QUOTED_FIELD.sub(lambda match: match.group("prefix") + match.group("quote") + DEFAULT_MASK + match.group("quote"), masked)
    masked = _UNQUOTED_FIELD.sub(lambda match: match.group("prefix") + DEFAULT_MASK, masked)
    masked = _OPENAI_KEY.sub(DEFAULT_MASK, masked)
    masked = _GOOGLE_KEY.sub(DEFAULT_MASK, masked)
    return masked


def sanitize_llm_error_message(message: str, *, limit: int = 200) -> str:
    """Mask credentials before truncating provider error text."""
    return mask_secrets(str(message or ""))[:limit]


def external_error_type(error: BaseException) -> str:
    """Return a safe, stable log field for an external failure."""
    name = type(error).__name__
    return name if name.isidentifier() else "ExternalError"
