"""
智能出题 LLM 服务：组装 Prompt、按配置动态调用 LLM、清洗并解析 JSON。
支持并发生成：count > 1 时拆成多个单题任务，用 asyncio.gather 并行执行。
Gemini 用 ChatGoogleGenerativeAI；其余用 ChatOpenAI(base_url) 兼容 DeepSeek/Kimi 等。
"""
import asyncio
import json
import logging
import os
import re
from typing import Any

from app.core.prompts import (
    MATH_GENERATION_PROMPT,
    SCENARIO_INSTRUCTIONS,
    REF_IGNORE_KNOWLEDGE_POINT,
    SPECIALIZED_REF_PROMPT,
    ERROR_ANALYSIS_REF_PROMPT,
    ERROR_CRUSHER_REF_PROMPT,
    ASSESSMENT_PROMPT,
    SYNC_TUTORING_PROMPT,
    EXAM_PART_INSTRUCTIONS,
    VERIFY_QUESTION_PROMPT,
    GENERATE_ANALYSIS_PROMPT,
)
from app.core.config import AI_REQUEST_TIMEOUT, RAG_TOP_K
from app.schemas.generation import ExamGenerateRequest, GenerateRequest, QuestionItem

logger = logging.getLogger(__name__)


def _resolve_question_type(item: dict, options: list, answer: str) -> str:
    """
    解析单题题型：优先用 LLM 返回的 question_type/type，否则根据 options/content 推断。
    返回统一为「选择」「填空」「解答」之一。无选项时默认「解答」，仅当题干有明显填空占位（如______）或含「填空」字样时才判为「填空」，避免解答题因答案较短被误判为填空。
    """
    raw = (item.get("question_type") or item.get("type") or "").strip()
    if raw:
        r = raw.replace("题", "").strip()
        if r in ("选择", "填空", "解答"):
            return r
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

MAX_RETRIES = 2

GEMINI_REST_BASE = "https://generativelanguage.googleapis.com/v1beta"


def _get_proxy_exit_ip_sync(proxy_url: str) -> str:
    """用同一代理请求 ipify，返回出口 IP，用于诊断代理是否生效。"""
    import httpx
    try:
        with httpx.Client(proxy=proxy_url, timeout=10.0, trust_env=True) as client:
            r = client.get("https://api.ipify.org")
            r.raise_for_status()
            return (r.text or "").strip() or "未知"
    except Exception as e:
        return f"获取失败({type(e).__name__})"


def _get_windows_system_proxy() -> str:
    """Windows 下读取系统代理（与浏览器一致），仅当启用且为 127.0.0.1 时返回。"""
    if os.name != "nt":
        return ""
    try:
        import winreg
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Internet Settings",
            0,
            winreg.KEY_READ,
        )
        try:
            enable, _ = winreg.QueryValueEx(key, "ProxyEnable")
            if not enable:
                return ""
            server, _ = winreg.QueryValueEx(key, "ProxyServer")
            if not server or "127.0.0.1" not in server and "localhost" not in server:
                return ""
            if "://" not in server:
                server = "http://" + server
            return server.strip()
        finally:
            winreg.CloseKey(key)
    except Exception:
        return ""


def _gemini_rest_sync(
    prompt: str,
    api_key: str,
    model: str,
    temperature: float,
    max_tokens: int,
    proxy_url: str,
) -> str:
    """同步 httpx 经代理请求 Gemini REST。SOCKS5 连接失败时自动用同端口 http 再试（部分代理同端口兼容）。"""
    import httpx

    model_id = (model or "gemini-1.5-flash").strip()
    url = f"{GEMINI_REST_BASE}/models/{model_id}:generateContent"
    headers = {"x-goog-api-key": api_key, "Content-Type": "application/json"}
    generation_config: dict[str, Any] = {
        "temperature": temperature,
        "maxOutputTokens": max_tokens,
    }
    if model_id.startswith("gemini-3"):
        generation_config["thinkingConfig"] = {"thinkingLevel": "low"}
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": generation_config,
    }

    def _do_request(proxy: str | None) -> httpx.Response:
        with httpx.Client(proxy=proxy or None, timeout=120.0, trust_env=True) as client:
            return client.post(url, headers=headers, json=body)

    proxy_to_use: str | None = proxy_url.strip() or None
    resp: httpx.Response | None = None
    for attempt in range(2):
        try:
            resp = _do_request(proxy_to_use)
            break
        except Exception as e:
            err_lower = str(e).lower()
            if attempt == 0 and proxy_to_use and proxy_to_use.startswith("socks5://"):
                if "socks" in err_lower or "proxy" in err_lower or "connect" in err_lower:
                    try:
                        import re
                        m = re.match(r"socks5://([^:/]+):?(\d+)?", proxy_to_use)
                        if m:
                            host, port = m.group(1), m.group(2) or "7897"
                            proxy_to_use = f"http://{host}:{port}"
                            logger.info("SOCKS5 代理连接异常，改用同端口 HTTP 重试: %s", proxy_to_use)
                            continue
                    except Exception:
                        pass
            raise
    if resp is None:
        raise RuntimeError("Gemini 请求未返回响应")

    if resp.status_code != 200:
        err_body = resp.text[:400] if resp.text else ""
        if "User location is not supported" in err_body or "FAILED_PRECONDITION" in err_body:
            raise ValueError(
                "Gemini 接口返回：当前地区不可用（User location is not supported）。"
                "请确认：(1) 代理已开启且 .env 中 LLM_HTTPS_PROXY 端口正确；(2) 代理出口在支持地区（如美/日）。"
            )
        resp.raise_for_status()
    data = resp.json()
    candidates = data.get("candidates") or []
    if not candidates:
        raise ValueError("Gemini 返回无 candidates")
    parts = (candidates[0].get("content") or {}).get("parts") or []
    if not parts:
        raise ValueError("Gemini 返回无 content.parts")
    text = (parts[0].get("text") or "").strip()
    if not text:
        raise ValueError("Gemini 返回空 text")
    return text


def _gemini_proxy_from_env() -> str:
    """从环境变量读取代理 URL，供同步 Gemini 请求使用。"""
    return (os.getenv("LLM_HTTPS_PROXY") or os.getenv("HTTPS_PROXY") or "").strip()


def _resolve_gemini_proxy() -> str:
    """统一解析 Gemini 代理：优先环境变量，为空时在 Windows 下尝试系统代理（与浏览器一致）。"""
    p = _gemini_proxy_from_env()
    if p:
        return p
    if os.name == "nt":
        p = _get_windows_system_proxy()
        if p:
            logger.info("使用 Windows 系统代理作为 Gemini 代理: %s", p[:50])
            return p
    return ""


def gemini_rest_text_sync(
    prompt: str,
    api_key: str,
    model: str,
    temperature: float = 0.2,
    max_tokens: int = 4096,
) -> str:
    """
    同步调用 Gemini REST 文本生成（试卷解析等）。
    代理从环境变量 LLM_HTTPS_PROXY / HTTPS_PROXY 读取。
    """
    proxy_url = _resolve_gemini_proxy()
    return _gemini_rest_sync(prompt, api_key, model, temperature, max_tokens, proxy_url)


def gemini_rest_vision_sync(
    prompt: str,
    image_base64: str,
    api_key: str,
    model: str,
    mime_type: str = "image/png",
    temperature: float = 0.2,
    max_tokens: int = 4096,
) -> str:
    """
    同步调用 Gemini REST 多模态（文本 + 单图），返回模型生成的文本。
    用于按页识图解析试卷。代理从环境变量读取。
    """
    import httpx

    model_id = (model or "gemini-1.5-flash").strip()
    url = f"{GEMINI_REST_BASE}/models/{model_id}:generateContent"
    headers = {"x-goog-api-key": api_key, "Content-Type": "application/json"}
    generation_config: dict[str, Any] = {
        "temperature": temperature,
        "maxOutputTokens": max_tokens,
    }
    if model_id.startswith("gemini-3"):
        generation_config["thinkingConfig"] = {"thinkingLevel": "low"}
    body = {
        "contents": [{
            "parts": [
                {"text": prompt},
                {"inlineData": {"mimeType": mime_type, "data": image_base64}},
            ],
        }],
        "generationConfig": generation_config,
    }
    proxy_url = _resolve_gemini_proxy()
    with httpx.Client(proxy=proxy_url or None, timeout=120.0, trust_env=True) as client:
        resp = client.post(url, headers=headers, json=body)
        if resp.status_code != 200:
            err_body = resp.text[:400] if resp.text else ""
            if "User location is not supported" in err_body or "FAILED_PRECONDITION" in err_body:
                raise ValueError(
                    "Gemini 接口返回：当前地区不可用（User location is not supported）。"
                    "建议：在前端「设置」中切换为「OpenRouter」使用 Gemini 模型，可免代理、无地区限制；或配置 .env 中 LLM_HTTPS_PROXY。"
                )
            resp.raise_for_status()
        data = resp.json()
    candidates = data.get("candidates") or []
    if not candidates:
        raise ValueError("Gemini 返回无 candidates")
    parts_out = (candidates[0].get("content") or {}).get("parts") or []
    if not parts_out:
        raise ValueError("Gemini 返回无 content.parts")
    text = (parts_out[0].get("text") or "").strip()
    if not text:
        raise ValueError("Gemini 返回空 text")
    return text


