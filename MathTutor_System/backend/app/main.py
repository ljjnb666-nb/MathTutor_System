"""FastAPI application entrypoint for MathTutor_System."""

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

_backend_dir = Path(__file__).resolve().parent.parent
_env_file = _backend_dir / ".env"
if _env_file.exists():
    from dotenv import load_dotenv

    load_dotenv(_env_file)

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from app.api.router import api_router
from app.core.config import CORS_ORIGINS
from app.core.startup import initialize_application_data


@asynccontextmanager
async def lifespan(app: FastAPI):
    if os.getenv("LLM_HTTPS_PROXY") or os.getenv("HTTPS_PROXY"):
        print("[Gemini] Proxy configured; LLM requests will use LLM_HTTPS_PROXY/HTTPS_PROXY.")
    initialize_application_data()
    yield


app = FastAPI(
    title="MathTutor_System",
    description="初中数学备课助手 API",
    version="0.1.0",
    lifespan=lifespan,
)

_default_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5180",
    "http://127.0.0.1:5180",
]
allow_origins = _default_origins + CORS_ORIGINS if CORS_ORIGINS else _default_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Log unexpected failures and return a consistent 500 response."""
    if isinstance(exc, HTTPException):
        raise exc

    logger = logging.getLogger(__name__)
    logger.exception("Unhandled server error on %s %s", request.method, request.url.path, exc_info=exc)
    return JSONResponse(
        content={"detail": "Internal server error"},
        status_code=500,
    )


@app.get("/")
def root():
    return {"message": "MathTutor_System API", "status": "ok"}


@app.get("/favicon.ico")
def favicon():
    return Response(status_code=204)


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.get("/api/health")
def api_health():
    return {"ok": True}
