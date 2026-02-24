"""
环境变量配置：数据库、LLM、DeepSeek、超时等集中管理。
"""
import os
from pathlib import Path

from dotenv import load_dotenv

# 固定从 backend 目录加载 .env，避免在项目根或其他目录启动 uvicorn 时读不到代理等配置
_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(_BACKEND_DIR / ".env")

# 代理：部分地区（如中国大陆）无法直连 Google Gemini，需在 .env 中设置后重启后端
_llm_https = os.getenv("LLM_HTTPS_PROXY", "").strip()
_llm_http = os.getenv("LLM_HTTP_PROXY", "").strip()
if _llm_https:
    os.environ.setdefault("HTTPS_PROXY", _llm_https)
if _llm_http:
    os.environ.setdefault("HTTP_PROXY", _llm_http)

# app/core/config.py -> parent.parent = app, parent = backend
BASE_DIR = _BACKEND_DIR
_db_path = (BASE_DIR / "math_tutor.db").as_posix()
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{_db_path}")

# LLM 通用（智能出题、设置回退）
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "").strip()
LLM_MODEL = os.getenv("LLM_MODEL", "").strip()

# DeepSeek：Word 解析、PPT 生成、RAG 知识库 Embedding 等未传请求头时使用
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "").strip()
DEEPSEEK_BASE_URL = (os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")).strip()
DEEPSEEK_MODEL = (os.getenv("DEEPSEEK_MODEL", "deepseek-chat")).strip()
# RAG 知识库向量化模型（OpenAI 兼容接口）
DEEPSEEK_EMBED_MODEL = os.getenv("DEEPSEEK_EMBED_MODEL", "deepseek-embedding-v2").strip()

# AI 请求超时（秒），用于 OpenAI 兼容接口、DeepSeek 等
AI_REQUEST_TIMEOUT = int(os.getenv("AI_REQUEST_TIMEOUT", "120"))

# RAG 知识库检索条数（出题/组卷/对话默认取几条上下文），可调参
RAG_TOP_K = max(1, min(15, int(os.getenv("RAG_TOP_K", "3"))))

# CORS：生产环境填写前端访问地址，逗号分隔
CORS_ORIGINS_RAW = os.getenv("CORS_ORIGINS", "")
CORS_ORIGINS = [s.strip() for s in CORS_ORIGINS_RAW.split(",") if s.strip()]

# ---------- 支付宝 ----------
ALIPAY_APP_ID = os.getenv("ALIPAY_APP_ID", "").strip()
ALIPAY_PRIVATE_KEY = os.getenv("ALIPAY_PRIVATE_KEY", "").strip()
ALIPAY_PUBLIC_KEY = os.getenv("ALIPAY_PUBLIC_KEY", "").strip()
ALIPAY_DEBUG = os.getenv("ALIPAY_DEBUG", "0").strip() in ("1", "true", "yes")
ALIPAY_NOTIFY_URL = os.getenv("ALIPAY_NOTIFY_URL", "").strip()
# 支付完成跳转（可选，前端 /pricing 或 /pricing?paid=1）
ALIPAY_RETURN_URL = os.getenv("ALIPAY_RETURN_URL", "").strip()

ALIPAY_ENABLED = bool(ALIPAY_APP_ID and ALIPAY_PRIVATE_KEY and ALIPAY_PUBLIC_KEY)

# ---------- 微信支付（Native 扫码） ----------
WECHAT_APPID = os.getenv("WECHAT_APPID", "").strip()
WECHAT_MCHID = os.getenv("WECHAT_MCHID", "").strip()
WECHAT_PRIVATE_KEY = os.getenv("WECHAT_PRIVATE_KEY", "").strip()
WECHAT_CERT_SERIAL_NO = os.getenv("WECHAT_CERT_SERIAL_NO", "").strip()
WECHAT_APIV3_KEY = os.getenv("WECHAT_APIV3_KEY", "").strip()
WECHAT_NOTIFY_URL = os.getenv("WECHAT_NOTIFY_URL", "").strip()
# 平台证书目录，可选；不设则首次请求时自动下载并验证
WECHAT_CERT_DIR = os.getenv("WECHAT_CERT_DIR", "").strip() or None

WECHAT_PAY_ENABLED = bool(
    WECHAT_APPID and WECHAT_MCHID and WECHAT_PRIVATE_KEY
    and WECHAT_CERT_SERIAL_NO and WECHAT_APIV3_KEY and WECHAT_NOTIFY_URL
)
