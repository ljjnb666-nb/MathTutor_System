"""Typed application settings with legacy constant exports for compatibility."""
import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE = BASE_DIR / ".env"
load_dotenv(ENV_FILE)


def _default_database_url() -> str:
    return f"sqlite:///{(BASE_DIR / 'math_tutor.db').as_posix()}"


class AppSettings(BaseSettings):
    env: str = Field(default="development", alias="ENV")
    debug: bool = Field(default=True, alias="DEBUG")
    allow_client_llm_config: bool | None = Field(default=None, alias="ALLOW_CLIENT_LLM_CONFIG")

    database_url: str = Field(default_factory=_default_database_url, alias="DATABASE_URL")

    llm_api_key: str = Field(default="", alias="LLM_API_KEY")
    llm_provider: str = Field(default="gemini", alias="LLM_PROVIDER")
    llm_base_url: str = Field(default="", alias="LLM_BASE_URL")
    llm_api_version: str = Field(default="", alias="LLM_API_VERSION")
    llm_model: str = Field(default="", alias="LLM_MODEL")
    llm_https_proxy: str = Field(default="", alias="LLM_HTTPS_PROXY")
    llm_http_proxy: str = Field(default="", alias="LLM_HTTP_PROXY")

    deepseek_api_key: str = Field(default="", alias="DEEPSEEK_API_KEY")
    deepseek_base_url: str = Field(default="https://api.deepseek.com", alias="DEEPSEEK_BASE_URL")
    deepseek_model: str = Field(default="deepseek-v4-flash", alias="DEEPSEEK_MODEL")
    deepseek_embed_model: str = Field(default="deepseek-embedding-v2", alias="DEEPSEEK_EMBED_MODEL")

    ai_request_timeout: int = Field(default=120, alias="AI_REQUEST_TIMEOUT")
    rag_top_k: int = Field(default=3, alias="RAG_TOP_K")
    cors_origins_raw: str = Field(default="", alias="CORS_ORIGINS")

    alipay_app_id: str = Field(default="", alias="ALIPAY_APP_ID")
    alipay_private_key: str = Field(default="", alias="ALIPAY_PRIVATE_KEY")
    alipay_public_key: str = Field(default="", alias="ALIPAY_PUBLIC_KEY")
    alipay_debug: bool = Field(default=False, alias="ALIPAY_DEBUG")
    alipay_notify_url: str = Field(default="", alias="ALIPAY_NOTIFY_URL")
    alipay_return_url: str = Field(default="", alias="ALIPAY_RETURN_URL")

    wechat_appid: str = Field(default="", alias="WECHAT_APPID")
    wechat_mchid: str = Field(default="", alias="WECHAT_MCHID")
    wechat_private_key: str = Field(default="", alias="WECHAT_PRIVATE_KEY")
    wechat_cert_serial_no: str = Field(default="", alias="WECHAT_CERT_SERIAL_NO")
    wechat_apiv3_key: str = Field(default="", alias="WECHAT_APIV3_KEY")
    wechat_notify_url: str = Field(default="", alias="WECHAT_NOTIFY_URL")
    wechat_cert_dir: str = Field(default="", alias="WECHAT_CERT_DIR")

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    @property
    def cors_origins(self) -> list[str]:
        return [item.strip() for item in self.cors_origins_raw.split(",") if item.strip()]

    @property
    def alipay_enabled(self) -> bool:
        return bool(self.alipay_app_id and self.alipay_private_key and self.alipay_public_key)

    @property
    def wechat_cert_dir_value(self) -> str | None:
        return self.wechat_cert_dir.strip() or None

    @property
    def wechat_pay_enabled(self) -> bool:
        return bool(
            self.wechat_appid
            and self.wechat_mchid
            and self.wechat_private_key
            and self.wechat_cert_serial_no
            and self.wechat_apiv3_key
            and self.wechat_notify_url
        )


settings = AppSettings()

ENV = settings.env.strip().lower()
DEBUG = settings.debug
IS_PRODUCTION = ENV == "production" or not DEBUG
ALLOW_CLIENT_LLM_CONFIG = (
    settings.allow_client_llm_config
    if settings.allow_client_llm_config is not None
    else not IS_PRODUCTION
)

if settings.llm_https_proxy:
    os.environ.setdefault("HTTPS_PROXY", settings.llm_https_proxy.strip())
if settings.llm_http_proxy:
    os.environ.setdefault("HTTP_PROXY", settings.llm_http_proxy.strip())

DATABASE_URL = settings.database_url
LLM_API_KEY = settings.llm_api_key.strip()
LLM_PROVIDER = settings.llm_provider
LLM_BASE_URL = settings.llm_base_url.strip()
LLM_API_VERSION = settings.llm_api_version.strip()
LLM_MODEL = settings.llm_model.strip()

DEEPSEEK_API_KEY = settings.deepseek_api_key.strip()
DEEPSEEK_BASE_URL = settings.deepseek_base_url.strip()
DEEPSEEK_MODEL = settings.deepseek_model.strip()
DEEPSEEK_EMBED_MODEL = settings.deepseek_embed_model.strip()

AI_REQUEST_TIMEOUT = settings.ai_request_timeout
RAG_TOP_K = max(1, min(15, settings.rag_top_k))
CORS_ORIGINS = settings.cors_origins

ALIPAY_APP_ID = settings.alipay_app_id.strip()
ALIPAY_PRIVATE_KEY = settings.alipay_private_key.strip()
ALIPAY_PUBLIC_KEY = settings.alipay_public_key.strip()
ALIPAY_DEBUG = settings.alipay_debug
ALIPAY_NOTIFY_URL = settings.alipay_notify_url.strip()
ALIPAY_RETURN_URL = settings.alipay_return_url.strip()
ALIPAY_ENABLED = settings.alipay_enabled

WECHAT_APPID = settings.wechat_appid.strip()
WECHAT_MCHID = settings.wechat_mchid.strip()
WECHAT_PRIVATE_KEY = settings.wechat_private_key.strip()
WECHAT_CERT_SERIAL_NO = settings.wechat_cert_serial_no.strip()
WECHAT_APIV3_KEY = settings.wechat_apiv3_key.strip()
WECHAT_NOTIFY_URL = settings.wechat_notify_url.strip()
WECHAT_CERT_DIR = settings.wechat_cert_dir_value
WECHAT_PAY_ENABLED = settings.wechat_pay_enabled