async def _gemini_rest_with_proxy(
    prompt: str,
    api_key: str,
    model: str,
    temperature: float,
    max_tokens: int,
    proxy_url: str,
) -> str:
    """在线程中跑同步 REST 请求；若仍报地区限制，Windows 下再试一次系统代理（可能与浏览器一致）。"""
    if not proxy_url:
        proxy_url = _resolve_gemini_proxy()
    try:
        return await asyncio.to_thread(
            _gemini_rest_sync, prompt, api_key, model, temperature, max_tokens, proxy_url
        )
    except ValueError as e:
        err_msg = str(e)
        if "User location" in err_msg or "地区不可用" in err_msg:
            sys_proxy = _get_windows_system_proxy()
            if sys_proxy and sys_proxy != proxy_url:
                logger.warning("Env 代理仍被判定为不可用地区，尝试 Windows 系统代理: %s", sys_proxy[:50])
                try:
                    return await asyncio.to_thread(
                        _gemini_rest_sync, prompt, api_key, model, temperature, max_tokens, sys_proxy
                    )
                except ValueError:
                    pass
            # 诊断：当前代理出口 IP（若为美国仍报错，多半是 API Key/账号地区受限）
            exit_ip = await asyncio.to_thread(_get_proxy_exit_ip_sync, proxy_url)
            logger.warning("Gemini 地区限制诊断 - 当前代理出口 IP: %s", exit_ip)
            raise ValueError(
                "Gemini 接口返回：当前地区不可用（User location is not supported）。"
                f"当前代理出口 IP: {exit_ip}。"
                "若您已选美国节点仍报错，多半是 Gemini API Key 或 Google 账号所在地区受限（与请求 IP 无关）。"
                "建议：在前端「设置」中切换为「OpenRouter」，选择 google/gemini-2.5-flash 等模型，在 openrouter.ai 申请 Key 即可免代理、无地区限制；"
                "或用支持地区的账号在 aistudio.google.com 重新申请官方 Key。"
            ) from e
        raise
# 并发生成时提高 temperature 保证多样性（0.7–0.9）
PARALLEL_TEMPERATURE = 0.8
# LLM 单次请求超时（秒），试卷/多题生成时建议 120+ 避免长输出超时
LLM_REQUEST_TIMEOUT = 120


def _get_message_content_safe(msg: Any) -> Any:
    """
    从 LangChain message 安全提取 content，避免访问 msg.content 时触发 KeyError('"questions"' 等)。
    优先从 __dict__、response_metadata、choices[0].message.content 取，最后才尝试 msg.content。
    """
    # 1) 直接从 __dict__ 取，不触发 property（避免 DeepSeek/JSON 模式下 content 属性内部 KeyError）
    d = getattr(msg, "__dict__", None) or {}
    out = d.get("content")
    if out is not None:
        return out
    # 2) response_metadata 直接 content/body
    rm = getattr(msg, "response_metadata", None) or {}
    if isinstance(rm, dict):
        out = rm.get("content") or rm.get("body")
        if out is not None:
            return out
        # 3) OpenAI/DeepSeek 格式：response_metadata.body.choices[0].message.content
        body = rm.get("body")
        if isinstance(body, dict):
            choices = body.get("choices")
            if isinstance(choices, list) and choices:
                msg_obj = choices[0].get("message") if isinstance(choices[0], dict) else None
                if isinstance(msg_obj, dict):
                    out = msg_obj.get("content")
                    if out is not None:
                        return out
    # 4) additional_kwargs
    extra = getattr(msg, "additional_kwargs", None) or {}
    out = extra.get("content") if isinstance(extra, dict) else None
    if out is not None:
        return out
    # 5) 最后才访问 msg.content（可能触发 KeyError）
    try:
        return getattr(msg, "content", None)
    except KeyError:
        return None


def _fallback_content_from_message(msg: Any) -> str:
    """当 msg.content 触发 KeyError（如 '"questions"'）时，从备用来源取 content 字符串。"""
    out = _get_message_content_safe(msg)
    if isinstance(out, str):
        return out
    if isinstance(out, (dict, list)):
        try:
            return json.dumps(out, ensure_ascii=False)
        except (TypeError, ValueError):
            pass
    return str(msg)


def _normalize_llm_output(out: Any) -> str:
    """将 LLM 返回的 content 统一为 str（部分 API/JSON mode 返回 list、dict 或 chunk 列表）。"""
    if out is None:
        return ""
    if isinstance(out, str):
        return out
    if isinstance(out, dict):
        # JSON mode 下部分 API 可能直接返回已解析的 dict（如 {"questions": [...]}），需序列化回字符串供 _parse_questions 解析
        try:
            return json.dumps(out, ensure_ascii=False)
        except (TypeError, ValueError):
            return str(out)
    if isinstance(out, list):
        parts = []
        for x in out:
            if isinstance(x, str):
                parts.append(x)
            elif isinstance(x, dict):
                # 兼容 content 块为 {"text": "..."} 或 {"content": {...}}（已解析 JSON），优先用 .get 避免 KeyError
                raw = x.get("text") or x.get("content")
                parts.append(_normalize_llm_output(raw))
            elif hasattr(x, "content"):
                try:
                    raw = getattr(x, "content", None)
                    try:
                        parts.append(_normalize_llm_output(raw))
                    except KeyError:
                        parts.append(str(raw) if raw is not None else "")
                except KeyError:
                    # 部分 API（如 DeepSeek）content 块访问时触发 KeyError('"questions"' 等)，从 __dict__ 取 content
                    raw = getattr(x, "__dict__", {}).get("content") if hasattr(x, "__dict__") else None
                    try:
                        parts.append(_normalize_llm_output(raw))
                    except KeyError:
                        parts.append(str(raw) if raw is not None else "")
            else:
                parts.append(str(x))
        return "".join(parts) if parts else ""
    return str(out)


def _strip_json_markdown(text: str) -> str:
    """去掉 Markdown 的 ```json 标记，返回纯 JSON 字符串。"""
    if not text:
        return ""
    text = text.strip().lstrip("\ufeff")  # BOM
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if match:
        return match.group(1).strip()
    # 响应以 ```json 开头但被截断（无结尾 ```）时，仅去掉开头标记
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*\n?", "", text, count=1).strip()
    # 若首行是 ``` 开头（含空格），去掉该行
    if text.startswith("`"):
        first_line, _, rest = text.partition("\n")
        if first_line.strip().startswith("```"):
            text = rest.strip()
    return text


def _fix_json_invalid_escapes(text: str) -> str:
    """
    修复 JSON 中非法反斜杠转义（如 LaTeX 的 \\frac、\\circ、\\sqrt 被模型输出成单反斜杠）。
    JSON 仅允许 \\ \" \\/ \\b \\f \\n \\r \\t \\uXXXX，其余 \\ 需写成 \\\\。
    逐字符处理，避免漏掉 \\t 被误当合法（LaTeX 里 \\triangle 的 t 应和 \\ 一起转义）。
    """
    if not text:
        return text
    result: list[str] = []
    i = 0
    while i < len(text):
        c = text[i]
        if c != "\\":
            result.append(c)
            i += 1
            continue
        # 当前是反斜杠，看下一个字符
        if i + 1 >= len(text):
            result.append("\\\\")
            i += 1
            continue
        next_c = text[i + 1]
        # \t \f \n \r 后跟字母时为 LaTeX 命令（如 \triangle、\frac、\neg、\rightarrow），需写成 \\+ 该字符，否则 JSON 会当成转义变成「riangle」「rac」等
        if next_c in "tfnr" and i + 2 < len(text) and text[i + 2].isalpha():
            result.append("\\\\")
            result.append(next_c)
            i += 2
            continue
        # 合法 JSON 转义: " \ / b f n r t（非 LaTeX 的保持原样）
        if next_c in '"\\/bfnrt':
            result.append(c)
            result.append(next_c)
            i += 2
            continue
        # \uXXXX
        if next_c == "u" and i + 5 <= len(text) and re.match(r"[0-9a-fA-F]{4}", text[i + 2 : i + 6]):
            result.append(c)
            result.append(next_c)
            result.append(text[i + 2 : i + 6])
            i += 6
            continue
        # 非法转义（如 LaTeX \circ \sqrt \triangle），写成 \\ + 该字符
        result.append("\\\\")
        result.append(next_c)
        i += 2
    return "".join(result)


def _log_raw_on_parse_fail(raw: str, err: json.JSONDecodeError) -> None:
    """解析失败时在日志中输出 AI 返回内容的前缀，便于排查。"""
    prefix = (raw or "")[:500].replace("\r\n", "\n")
    logger.warning(
        "AI 返回内容解析失败 %s，内容前缀（前 500 字）: %s",
        err,
        prefix if prefix else "(空)",
    )


