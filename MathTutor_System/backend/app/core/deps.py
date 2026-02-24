"""
FastAPI 依赖：从请求头读取 LLM 配置，无则回退到 .env。
Key 仅用于内存，不打印日志。
"""
import os
from dataclasses import dataclass

from dotenv import load_dotenv
from fastapi import Header

load_dotenv()


@dataclass
class LLMConfig:
    """LLM 配置：优先请求头，否则 .env。"""

    provider: str
    api_key: str
    base_url: str
    model: str


def get_llm_config(
    x_llm_provider: str | None = Header(None, alias="x-llm-provider"),
    x_llm_api_key: str | None = Header(None, alias="x-llm-api-key"),
    x_llm_base_url: str | None = Header(None, alias="x-llm-base-url"),
    x_llm_model: str | None = Header(None, alias="x-llm-model"),
) -> LLMConfig:
    """
    从 Header 读取 LLM 配置；若未传则使用 .env 默认值。
    不记录 api_key 到日志。
    """
    provider = (x_llm_provider or os.getenv("LLM_PROVIDER", "gemini")).strip().lower()
    api_key = x_llm_api_key or os.getenv("LLM_API_KEY", "")
    base_url = (x_llm_base_url or os.getenv("LLM_BASE_URL", "")).strip()
    model = (x_llm_model or os.getenv("LLM_MODEL", "")).strip()

    return LLMConfig(provider=provider, api_key=api_key, base_url=base_url, model=model)
