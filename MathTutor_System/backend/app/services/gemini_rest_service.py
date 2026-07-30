import asyncio
import logging
import os
import re
from typing import Any

logger = logging.getLogger(__name__)

GEMINI_REST_BASE = "https://generativelanguage.googleapis.com/v1beta"


def get_proxy_exit_ip_sync(proxy_url: str) -> str:
    """Use the configured proxy to resolve the public exit IP for diagnostics."""
    import httpx

    try:
        with httpx.Client(proxy=proxy_url, timeout=10.0, trust_env=True) as client:
            response = client.get("https://api.ipify.org")
            response.raise_for_status()
            return (response.text or "").strip() or "未知"
    except Exception as exc:
        return f"获取失败({type(exc).__name__})"


def get_windows_system_proxy() -> str:
    """Read the enabled Windows system proxy when it points to a local proxy."""
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
            if not server or ("127.0.0.1" not in server and "localhost" not in server):
                return ""
            if "://" not in server:
                server = "http://" + server
            return server.strip()
        finally:
            winreg.CloseKey(key)
    except Exception:
        return ""


def gemini_proxy_from_env() -> str:
    return (os.getenv("LLM_HTTPS_PROXY") or os.getenv("HTTPS_PROXY") or "").strip()


def resolve_gemini_proxy() -> str:
    proxy = gemini_proxy_from_env()
    if proxy:
        return proxy
    if os.name == "nt":
        proxy = get_windows_system_proxy()
        if proxy:
            logger.info("使用 Windows 系统代理作为 Gemini 代理: %s", proxy[:50])
            return proxy
    return ""


def _extract_gemini_text(data: dict[str, Any]) -> str:
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


def _build_generation_config(model_id: str, temperature: float, max_tokens: int) -> dict[str, Any]:
    generation_config: dict[str, Any] = {
        "temperature": temperature,
        "maxOutputTokens": max_tokens,
    }
    if model_id.startswith("gemini-3"):
        generation_config["thinkingConfig"] = {"thinkingLevel": "low"}
    return generation_config


def gemini_rest_sync(
    prompt: str,
    api_key: str,
    model: str,
    temperature: float,
    max_tokens: int,
    proxy_url: str,
) -> str:
    """Call Gemini REST for text generation, retrying SOCKS5 as HTTP on the same host/port."""
    import httpx

    model_id = (model or "gemini-1.5-flash").strip()
    url = f"{GEMINI_REST_BASE}/models/{model_id}:generateContent"
    headers = {"x-goog-api-key": api_key, "Content-Type": "application/json"}
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": _build_generation_config(model_id, temperature, max_tokens),
    }

    def do_request(proxy: str | None) -> httpx.Response:
        with httpx.Client(proxy=proxy or None, timeout=120.0, trust_env=True) as client:
            return client.post(url, headers=headers, json=body)

    proxy_to_use: str | None = proxy_url.strip() or None
    response: httpx.Response | None = None
    for attempt in range(2):
        try:
            response = do_request(proxy_to_use)
            break
        except Exception as exc:
            err_lower = str(exc).lower()
            if attempt == 0 and proxy_to_use and proxy_to_use.startswith("socks5://"):
                if "socks" in err_lower or "proxy" in err_lower or "connect" in err_lower:
                    match = re.match(r"socks5://([^:/]+):?(\d+)?", proxy_to_use)
                    if match:
                        host, port = match.group(1), match.group(2) or "7897"
                        proxy_to_use = f"http://{host}:{port}"
                        logger.info("SOCKS5 代理连接异常，改用同端口 HTTP 重试: %s", proxy_to_use)
                        continue
            raise

    if response is None:
        raise RuntimeError("Gemini 请求未返回响应")

    if response.status_code != 200:
        err_body = response.text[:400] if response.text else ""
        if "User location is not supported" in err_body or "FAILED_PRECONDITION" in err_body:
            raise ValueError(
                "Gemini 接口返回：当前地区不可用（User location is not supported）。"
                "请确认：(1) 代理已开启且 .env 中 LLM_HTTPS_PROXY 端口正确；(2) 代理出口在支持地区（如美/日）。"
            )
        response.raise_for_status()

    return _extract_gemini_text(response.json())