def _escape_literal_newlines_in_json(text: str) -> str:
    """
    将 JSON 字符串值内的字面换行（未转义的 \\n）转为 \\n，避免 Unterminated string。
    按双引号与反斜杠跟踪「是否在字符串内」与转义状态，仅在字符串内替换 \\n/\\r。
    """
    if not text:
        return text
    result: list[str] = []
    in_string = False
    escape = False
    i = 0
    while i < len(text):
        c = text[i]
        if escape:
            escape = False
            result.append(c)
            i += 1
            continue
        if c == "\\" and in_string:
            escape = True
            result.append(c)
            i += 1
            continue
        if c == '"':
            in_string = not in_string
            result.append(c)
            i += 1
            continue
        if in_string:
            if c == "\n":
                result.append("\\n")
                i += 1
                continue
            if c == "\r":
                result.append("\\r")
                i += 1
                continue
        result.append(c)
        i += 1
    return "".join(result)


def _try_repair_truncated_json(text: str) -> str | None:
    """
    当 JSON 在字符串中间被截断时，尝试补全闭合符再解析。
    常见情况：analysis 字段未写完，补 \"}]} 可闭合当前字符串、当前对象、数组和根对象。
    若末尾是反斜杠（未完成转义），先去掉再补闭合。
    """
    if not text or not text.strip().startswith("{"):
        return None
    t = text.rstrip()
    if t.endswith("}"):
        return None  # 已完整
    # 末尾若为单个反斜杠会导致 Unterminated string，先去掉
    while t.endswith("\\") and not t.endswith("\\\\"):
        t = t[:-1].rstrip()
    repaired = t + '"}]}'
    try:
        json.loads(repaired)
        return repaired
    except json.JSONDecodeError:
        pass
    repaired2 = t + '"}}]}'
    try:
        json.loads(repaired2)
        return repaired2
    except json.JSONDecodeError:
        return None


def _try_repair_single_json_object(text: str) -> str | None:
    """
    当单题 JSON 对象在字符串中间被截断时，尝试补全闭合符。
    用于题目校对等返回单个 {...} 的场景。
    """
    if not text or not text.strip().startswith("{"):
        return None
    t = text.rstrip()
    if t.endswith("}"):
        return None
    while t.endswith("\\") and not t.endswith("\\\\"):
        t = t[:-1].rstrip()
    for suffix in ('"}', '"', '}'):
        try:
            if json.loads(t + suffix):
                return t + suffix
        except json.JSONDecodeError:
            continue
    return None


def _extract_questions_from_truncated(raw: str) -> list[QuestionItem]:
    """
    当完整 JSON 解析失败（如 Unterminated string）时，从截断内容中逐段提取完整题目对象。
    在 "questions": [ 后按大括号匹配提取每个完整的 {...}，解析为 QuestionItem，返回能解析出的列表。
    """
    if not raw or not raw.strip():
        return []
    cleaned = _strip_json_markdown(raw)
    if not cleaned:
        cleaned = raw
    # 定位 "questions": [ 后的数组起始
    qkey = '"questions"'
    idx = cleaned.find(qkey)
    if idx == -1:
        idx = cleaned.find("questions")
        if idx == -1:
            return []
    bracket = cleaned.find("[", idx)
    if bracket == -1:
        return []
    start = bracket + 1
    result: list[QuestionItem] = []
    pos = start
    while pos < len(cleaned):
        # 跳过空白和逗号
        while pos < len(cleaned) and cleaned[pos] in " \t\n\r,":
            pos += 1
        if pos >= len(cleaned):
            break
        if cleaned[pos] != "{":
            break
        obj_start = pos
        depth = 0
        in_string = False
        escape = False
        i = obj_start
        while i < len(cleaned):
            c = cleaned[i]
            if escape:
                escape = False
                i += 1
                continue
            if c == "\\" and in_string:
                escape = True
                i += 1
                continue
            if c == '"' and not escape:
                in_string = not in_string
                i += 1
                continue
            if not in_string:
                if c == "{":
                    depth += 1
                elif c == "}":
                    depth -= 1
                    if depth == 0:
                        chunk = cleaned[obj_start : i + 1]
                        fixed = _fix_json_invalid_escapes(chunk)
                        try:
                            item = json.loads(fixed)
                            if isinstance(item, dict) and (item.get("content") or item.get("body") is not None):
                                opts = item.get("options") if isinstance(item.get("options"), list) else []
                                ans = str(item.get("answer", ""))
                                result.append(
                                    QuestionItem(
                                        content=item.get("content") or item.get("body", ""),
                                        options=opts,
                                        answer=ans,
                                        analysis=item.get("analysis", "") or "",
                                        design_logic=item.get("design_logic"),
                                        type_tag=item.get("type_tag"),
                                        question_type=_resolve_question_type(item, opts, ans),
                                    )
                                )
                        except (json.JSONDecodeError, TypeError, KeyError):
                            pass
                        pos = i + 1
                        break
            i += 1
        else:
            break
    return result


def _extract_first_json_object(text: str) -> str:
    """
    从文本中提取第一个完整的 JSON 对象 {...}。
    用于模型在 JSON 前输出了说明、思考过程等文字的情况。
    按大括号匹配，忽略字符串内的 { }。
    """
    if not text or not text.strip():
        return ""
    start = text.find("{")
    if start == -1:
        return ""
    depth = 0
    in_string = False
    escape = False
    i = start
    while i < len(text):
        c = text[i]
        if escape:
            escape = False
            i += 1
            continue
        if c == "\\" and in_string:
            escape = True
            i += 1
            continue
        if c == '"' and not escape:
            in_string = not in_string
            i += 1
            continue
        if not in_string:
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    return text[start : i + 1]
        i += 1
    return ""


def _extract_first_json_array(text: str) -> str:
    """
    从文本中提取第一个完整的 JSON 数组 [...]。
    用于参考题场景下模型直接返回 [{...}, {...}] 且前面有说明文字的情况。
    """
    if not text or not text.strip():
        return ""
    start = text.find("[")
    if start == -1:
        return ""
    depth = 0
    in_string = False
    escape = False
    i = start
    while i < len(text):
        c = text[i]
        if escape:
            escape = False
            i += 1
            continue
        if c == "\\" and in_string:
            escape = True
            i += 1
            continue
        if c == '"' and not escape:
            in_string = not in_string
            i += 1
            continue
        if not in_string:
            if c == "[":
                depth += 1
            elif c == "]":
                depth -= 1
                if depth == 0:
                    return text[start : i + 1]
        i += 1
    return ""


def _call_llm(prompt: str, llm_config: Any, *, temperature: float = 0.3) -> str:
    """
    同步调用 LLM（保留用于单次重试等）。
    按 llm_config 动态实例化客户端并 invoke。
    """
    if not (llm_config.api_key or "").strip():
        raise ValueError("未配置 API Key，请在「设置」中填写或于 .env 中设置 LLM_API_KEY")

    provider = (llm_config.provider or "gemini").strip().lower()
    api_key = (llm_config.api_key or "").strip()
    base_url = (llm_config.base_url or "").strip()
    model = (llm_config.model or "").strip()

    last_error: Exception | None = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            if provider == "gemini":
                from langchain_google_genai import ChatGoogleGenerativeAI

                gemini_kwargs: dict[str, Any] = {
                    "model": model or "gemini-1.5-flash",
                    "api_key": api_key,
                    "temperature": temperature,
                    "max_output_tokens": 8192,
                }
                _proxy = _resolve_gemini_proxy()
                if _proxy:
                    gemini_kwargs["client_args"] = {"proxy": _proxy}
                llm = ChatGoogleGenerativeAI(**gemini_kwargs)
                msg = llm.invoke(prompt)
                out = _get_message_content_safe(msg)
                if out is None:
                    out = str(msg)
                try:
                    return _normalize_llm_output(out)
                except KeyError:
                    out = _fallback_content_from_message(msg)
                    try:
                        return _normalize_llm_output(out)
                    except KeyError:
                        return str(msg) if out is None else (json.dumps(out, ensure_ascii=False) if isinstance(out, (dict, list)) else str(out))

            try:
                from langchain_openai import ChatOpenAI
            except ImportError as e:
                raise ValueError(
                    "当前环境未安装 langchain-openai，请执行: pip install langchain-openai"
                ) from e

            # DeepSeek-V3 推荐 temperature=1.0；JSON Mode 与部分 DeepSeek 兼容层冲突，暂对 DeepSeek 关闭
            is_deepseek = base_url and "deepseek" in base_url.lower()
            eff_temp = 1.0 if is_deepseek else temperature
            kwargs = {
                "api_key": api_key,
                "model": model or "gpt-4o-mini",
                "temperature": eff_temp,
                "max_tokens": 8192,
                "request_timeout": 120,
            }
            if not is_deepseek:
                kwargs["model_kwargs"] = {"response_format": {"type": "json_object"}}
            if base_url:
                kwargs["base_url"] = base_url.rstrip("/")
            llm = ChatOpenAI(**kwargs)
            msg = llm.invoke(prompt)
            out = _get_message_content_safe(msg)
            if out is None:
                out = str(msg)
            try:
                return _normalize_llm_output(out)
            except KeyError:
                out = _fallback_content_from_message(msg)
                try:
                    return _normalize_llm_output(out)
                except KeyError:
                    return str(msg) if out is None else (json.dumps(out, ensure_ascii=False) if isinstance(out, (dict, list)) else str(out))
        except ValueError:
            raise
        except Exception as e:
            last_error = e
            logger.warning("LLM 调用第 %s 次失败: %s", attempt + 1, type(e).__name__)
    err_msg = getattr(last_error, "message", None) or str(last_error or "")
    if "api_key" in err_msg.lower() or "auth" in err_msg.lower():
        raise ValueError("API Key 无效或已过期，请检查设置中的 API Key")
    raise ValueError(f"LLM 调用失败，请检查 Base URL、模型与网络：{err_msg[:200]}")


