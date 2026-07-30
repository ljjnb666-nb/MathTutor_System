"""
FastAPI 依赖：从请求头读取 LLM 配置，无则回退到 .env。
Key 仅用于内存，不打印日志。
"""
from dotenv import load_dotenv
from fastapi import Header

from app.core.config import ALLOW_CLIENT_LLM_CONFIG
from app.core.llm_config import LLMConfig, resolve_llm_config

load_dotenv()


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
    x_llm_provider = x_llm_provider if isinstance(x_llm_provider, str) else None
    x_llm_api_key = x_llm_api_key if isinstance(x_llm_api_key, str) else None
    x_llm_base_url = x_llm_base_url if isinstance(x_llm_base_url, str) else None
    x_llm_model = x_llm_model if isinstance(x_llm_model, str) else None

    return resolve_llm_config(
        {
            "x-llm-provider": x_llm_provider,
            "x-llm-api-key": x_llm_api_key,
            "x-llm-base-url": x_llm_base_url,
            "x-llm-model": x_llm_model,
        }
    )