def gemini_rest_text_sync(
    prompt: str,
    api_key: str,
    model: str,
    temperature: float = 0.2,
    max_tokens: int = 4096,
) -> str:
    proxy_url = resolve_gemini_proxy()
    return gemini_rest_sync(prompt, api_key, model, temperature, max_tokens, proxy_url)


def gemini_rest_vision_sync(
    prompt: str,
    image_base64: str,
    api_key: str,
    model: str,
    mime_type: str = "image/png",
    temperature: float = 0.2,
    max_tokens: int = 4096,
) -> str:
    import httpx

    model_id = (model or "gemini-1.5-flash").strip()
    url = f"{GEMINI_REST_BASE}/models/{model_id}:generateContent"
    headers = {"x-goog-api-key": api_key, "Content-Type": "application/json"}
    body = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {"inlineData": {"mimeType": mime_type, "data": image_base64}},
                ],
            }
        ],
        "generationConfig": _build_generation_config(model_id, temperature, max_tokens),
    }
    proxy_url = resolve_gemini_proxy()
    with httpx.Client(proxy=proxy_url or None, timeout=120.0, trust_env=True) as client:
        response = client.post(url, headers=headers, json=body)
        if response.status_code != 200:
            err_body = response.text[:400] if response.text else ""
            if "User location is not supported" in err_body or "FAILED_PRECONDITION" in err_body:
                raise ValueError(
                    "Gemini 接口返回：当前地区不可用（User location is not supported）。"
                    "建议：在前端「设置」中切换为「OpenRouter」使用 Gemini 模型，可免代理、无地区限制；或配置 .env 中 LLM_HTTPS_PROXY。"
                )
            response.raise_for_status()
        data = response.json()
    return _extract_gemini_text(data)


async def gemini_rest_with_proxy(
    prompt: str,
    api_key: str,
    model: str,
    temperature: float,
    max_tokens: int,
    proxy_url: str,
) -> str:
    """Run the synchronous REST call in a worker thread and add region-limit diagnostics."""
    if not proxy_url:
        proxy_url = resolve_gemini_proxy()
    try:
        return await asyncio.to_thread(
            gemini_rest_sync, prompt, api_key, model, temperature, max_tokens, proxy_url
        )
    except ValueError as exc:
        err_msg = str(exc)
        if "User location" in err_msg or "地区不可用" in err_msg:
            sys_proxy = get_windows_system_proxy()
            if sys_proxy and sys_proxy != proxy_url:
                logger.warning("Env 代理仍被判定为不可用地区，尝试 Windows 系统代理: %s", sys_proxy[:50])
                try:
                    return await asyncio.to_thread(
                        gemini_rest_sync, prompt, api_key, model, temperature, max_tokens, sys_proxy
                    )
                except ValueError:
                    pass
            exit_ip = await asyncio.to_thread(get_proxy_exit_ip_sync, proxy_url)
            logger.warning("Gemini 地区限制诊断 - 当前代理出口 IP: %s", exit_ip)
            raise ValueError(
                "Gemini 接口返回：当前地区不可用（User location is not supported）。"
                f"当前代理出口 IP: {exit_ip}。"
                "若您已选美国节点仍报错，多半是 Gemini API Key 或 Google 账号所在地区受限（与请求 IP 无关）。"
                "建议：在前端「设置」中切换为「OpenRouter」，选择 google/gemini-2.5-flash 等模型，在 openrouter.ai 申请 Key 即可免代理、无地区限制；"
                "或用支持地区的账号在 aistudio.google.com 重新申请官方 Key。"
            ) from exc
        raise