async def _call_llm_async(
    prompt: str,
    llm_config: Any,
    *,
    temperature: float = 0.3,
    max_tokens: int = 8192,
) -> str:
    """
    异步调用 LLM，用于并发生成。
    优先使用 ainvoke；若无 ainvoke 则在线程中执行同步 invoke，避免阻塞。
    max_tokens：试卷生成时建议 16384 以减少截断。
    """
    if not (llm_config.api_key or "").strip():
        raise ValueError("未配置 API Key，请在「设置」中填写或于 .env 中设置 LLM_API_KEY")

    provider = (llm_config.provider or "gemini").strip().lower()
    api_key = (llm_config.api_key or "").strip()
    base_url = (llm_config.base_url or "").strip()
    model = (llm_config.model or "").strip()

    last_error: Exception | None = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            if provider == "gemini":
                _proxy_async = _resolve_gemini_proxy()
                if _proxy_async:
                    # 有代理时用自有 httpx 直连 REST API，保证请求一定走代理（SDK 异步走 aiohttp 不走 proxy）
                    out = await _gemini_rest_with_proxy(
                        prompt, api_key, model or "gemini-1.5-flash", temperature, max_tokens, _proxy_async
                    )
                    try:
                        return _normalize_llm_output(out)
                    except KeyError:
                        return out
                from langchain_google_genai import ChatGoogleGenerativeAI

                gemini_kwargs_async: dict[str, Any] = {
                    "model": model or "gemini-1.5-flash",
                    "api_key": api_key,
                    "temperature": temperature,
                    "max_output_tokens": max_tokens,
                }
                llm = ChatGoogleGenerativeAI(**gemini_kwargs_async)
                try:
                    if hasattr(llm, "ainvoke"):
                        msg = await llm.ainvoke(prompt)
                    else:
                        msg = await asyncio.to_thread(llm.invoke, prompt)
                    out = _get_message_content_safe(msg)
                    if out is None:
                        out = str(msg)
                    try:
                        return _normalize_llm_output(out)
                    except KeyError:
                        out = _fallback_content_from_message(msg)
                        try:
                            return _normalize_llm_output(out)
                        except KeyError:
                            return str(msg) if out is None else (json.dumps(out, ensure_ascii=False) if isinstance(out, (dict, list)) else str(out))
                except KeyError:
                    logger.warning("LLM 返回解析 KeyError（Gemini），返回空题目列表")
                    return '{"questions":[]}'

            try:
                from langchain_openai import ChatOpenAI
            except ImportError as e:
                raise ValueError(
                    "当前环境未安装 langchain-openai，请执行: pip install langchain-openai"
                ) from e

            # DeepSeek-V3 推荐 temperature=1.0；JSON Mode 与部分 DeepSeek 兼容层冲突导致返回异常，暂对 DeepSeek 关闭
            is_deepseek = base_url and "deepseek" in base_url.lower()
            eff_temp = 1.0 if is_deepseek else temperature
            kwargs = {
                "api_key": api_key,
                "model": model or "gpt-4o-mini",
                "temperature": eff_temp,
                "max_tokens": max_tokens,
                "request_timeout": 120,
            }
            # 仅对非 DeepSeek 开启 JSON Mode，避免 response_format 导致 content 解析异常（如 KeyError('questions')）
            if not is_deepseek:
                kwargs["model_kwargs"] = {"response_format": {"type": "json_object"}}
            if base_url:
                kwargs["base_url"] = base_url.rstrip("/")
            llm = ChatOpenAI(**kwargs)
            try:
                if hasattr(llm, "ainvoke"):
                    msg = await llm.ainvoke(prompt)
                else:
                    msg = await asyncio.to_thread(llm.invoke, prompt)
                out = _get_message_content_safe(msg)
                if out is None:
                    out = str(msg)
                try:
                    return _normalize_llm_output(out)
                except KeyError:
                    out = _fallback_content_from_message(msg)
                    try:
                        return _normalize_llm_output(out)
                    except KeyError:
                        return str(msg) if out is None else (json.dumps(out, ensure_ascii=False) if isinstance(out, (dict, list)) else str(out))
            except KeyError:
                logger.warning("LLM 返回解析 KeyError（OpenAI/DeepSeek），返回空题目列表")
                return '{"questions":[]}'
        except ValueError:
            raise
        except Exception as e:
            last_error = e
            exc_name = type(e).__name__
            if exc_name == "AuthenticationError":
                logger.warning(
                    "LLM 异步调用第 %s 次失败: 认证失败，请检查「设置」中的 API Key 与 Base URL 是否正确",
                    attempt + 1,
                )
            else:
                logger.warning("LLM 异步调用第 %s 次失败: %s", attempt + 1, exc_name)
    err_msg = getattr(last_error, "message", None) or str(last_error or "")
    is_auth_error = (
        type(last_error).__name__ == "AuthenticationError"
        or "api_key" in err_msg.lower()
        or "auth" in err_msg.lower()
        or "401" in err_msg
    )
    if is_auth_error:
        raise ValueError(
            "API Key 无效或认证失败。请在前端「设置」中核对 API Key、Base URL（如 DeepSeek 为 https://api.deepseek.com），保存后重试。"
        )
    raise ValueError(f"LLM 调用失败，请检查 Base URL、模型与网络：{err_msg[:200]}")


def _build_chat_messages(
    messages: list[dict],
    system_prompt: str | None,
) -> list[Any]:
    """将 [{ role, content }] 与可选的 system_prompt 转为 LangChain 消息列表。"""
    from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

    out: list[Any] = []
    if system_prompt and system_prompt.strip():
        out.append(SystemMessage(content=system_prompt.strip()))
    for m in messages:
        role = (m.get("role") or "user").strip().lower()
        content = (m.get("content") or "").strip()
        if role == "assistant":
            out.append(AIMessage(content=content))
        else:
            out.append(HumanMessage(content=content))
    return out


async def chat_completion_async(
    messages: list[dict],
    system_prompt: str | None,
    llm_config: Any,
    *,
    temperature: float = 0.5,
    max_tokens: int = 4096,
) -> str:
    """
    AI 对话：多轮消息 + 可选系统提示，返回助手回复文本。
    不启用 JSON Mode，适用于自由文本对话。
    """
    if not (llm_config.api_key or "").strip():
        raise ValueError("未配置 API Key，请在「设置」中填写或于 .env 中设置 LLM_API_KEY")

    lc_messages = _build_chat_messages(messages, system_prompt)
    if not lc_messages:
        raise ValueError("对话消息不能为空")

    provider = (llm_config.provider or "gemini").strip().lower()
    api_key = (llm_config.api_key or "").strip()
    base_url = (llm_config.base_url or "").strip()
    model = (llm_config.model or "").strip()
    timeout = getattr(llm_config, "request_timeout", None) or AI_REQUEST_TIMEOUT

    last_error: Exception | None = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            if provider == "gemini":
                _proxy_async = _resolve_gemini_proxy()
                if _proxy_async:
                    # 代理模式下 Gemini REST 只支持单轮，将多轮拼成一条文本
                    parts = []
                    for m in lc_messages:
                        cls_name = type(m).__name__
                        if cls_name == "SystemMessage":
                            parts.append(f"[System]\n{m.content}")
                        elif cls_name == "HumanMessage":
                            parts.append(f"[User]\n{m.content}")
                        elif cls_name == "AIMessage":
                            parts.append(f"[Assistant]\n{m.content}")
                    prompt_text = "\n\n".join(parts)
                    out = await _gemini_rest_with_proxy(
                        prompt_text, api_key, model or "gemini-1.5-flash", temperature, max_tokens, _proxy_async
                    )
                    return (out or "").strip() or "（无回复）"
                from langchain_google_genai import ChatGoogleGenerativeAI

                gemini_kwargs: dict[str, Any] = {
                    "model": model or "gemini-1.5-flash",
                    "api_key": api_key,
                    "temperature": temperature,
                    "max_output_tokens": max_tokens,
                }
                llm = ChatGoogleGenerativeAI(**gemini_kwargs)
                if hasattr(llm, "ainvoke"):
                    msg = await llm.ainvoke(lc_messages)
                else:
                    msg = await asyncio.to_thread(llm.invoke, lc_messages)
                out = _get_message_content_safe(msg)
                return (str(out).strip() if out is not None else "") or "（无回复）"

            try:
                from langchain_openai import ChatOpenAI
            except ImportError as e:
                raise ValueError(
                    "当前环境未安装 langchain-openai，请执行: pip install langchain-openai"
                ) from e

            is_deepseek = base_url and "deepseek" in base_url.lower()
            eff_temp = 1.0 if is_deepseek else temperature
            kwargs: dict[str, Any] = {
                "api_key": api_key,
                "model": model or "gpt-4o-mini",
                "temperature": eff_temp,
                "max_tokens": max_tokens,
                "request_timeout": timeout,
            }
            if base_url:
                kwargs["base_url"] = base_url.rstrip("/")
            llm = ChatOpenAI(**kwargs)
            if hasattr(llm, "ainvoke"):
                msg = await llm.ainvoke(lc_messages)
            else:
                msg = await asyncio.to_thread(llm.invoke, lc_messages)
            out = _get_message_content_safe(msg)
            return (str(out).strip() if out is not None else "") or "（无回复）"
        except ValueError:
            raise
        except Exception as e:
            last_error = e
            logger.warning("chat_completion_async 第 %s 次失败: %s", attempt + 1, type(e).__name__)
    err_msg = getattr(last_error, "message", None) or str(last_error or "")
    if "api_key" in err_msg.lower() or "auth" in err_msg.lower() or "401" in err_msg:
        raise ValueError(
            "API Key 无效或认证失败。请在前端「设置」中核对 API Key 与 Base URL，保存后重试。"
        )
    raise ValueError(f"对话请求失败：{err_msg[:200]}")


async def chat_completion_stream_async(
    messages: list[dict],
    system_prompt: str | None,
    llm_config: Any,
    *,
    temperature: float = 0.5,
    max_tokens: int = 4096,
):
    """
    流式对话：异步生成器，yield 内容片段（仅支持 OpenAI 兼容，Gemini 不流式）。
    """
    if not (llm_config.api_key or "").strip():
        raise ValueError("未配置 API Key，请在「设置」中填写或于 .env 中设置 LLM_API_KEY")

    lc_messages = _build_chat_messages(messages, system_prompt)
    if not lc_messages:
        raise ValueError("对话消息不能为空")

    provider = (llm_config.provider or "gemini").strip().lower()
    api_key = (llm_config.api_key or "").strip()
    base_url = (llm_config.base_url or "").strip()
    model = (llm_config.model or "").strip()
    timeout = getattr(llm_config, "request_timeout", None) or AI_REQUEST_TIMEOUT

    if provider == "gemini":
        content = await chat_completion_async(messages, system_prompt, llm_config)
        yield content
        return

    try:
        from langchain_openai import ChatOpenAI
    except ImportError as e:
        raise ValueError(
            "当前环境未安装 langchain-openai，请执行: pip install langchain-openai"
        ) from e

    is_deepseek = base_url and "deepseek" in base_url.lower()
    eff_temp = 1.0 if is_deepseek else temperature
    kwargs: dict[str, Any] = {
        "api_key": api_key,
        "model": model or "gpt-4o-mini",
        "temperature": eff_temp,
        "max_tokens": max_tokens,
        "request_timeout": timeout,
    }
    if base_url:
        kwargs["base_url"] = base_url.rstrip("/")
    llm = ChatOpenAI(**kwargs)
    if hasattr(llm, "astream"):
        async for chunk in llm.astream(lc_messages):
            part = _get_message_content_safe(chunk)
            if part is not None and str(part).strip():
                yield str(part)
    else:
        msg = await asyncio.to_thread(llm.invoke, lc_messages)
        out = _get_message_content_safe(msg)
        if out:
            yield str(out).strip()


def _parse_questions(raw: str) -> list[QuestionItem]:
    """解析 JSON 字符串为 QuestionItem 列表，失败抛出 ValueError。"""
    if not raw or not (raw and raw.strip()):
        raise ValueError(
            "AI 未返回有效内容（可能为空），请检查 API Key、模型与网络后重试。"
        )
    # 先对整段返回做非法转义修复（LaTeX \\circ \\sqrt 等），再剥离与解析
    raw = _fix_json_invalid_escapes(raw)
    cleaned = _strip_json_markdown(raw)
    if not cleaned:
        raise ValueError(
            "AI 未返回有效内容（可能为空），请检查 API Key、模型与网络后重试。"
        )
    # 若剥离 markdown 后既不是 { 也不是 [ 开头，说明前面有说明/思考文字，尝试提取
    lstrip = cleaned.lstrip()
    if not lstrip.startswith("{") and not lstrip.startswith("["):
        extracted = _extract_first_json_object(raw)
        if extracted:
            cleaned = extracted
        else:
            extracted = _extract_first_json_array(raw)
            if extracted:
                cleaned = extracted
    cleaned = _fix_json_invalid_escapes(cleaned)
    data = None
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as e:
        # 首次解析失败时，再尝试：提取对象或数组、截断修复
        extracted = _extract_first_json_object(raw)
        if extracted:
            extracted_cleaned = _fix_json_invalid_escapes(extracted)
            try:
                data = json.loads(extracted_cleaned)
            except json.JSONDecodeError:
                pass
        if data is None:
            extracted = _extract_first_json_array(raw)
            if extracted:
                extracted_cleaned = _fix_json_invalid_escapes(extracted)
                try:
                    data = json.loads(extracted_cleaned)
                except json.JSONDecodeError:
                    pass
        if data is None:
            repaired = _try_repair_truncated_json(cleaned)
            if repaired:
                try:
                    data = json.loads(repaired)
                except json.JSONDecodeError:
                    pass
        if data is None:
            partial = _extract_questions_from_truncated(raw)
            if partial:
                logger.warning(
                    "JSON 解析失败，从截断内容中解析出 %s 道题（部分结果）。错误: %s",
                    len(partial),
                    e,
                )
                return partial
            _log_raw_on_parse_fail(raw, e)
            if "Expecting value" in str(e):
                raise ValueError(
                    "AI 返回内容为空、未包含完整 JSON 或被截断。若使用 DeepSeek-R1（会先输出思考），请改用 DeepSeek-V3（deepseek-chat）；或检查 API 超时与网络。"
                ) from e
            raise ValueError(
                f"AI 返回的不是合法 JSON: {e!s}。请检查 API 配置与模型是否支持出题。"
            ) from e

    # 支持多种格式：根为 list、根为 dict 且含 "questions"、或根为单个题目对象
    if isinstance(data, list):
        questions = data
    elif isinstance(data, dict):
        # 兼容键为 "questions" 或 '"questions"'（部分 API/解析层返回带引号的键名）
        questions = data.get("questions") or data.get('"questions"')
        if questions is None and ("content" in data or "body" in data):
            questions = [data]
    elif isinstance(data, str):
        raise ValueError(
            "AI 返回的 JSON 根节点为字符串，可能被截断或格式不符。请确认 Prompt 要求输出 {\"questions\": [...]} 或 [...]，并检查 API 超时与 max_tokens。"
        )
    else:
        raise ValueError("AI 返回的 JSON 根节点既不是数组也不是对象")

    if not isinstance(questions, list):
        raise ValueError(
            "AI 返回的 JSON 中缺少题目列表（应为 {\"questions\": [...]} 或根节点数组 [...]）。"
        )

    result: list[QuestionItem] = []
    for i, item in enumerate(questions):
        if not isinstance(item, dict):
            logger.warning("跳过非对象题目项 index=%s", i)
            continue
        content = item.get("content") or item.get("body", "")
        options = item.get("options")
        if not isinstance(options, list):
            options = []
        answer_str = str(item.get("answer", ""))
        try:
            result.append(
                QuestionItem(
                    content=content,
                    options=options,
                    answer=answer_str,
                    analysis=item.get("analysis", "") or "",
                    design_logic=item.get("design_logic"),
                    type_tag=item.get("type_tag"),
                    question_type=_resolve_question_type(item, options, answer_str),
                )
            )
        except Exception as e:
            logger.warning("解析题目项 index=%s 失败: %s", i, e)
    return result


def _normalize_question_content_and_options(content: str, options: list) -> tuple[str, list]:
    """
    若 AI 把选项写在题干里（content 含 \\nA. xxx 等），则从 content 中剥离选项并填入 options，
    避免前端只显示 A/B/C/D 而无选项正文。题干仅保留问句部分。
    """
    if not content or not isinstance(content, str):
        return (content or "", options if isinstance(options, list) else [])
    opts = list(options) if isinstance(options, list) else []
    # 已有完整选项正文则不再从 content 里抠
    if opts and any(isinstance(x, str) and len(x.strip()) > 1 for x in opts):
        return (content.strip(), opts)
    # 题干中可能含字面 \\n 或真实换行，统一按换行拆
    text = content.replace("\\n", "\n").strip()
    lines = [s for s in text.split("\n") if s.strip()]
    option_line_re = re.compile(r"^([A-D])\.\s*(.+)$", re.IGNORECASE)
    collected: list[tuple[int, str]] = []  # (letter_index, option_text)
    first_option_i = -1
    for i, line in enumerate(lines):
        m = option_line_re.match(line.strip())
        if m:
            letter = m.group(1).upper()
            idx = ord(letter) - ord("A")
            if 0 <= idx <= 3:
                collected.append((idx, m.group(2).strip()))
                if first_option_i < 0:
                    first_option_i = i
    if first_option_i < 0 or len(collected) < 2:
        return (content.strip(), opts)
    # 按 A/B/C/D 顺序排，题干取选项之前的所有行
    collected.sort(key=lambda x: x[0])
    new_options = [t for _, t in collected]
    stem_lines = lines[:first_option_i]
    new_content = "\n".join(stem_lines).strip() or content.strip()
    return (new_content, new_options)


def _try_repair_sync_tutoring_json(cleaned: str) -> dict[str, Any] | None:
    """
    同步辅导 JSON 截断时尝试补全闭合符再解析。
    先去掉末尾反斜杠，再尝试多种闭合后缀（对应在 knowledge_card/examples/questions 内截断）。
    """
    if not cleaned or not cleaned.strip().startswith("{"):
        return None
    t = cleaned.rstrip()
    if t.endswith("}"):
        return None
    while t.endswith("\\") and not t.endswith("\\\\"):
        t = t[:-1].rstrip()
    for suffix in ('"}]}', '"}}]}', '"]}', '"}}', '"}'):
        try:
            data = json.loads(t + suffix)
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            continue
    repaired = _try_repair_truncated_json(cleaned)
    if repaired:
        try:
            data = json.loads(repaired)
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass
    return None


def _parse_sync_tutoring_response(raw: str) -> dict[str, Any]:
    """
    解析同步辅导 (讲练结合) 返回的 JSON：knowledge_card、examples、questions。
    返回 { "knowledge_card": dict, "examples": list, "questions": list[QuestionItem] }。
    支持：字符串内字面换行转义、末尾反斜杠去除、截断后补全闭合符再解析。
    """
    if not raw or not raw.strip():
        raise ValueError("AI 未返回有效内容，请检查 API 与网络后重试。")
    raw = _fix_json_invalid_escapes(raw)
    cleaned = _strip_json_markdown(raw)
    if not cleaned:
        raise ValueError("AI 未返回有效内容，请检查 API 与网络后重试。")
    cleaned = _escape_literal_newlines_in_json(cleaned)
    lstrip = cleaned.lstrip()
    if not lstrip.startswith("{"):
        extracted = _extract_first_json_object(raw)
        if extracted:
            cleaned = _fix_json_invalid_escapes(extracted)
            cleaned = _escape_literal_newlines_in_json(cleaned)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as e:
        repaired = _try_repair_sync_tutoring_json(cleaned)
        if repaired is not None:
            data = repaired
        else:
            _log_raw_on_parse_fail(raw, e)
            raise ValueError(f"同步辅导返回的不是合法 JSON: {e!s}") from e
    if not isinstance(data, dict):
        raise ValueError("同步辅导返回的根节点必须是对象，包含 knowledge_card、examples、questions。")
    knowledge_card = data.get("knowledge_card")
    if not isinstance(knowledge_card, dict):
        knowledge_card = {"title": "", "summary": "", "key_points": []}
    examples = data.get("examples")
    if not isinstance(examples, list):
        examples = []
    questions_raw = data.get("questions")
    if not isinstance(questions_raw, list):
        questions_raw = []
    questions: list[QuestionItem] = []
    for i, item in enumerate(questions_raw):
        if not isinstance(item, dict):
            continue
        content = item.get("content") or item.get("body", "")
        options = item.get("options")
        if not isinstance(options, list):
            options = []
        content, options = _normalize_question_content_and_options(content, options)
        answer_str = str(item.get("answer", ""))
        try:
            questions.append(
                QuestionItem(
                    content=content,
                    options=options,
                    answer=answer_str,
                    analysis=item.get("analysis", "") or "",
                    design_logic=item.get("design_logic"),
                    type_tag=item.get("type_tag"),
                    question_type=_resolve_question_type(item, options, answer_str),
                )
            )
        except Exception as e:
            logger.warning("同步辅导题目项 index=%s 解析失败: %s", i, e)
    return {
        "knowledge_card": knowledge_card,
        "examples": examples,
        "questions": questions,
    }


def _build_prompt(
    request: GenerateRequest,
    count: int = 1,
    diversity_index: int | None = None,
    knowledge_base_context: str | None = None,
    exam_part: str | None = None,
) -> str:
    """组装单题/多题 Prompt；当 ref_content 存在且 scenario 为 specialized/error_analysis 时使用参考题策略；exam_part 为试卷分块时追加题型硬性约束。"""
    ref_content = (request.ref_content or "").strip()
    scenario = request.scenario or "default"
    kb_prefix = ""
    if knowledge_base_context and knowledge_base_context.strip():
        kb_prefix = f"参考本地知识库内容：\n{knowledge_base_context.strip()}\n\n任务：请基于上述资料生成题目。\n\n"

    # 专项突破：有参考错题则变式生成，无则按知识点强化（避免 KeyError）
    if scenario == "specialized":
        if ref_content:
            # 模式 A：错题变式（原有逻辑）
            base = REF_IGNORE_KNOWLEDGE_POINT + SPECIALIZED_REF_PROMPT.format(
                ref_content=ref_content,
                question_type=request.question_type,
                difficulty=request.difficulty,
                count=count,
            )
            return kb_prefix + base
        # 模式 B：纯知识点强化（如从学情图谱跳转，无 ref_content）
        base_prompt = MATH_GENERATION_PROMPT.format(
            knowledge_point=request.knowledge_point,
            question_type=request.question_type,
            difficulty="L4-L5 (High)",
            count=count,
        )
        final_prompt = (
            "User Intent: Generate intensive reinforcement questions for weak knowledge points. "
            "针对该知识点的重难点和易错点，生成高难度的强化练习题。\n\n" + base_prompt
        )
        if kb_prefix:
            final_prompt = kb_prefix + final_prompt
        return final_prompt
    if ref_content and scenario == "error_analysis":
        base = REF_IGNORE_KNOWLEDGE_POINT + ERROR_ANALYSIS_REF_PROMPT.format(
            ref_content=ref_content,
            question_type=request.question_type,
            difficulty=request.difficulty,
            count=count,
        )
        return kb_prefix + base
    if ref_content and scenario == "error_crusher":
        base = REF_IGNORE_KNOWLEDGE_POINT + ERROR_CRUSHER_REF_PROMPT.format(
            ref_content=ref_content,
            question_type=request.question_type,
            difficulty=request.difficulty,
            count=count,
        )
        return kb_prefix + base

    # 同步辅导 (讲练结合)：知识卡 + 例题 + 练习题
    if scenario == "sync":
        base = SYNC_TUTORING_PROMPT.format(
            knowledge_point=request.knowledge_point,
            count=count,
        )
        final_prompt = kb_prefix + base
        return final_prompt

    # 新生摸底 (Assessment)：强制混合题型，忽略前端 difficulty，使用 ASSESSMENT_PROMPT
    if scenario == "assessment":
        # 强制摸底卷为混合题型，以触发 Prompt 里的 40% 选择 + 30% 填空 + 30% 解答 配比
        q_type = "综合 (混合题型)"
        base = ASSESSMENT_PROMPT.format(
            knowledge_point=request.knowledge_point,
            question_type=q_type,
            count=count,
        )
        final_prompt = kb_prefix + base
        final_prompt = "You are a Diagnostic Exam Generator. Output JSON only.\n" + final_prompt
        return final_prompt

    prompt = MATH_GENERATION_PROMPT.format(
        knowledge_point=request.knowledge_point,
        difficulty=request.difficulty,
        question_type=request.question_type,
        count=count,
    )
    if kb_prefix:
        prompt = kb_prefix + prompt
    scenario_extra = SCENARIO_INSTRUCTIONS.get(scenario, "")
    if scenario_extra:
        prompt = prompt + "\n\n" + scenario_extra
    if diversity_index is not None and diversity_index > 0:
        prompt += f"\n\n（这是第 {diversity_index + 1} 道题，请从不同角度或不同考查点出题，避免与其它题目重复。）"
    if exam_part and exam_part.strip():
        extra = EXAM_PART_INSTRUCTIONS.get(exam_part.strip())
        if extra:
            prompt += "\n\n" + extra
    return prompt


async def _generate_single(
    request: GenerateRequest,
    llm_config: Any,
    index: int,
    *,
    temperature: float = PARALLEL_TEMPERATURE,
    knowledge_base_context: str | None = None,
) -> list[QuestionItem]:
    """
    单题生成：强制 count=1，可选 diversity 提示。
    单题失败时返回空列表，不拖垮整体；内部重试由 _call_llm_async 完成。
    """
    single_request = GenerateRequest(
        knowledge_point=request.knowledge_point,
        difficulty=request.difficulty,
        question_type=request.question_type,
        count=1,
        scenario=request.scenario or "default",
    )
    try:
        prompt = _build_prompt(single_request, count=1, diversity_index=index, knowledge_base_context=knowledge_base_context)
        raw = await _call_llm_async(prompt, llm_config, temperature=temperature)
        parsed = _parse_questions(raw)
        return parsed if parsed else []
    except KeyError as e:
        logger.warning("单题生成 index=%s KeyError（已忽略）: %s", index, e)
        return []
    except Exception as e:
        logger.warning("单题生成 index=%s 失败（已忽略）: %s", index, e)
        return []


def _extract_problem_numbers(text: str) -> set[int]:
    """
    从题干/解析/答案中抽取与「元、件、利润、定价、进价、销量」相关的整数，
    用于轻量级题干-解析一致性检查（方案三选项 B）。
    """
    if not (text or "").strip():
        return set()
    numbers: set[int] = set()
    # 金额/单价：X元、X件
    for m in re.finditer(r"(\d+)\s*元", text):
        numbers.add(int(m.group(1)))
    for m in re.finditer(r"(\d+)\s*件", text):
        numbers.add(int(m.group(1)))
    # 利润、目标：获得X元、利润X元、目标利润X、X元利润
    for m in re.finditer(r"(?:获得|利润|目标利润)[为]?\s*(\d+)", text):
        numbers.add(int(m.group(1)))
    for m in re.finditer(r"(\d+)\s*元\s*(?:的?\s*)?利润", text):
        numbers.add(int(m.group(1)))
    # 进价、定价、销售单价
    for m in re.finditer(r"(?:进价|定价|销售单价|单价)[为]?\s*(\d+)", text):
        numbers.add(int(m.group(1)))
    for m in re.finditer(r"定为\s*(\d+)", text):
        numbers.add(int(m.group(1)))
    return numbers


def _is_likely_content_analysis_mismatch(content: str, analysis: str, answer: str) -> bool:
    """
    轻量级判断：题干与解析/答案中的关键数字是否明显不一致（如题干 480 元，解析里 1120 元、30 元等）。
    用于方案三选项 B：不一致时自动触发校对。
    """
    content = (content or "").strip()
    analysis = (analysis or "").strip()
    answer = (answer or "").strip()
    if not content or (not analysis and not answer):
        return False
    combined = f"{analysis} {answer}"
    nums_content = _extract_problem_numbers(content)
    nums_rest = _extract_problem_numbers(combined)
    # 解析/答案里出现的「问题参数级」数字（≥15 避免步骤编号）且不在题干中的个数
    only_in_rest = {n for n in nums_rest if n >= 15 and n not in nums_content}
    # 题干至少有 2 个参数数字（像应用题），且解析/答案里出现至少 2 个题干没有的「大数」→ 可能换了一套参数
    if len(nums_content) >= 2 and len(only_in_rest) >= 2:
        return True
    return False


def _normalize_verified_question(obj: dict, fallback: dict) -> dict:
    """将校对返回的 JSON 对象规范为前端需要的结构，缺失字段用 fallback 补全。"""
    content = (obj.get("content") if isinstance(obj.get("content"), str) else None) or fallback.get("content", "")
    options = obj.get("options")
    if not isinstance(options, list):
        options = fallback.get("options") if isinstance(fallback.get("options"), list) else []
    answer = (obj.get("answer") if isinstance(obj.get("answer"), str) else None) or fallback.get("answer", "")
    analysis = (obj.get("analysis") if isinstance(obj.get("analysis"), str) else None) or fallback.get("analysis", "")
    out = {
        "content": content,
        "options": options,
        "answer": answer,
        "analysis": analysis,
    }
    for key in ("difficulty", "question_type", "type"):
        if key in obj and obj[key] is not None:
            out[key] = obj[key]
        elif key in fallback and fallback[key] is not None:
            out[key] = fallback[key]
    return out


async def verify_question_async(question: dict, llm_config: Any) -> dict:
    """
    题目校对：调用 LLM 检查并修正单道题目的计算、逻辑、格式与解析。
    入参 question 为题目对象 (content, options, answer, analysis 等)，返回修正后的题目对象 (dict)。
    """
    question_json = json.dumps(question, ensure_ascii=False, indent=2)
    prompt = VERIFY_QUESTION_PROMPT.format(question_json=question_json)
    raw = await _call_llm_async(prompt, llm_config, temperature=0.2)
    cleaned = _strip_json_markdown(raw)
    if not cleaned.strip():
        cleaned = raw
    cleaned = _escape_literal_newlines_in_json(cleaned)
    cleaned = _fix_json_invalid_escapes(cleaned)
    parsed: dict | None = None
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as e:
        _log_raw_on_parse_fail(cleaned, e)
        obj_str = _extract_first_json_object(cleaned)
        if obj_str:
            try:
                parsed = json.loads(obj_str)
            except json.JSONDecodeError:
                pass
        if not parsed:
            repaired = _try_repair_single_json_object(cleaned)
            if repaired:
                try:
                    parsed = json.loads(repaired)
                except json.JSONDecodeError:
                    pass
    if not isinstance(parsed, dict):
        raise ValueError("校对接口返回格式异常，未能解析为题目对象")
    return _normalize_verified_question(parsed, question)


async def _apply_consistency_check_and_verify(
    questions: list[QuestionItem],
    llm_config: Any,
    *,
    concurrency: int = 2,
) -> list[QuestionItem]:
    """
    方案三选项 B：对题目做轻量级题干-解析数字一致性检查；
    若明显不一致则自动调用 verify_question_async 并用校对结果替换该题。
    """
    if not questions:
        return questions
    sem = asyncio.Semaphore(concurrency)

    async def _check_one(index: int, q: QuestionItem) -> tuple[int, QuestionItem]:
        async with sem:
            c = (q.content or "").strip()
            a = (q.analysis or "").strip()
            ans = (q.answer or "").strip()
            if not _is_likely_content_analysis_mismatch(c, a, ans):
                return (index, q)
            q_dict = q.model_dump() if hasattr(q, "model_dump") else dict(q)
            try:
                verified = await verify_question_async(q_dict, llm_config)
                new = QuestionItem(
                    content=verified.get("content") or q.content,
                    options=verified.get("options") if isinstance(verified.get("options"), list) else q.options,
                    answer=verified.get("answer") or q.answer,
                    analysis=verified.get("analysis") or q.analysis,
                    design_logic=q.design_logic,
                    type_tag=verified.get("type") or q.type_tag,
                    question_type=verified.get("question_type") or q.question_type,
                    student_id=q.student_id,
                )
                logger.info("题干-解析一致性检查触发校对并替换第 %s 题", index + 1)
                return (index, new)
            except Exception as e:
                logger.warning("一致性检查后校对第 %s 题失败，保留原题: %s", index + 1, e)
                return (index, q)

    tasks = [_check_one(i, q) for i, q in enumerate(questions)]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    out: list[QuestionItem] = list(questions)
    for r in results:
        if isinstance(r, Exception):
            logger.warning("一致性检查任务异常: %s", r)
            continue
        idx, item = r
        if 0 <= idx < len(out):
            out[idx] = item
    return out


async def generate_analysis_for_questions_async(
    questions: list[dict],
    llm_config: Any,
    *,
    concurrency: int = 3,
) -> list[dict]:
    """
    为导入的题目列表逐题生成解析（analysis）。
    仅根据题目内容调用 LLM，**不使用知识库/RAG**；并发数由 concurrency 限制。
    解析失败则保留原题（含原有 analysis）。返回与输入同序的题目列表，仅 analysis 字段可能被更新。
    """
    if not questions:
        return []

    sem = asyncio.Semaphore(concurrency)

    async def _generate_one(index: int, q: dict) -> tuple[int, str | None]:
        async with sem:
            payload = {
                "content": (q.get("content") or "").strip(),
                "options": q.get("options") if isinstance(q.get("options"), list) else [],
                "answer": (q.get("answer") or "").strip(),
            }
            question_json = json.dumps(payload, ensure_ascii=False, indent=2)
            prompt = GENERATE_ANALYSIS_PROMPT.format(question_json=question_json)
            raw = await _call_llm_async(prompt, llm_config, temperature=0.2, max_tokens=4096)
            cleaned = _strip_json_markdown(raw)
            if not cleaned.strip():
                cleaned = raw
            cleaned = _escape_literal_newlines_in_json(cleaned)
            cleaned = _fix_json_invalid_escapes(cleaned)
            parsed: dict | None = None
            try:
                parsed = json.loads(cleaned)
            except json.JSONDecodeError:
                obj_str = _extract_first_json_object(cleaned)
                if obj_str:
                    try:
                        parsed = json.loads(obj_str)
                    except json.JSONDecodeError:
                        pass
            if isinstance(parsed, dict) and isinstance(parsed.get("analysis"), str):
                return (index, (parsed.get("analysis") or "").strip())
        return (index, None)

    tasks = [_generate_one(i, q) for i, q in enumerate(questions)]
    outcomes = await asyncio.gather(*tasks, return_exceptions=True)

    result = [dict(q) for q in questions]
    for out in outcomes:
        if isinstance(out, Exception):
            logger.warning("生成解析时出错: %s", out, exc_info=True)
            continue
        idx, analysis_text = out
        if idx is not None and analysis_text is not None and 0 <= idx < len(result):
            result[idx]["analysis"] = analysis_text
    return result


async def generate_questions_async(
    request: GenerateRequest,
    llm_config: Any,
) -> list[QuestionItem]:
    """
    根据请求与 llm_config 生成题目。
    - 当 ref_content 存在且 scenario 为 specialized/error_analysis：单次调用，生成 count 道题。
    - 否则：count==1 单次调用；count>1 拆成 count 个单题任务并发执行，合并结果。
    - 当 use_knowledge_base 为 True 时，从 RAG 检索知识点相关上下文并拼入 Prompt。
    """
    count = max(1, min(request.count, 10))
    ref_content = (request.ref_content or "").strip()
    scenario = request.scenario or "default"

    knowledge_base_context: str | None = None
    if getattr(request, "use_knowledge_base", False) and (request.knowledge_point or "").strip():
        try:
            from app.services.rag_service import get_rag_service
            rag = get_rag_service(llm_config=llm_config)
            knowledge_base_context = rag.search_context_for_generation((request.knowledge_point or "").strip(), n_results=RAG_TOP_K)
        except Exception as e:
            logger.warning("RAG 检索失败，将不注入知识库上下文: %s", e)

    rag_used = bool(knowledge_base_context and knowledge_base_context.strip())

    if ref_content and scenario in ("specialized", "error_analysis", "error_crusher"):
        prompt = _build_prompt(request, count=count, diversity_index=None, knowledge_base_context=knowledge_base_context)
        try:
            raw = await _call_llm_async(prompt, llm_config, temperature=0.7)
            parsed = _parse_questions(raw)
            if parsed:
                if len(parsed) != count:
                    logger.warning(
                        "参考题生成数量不符：请求 %s 道，实际返回 %s 道（题型=%s 难度=%s），已截断或全部返回",
                        count, len(parsed), request.question_type, request.difficulty,
                    )
                flat = parsed[:count]
                flat = await _apply_consistency_check_and_verify(flat, llm_config)
                return (flat, rag_used)
            return ([], rag_used)
        except Exception as e:
            logger.warning("基于参考题生成失败: %s", e)
            raise

    if scenario == "sync":
        prompt = _build_prompt(request, count=count, diversity_index=None, knowledge_base_context=knowledge_base_context)
        try:
            raw = await _call_llm_async(prompt, llm_config, temperature=0.6, max_tokens=16384)
            result = _parse_sync_tutoring_response(raw)
            if result.get("questions"):
                if request.student_id is not None:
                    result["questions"] = [
                        q.model_copy(update={"student_id": request.student_id}) for q in result["questions"]
                    ]
                result["questions"] = await _apply_consistency_check_and_verify(result["questions"], llm_config)
            return (result, rag_used)
        except Exception as e:
            logger.warning("同步辅导生成失败: %s", e)
            raise

    if scenario == "assessment":
        prompt = _build_prompt(request, count=count, diversity_index=None, knowledge_base_context=knowledge_base_context)
        try:
            raw = await _call_llm_async(prompt, llm_config, temperature=0.7)
            parsed = _parse_questions(raw)
            if parsed:
                if len(parsed) != count:
                    logger.warning(
                        "摸底卷生成数量不符：请求 %s 道，实际返回 %s 道，已截断或全部返回",
                        count, len(parsed),
                    )
                flat = parsed[:count]
                flat = await _apply_consistency_check_and_verify(flat, llm_config)
                return (flat, rag_used)
            return ([], rag_used)
        except Exception as e:
            logger.warning("新生摸底生成失败: %s", e)
            raise

    # 综合题型且数量 >1：按 40% 选择 / 30% 填空 / 30% 解答 预分配每题题型，再并发请求，既保证混合又保持速度
    q_type_raw = (request.question_type or "").strip()
    if ("综合" in q_type_raw or q_type_raw in ("综合", "综合 (混合题型)")) and count > 1:
        choice_n = max(0, min(count, int(round(count * 0.4))))
        fill_n = max(0, min(count - choice_n, int(round(count * 0.3))))
        solution_n = count - choice_n - fill_n
        type_sequence: list[str] = ["选择"] * choice_n + ["填空"] * fill_n + ["解答"] * solution_n
        if len(type_sequence) < count:
            type_sequence.extend(["解答"] * (count - len(type_sequence)))
        type_sequence = type_sequence[:count]
        requests_by_index = [request.model_copy(update={"question_type": type_sequence[i]}) for i in range(count)]
        tasks = [
            _generate_single(requests_by_index[i], llm_config, i, knowledge_base_context=knowledge_base_context)
            for i in range(count)
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        flat: list[QuestionItem] = []
        for i, r in enumerate(results):
            if isinstance(r, Exception):
                logger.warning("综合题型并发生成第 %s 道题异常（已忽略）: %s", i + 1, r)
                continue
            flat.extend(r[:1] if r else [])
        flat = await _apply_consistency_check_and_verify(flat, llm_config)
        return (flat, rag_used)

    if count == 1:
        result = await _generate_single(request, llm_config, 0, knowledge_base_context=knowledge_base_context)
        result = await _apply_consistency_check_and_verify(result, llm_config)
        return (result, rag_used)

    tasks = [_generate_single(request, llm_config, i, knowledge_base_context=knowledge_base_context) for i in range(count)]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    flat: list[QuestionItem] = []
    for i, r in enumerate(results):
        if isinstance(r, Exception):
            logger.warning("并发生成第 %s 道题异常（已忽略）: %s", i + 1, r)
            continue
        flat.extend(r[:1] if r else [])
    flat = await _apply_consistency_check_and_verify(flat, llm_config)
    return (flat, rag_used)


async def generate_full_exam_paper(
    params: ExamGenerateRequest,
    llm_config: Any,
) -> list[QuestionItem]:
    """
    生成完整试卷：8 选择 + 8 填空 + 12 解答，分 4 个并发任务执行，单块失败不拖垮整体。
    返回顺序：选择题 → 填空题 → 解答题（前 6）→ 解答题（后 6）。
    """
    knowledge_point = (params.knowledge_point or "").strip()
    difficulty = params.difficulty or "L2"
    student_id = getattr(params, "student_id", None)

    knowledge_base_context: str | None = None
    if getattr(params, "use_knowledge_base", False) and knowledge_point:
        try:
            from app.services.rag_service import get_rag_service
            rag = get_rag_service(llm_config=llm_config)
            knowledge_base_context = rag.search_context_for_generation(knowledge_point, n_results=RAG_TOP_K)
        except Exception as e:
            logger.warning("试卷 RAG 检索失败，将不注入知识库上下文: %s", e)
    rag_used = bool(knowledge_base_context and knowledge_base_context.strip())

    def _is_valid_choice(q: QuestionItem) -> bool:
        if not q.options or len(q.options) < 2:
            return False
        content = (q.content or "").strip()
        if content.startswith("填空题：") or content.startswith("填空题:"):
            return False
        if content.startswith("解答题：") or content.startswith("解答题:"):
            return False
        if "______" in content or "_____" in content:
            return False
        return True

    async def _run_part(question_type: str, count: int, part_name: str) -> list[QuestionItem]:
        request = GenerateRequest(
            knowledge_point=knowledge_point,
            difficulty=difficulty,
            question_type=question_type,
            count=count,
            scenario="default",
        )
        max_attempts = 2  # 各分块均重试一次，减少截断/解析失败导致整块缺失
        best_items: list[QuestionItem] = []

        for attempt in range(max_attempts):
            try:
                prompt = _build_prompt(
                    request,
                    count=count,
                    knowledge_base_context=knowledge_base_context,
                    exam_part=question_type,
                )
                raw = await _call_llm_async(
                    prompt, llm_config, temperature=0.7, max_tokens=16384
                )
                parsed = _parse_questions(raw)
                raw_list = parsed or []
                if question_type == "选择":
                    items = [q for q in raw_list if _is_valid_choice(q)]
                    dropped = len(raw_list) - len(items)
                    if dropped > 0:
                        logger.warning(
                            "试卷分块 %s 过滤掉 %s 道无选项/格式不符的题目，保留 %s 道",
                            part_name,
                            dropped,
                            len(items),
                        )
                    if len(items) > len(best_items):
                        best_items = items
                    if len(best_items) >= count:
                        break
                else:
                    items = []
                    for q in raw_list:
                        content = (q.content or "").strip()
                        # 去掉题干前误加的「填空题：」「解答题：」前缀，避免与分区标题矛盾
                        for prefix in ("填空题：", "填空题:", "解答题：", "解答题:"):
                            if content.startswith(prefix):
                                content = content[len(prefix) :].strip()
                                break
                        updates = {}
                        if content != (q.content or ""):
                            updates["content"] = content
                        if question_type in ("填空", "解答") and q.options:
                            updates["options"] = []
                        if updates:
                            q = q.model_copy(update=updates)
                        items.append(q)
                    best_items = items[:count]
                    break
            except Exception as e:
                logger.warning(
                    "试卷分块 %s 第 %s 次尝试失败: %s (%s) args=%s",
                    part_name,
                    attempt + 1,
                    e,
                    type(e).__name__,
                    getattr(e, "args", ()),
                )
                if attempt == max_attempts - 1:
                    break  # 最后一次尝试失败也返回已收集的 best_items（可能为空）

        items = best_items[:count]
        if len(items) < count:
            logger.warning("试卷分块 %s 请求 %s 道，实际返回 %s 道", part_name, count, len(items))
        return items

    task_choice = _run_part("选择", 8, "选择题")
    task_fill = _run_part("填空", 8, "填空题")
    task_solution_1 = _run_part("解答", 6, "解答题(1)")
    task_solution_2 = _run_part("解答", 6, "解答题(2)")

    results = await asyncio.gather(task_choice, task_fill, task_solution_1, task_solution_2, return_exceptions=True)

    parts: list[list[QuestionItem]] = []
    part_names = ["选择题", "填空题", "解答题(1)", "解答题(2)"]
    for i, r in enumerate(results):
        if isinstance(r, Exception):
            logger.warning("试卷分块 %s 异常: %s", part_names[i], r)
            parts.append([])
        else:
            parts.append(r or [])

    flat: list[QuestionItem] = []
    for p in parts:
        flat.extend(p)

    if student_id is not None:
        flat = [q.model_copy(update={"student_id": student_id}) for q in flat]

    flat = await _apply_consistency_check_and_verify(flat, llm_config)
    return (flat, rag_used)

