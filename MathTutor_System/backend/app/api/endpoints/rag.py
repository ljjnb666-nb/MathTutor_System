"""Owner-scoped RAG document APIs."""
from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
from urllib.parse import unquote

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.core.deps import LLMConfig, get_llm_config
from app.core.subscription import get_current_subscription, require_feature
from app.models.base import get_db
from app.models.user import User
from app.services.file_parser import parse_file_from_bytes
from app.services.rag_document_store import (
    DocumentRegistryError,
    rag_delete_document as store_delete_document,
    rag_get_chunks,
    rag_list_documents as store_list_documents,
)
from app.services.rag_service import get_rag_service
from app.services.rag_account_service import StaleRAGAccountError, write_rag_for_account_instance

logger = logging.getLogger(__name__)
router = APIRouter()

_upload_status: dict[str, dict] = {}
_STATUS_EXPIRE_SEC = 600
_MAX_STATUS_ENTRIES = 100
MAX_RAG_UPLOAD_BYTES = 12 * 1024 * 1024
MAX_RAG_FILENAME_LENGTH = 180
ALLOWED_RAG_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream",
}


def _require_rag(current_user: User, db: Session) -> None:
    sub = get_current_subscription(current_user, db)
    require_feature(sub, "rag", current_user)


def _prune_upload_status() -> None:
    if len(_upload_status) <= _MAX_STATUS_ENTRIES:
        return
    by_time = sorted(_upload_status.items(), key=lambda item: item[1].get("created_at") or 0)
    for task_id, _ in by_time[: len(_upload_status) - _MAX_STATUS_ENTRIES]:
        _upload_status.pop(task_id, None)


def _validate_rag_filename(filename: str) -> str:
    clean = (filename or "").strip()
    if not clean:
        raise HTTPException(status_code=400, detail="Missing filename")
    if len(clean) > MAX_RAG_FILENAME_LENGTH:
        raise HTTPException(status_code=400, detail="Filename is too long")
    if clean != os.path.basename(clean) or "/" in clean or "\\" in clean:
        raise HTTPException(status_code=400, detail="Invalid filename")
    lower = clean.lower()
    if not (lower.endswith(".pdf") or lower.endswith(".docx")):
        raise HTTPException(status_code=400, detail="Only .pdf and .docx are supported")
    return clean


async def _read_validated_rag_upload(file: UploadFile) -> tuple[str, bytes]:
    filename = _validate_rag_filename(file.filename or "")
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type and content_type not in ALLOWED_RAG_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="File is empty")
    if len(file_bytes) > MAX_RAG_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File is too large")
    return filename, file_bytes


@router.get("/documents")
def rag_list_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_rag(current_user, db)
    try:
        return {"documents": store_list_documents(current_user.id)}
    except DocumentRegistryError as exc:
        logger.warning("RAG registry list failed error_type=%s", type(exc).__name__)
        raise HTTPException(status_code=500, detail="Document registry is unavailable")
    except Exception as exc:
        logger.warning("RAG list failed error_type=%s", type(exc).__name__)
        raise HTTPException(status_code=500, detail="Document list failed")


@router.get("/documents/chunks")
async def rag_get_document_chunks(
    document_id: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_rag(current_user, db)
    doc_id = unquote(document_id or "").strip()
    if not doc_id:
        raise HTTPException(status_code=400, detail="Missing document_id")
    chunks = rag_get_chunks(current_user.id, doc_id)
    if not chunks:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"document_id": doc_id, "chunks": chunks}


@router.delete("/documents/{source:path}")
async def rag_delete_document(
    source: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_rag(current_user, db)
    doc_id = unquote(source or "").strip()
    if not doc_id:
        raise HTTPException(status_code=400, detail="Missing document_id")
    deleted = store_delete_document(current_user.id, doc_id)
    if deleted <= 0:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"message": "Deleted", "document_id": doc_id, "chunk_count": deleted}


@router.post("/upload")
async def rag_upload(
    file: UploadFile = File(...),
    knowledge_point: str = Form(""),
    chunk_type: str = Form("question"),
    llm_config: LLMConfig = Depends(get_llm_config),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_rag(current_user, db)
    owner_user_id, owner_auth_subject = current_user.id, current_user.auth_subject
    filename, file_bytes = await _read_validated_rag_upload(file)
    try:
        text = parse_file_from_bytes(file_bytes, filename)
        if not text.strip():
            raise HTTPException(status_code=400, detail="Parsed document is empty")
        document_id = write_rag_for_account_instance(
            owner_user_id, owner_auth_subject,
            lambda: get_rag_service(llm_config=llm_config).add_document(
                text,
                filename,
                owner_user_id=owner_user_id,
                knowledge_point=(knowledge_point or "").strip(),
                chunk_type=(chunk_type or "question").strip() or "question",
            ),
        )
        return {"message": "Knowledge base updated", "filename": filename, "document_id": document_id}
    except StaleRAGAccountError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="RAG_UPLOAD_ERROR: 文档无法处理，请检查文件格式后重试。") from None
    except Exception as exc:
        logger.error("RAG upload failed external_error_type=%s", type(exc).__name__)
        raise HTTPException(status_code=500, detail="RAG_PROVIDER_ERROR: 知识库处理失败，请稍后重试。") from None


def _do_upload_sync(
    file_bytes: bytes,
    filename: str,
    knowledge_point: str,
    chunk_type: str,
    provider: str,
    api_key: str,
    base_url: str,
    model: str,
    owner_user_id: int,
    owner_auth_subject: str,
) -> str | None:
    text = parse_file_from_bytes(file_bytes, filename)
    if not text.strip():
        raise ValueError("Parsed document is empty")
    rag = get_rag_service(LLMConfig(provider=provider, api_key=api_key, base_url=base_url, model=model))
    return write_rag_for_account_instance(owner_user_id, owner_auth_subject, lambda: rag.add_document(
        text,
        filename,
        owner_user_id=owner_user_id,
        knowledge_point=knowledge_point,
        chunk_type=chunk_type,
    ))


async def _run_upload_task(
    task_id: str,
    file_bytes: bytes,
    filename: str,
    knowledge_point: str,
    chunk_type: str,
    provider: str,
    api_key: str,
    base_url: str,
    model: str,
    owner_user_id: int,
    owner_auth_subject: str,
) -> None:
    _upload_status[task_id]["status"] = "processing"
    _upload_status[task_id]["message"] = "Processing"
    try:
        loop = asyncio.get_event_loop()
        document_id = await loop.run_in_executor(
            None,
            lambda: _do_upload_sync(
                file_bytes,
                filename,
                knowledge_point,
                chunk_type,
                provider,
                api_key,
                base_url,
                model,
                owner_user_id,
                owner_auth_subject,
            ),
        )
        _upload_status[task_id].update(
            {"status": "done", "message": "Knowledge base updated", "filename": filename, "document_id": document_id}
        )
    except StaleRAGAccountError as exc:
        _upload_status[task_id].update({"status": "failed", "error": str(exc), "message": str(exc)})
    except Exception as exc:
        logger.error("RAG async upload failed external_error_type=%s", type(exc).__name__)
        _upload_status[task_id].update({"status": "failed", "error": "Upload failed", "filename": filename})


@router.post("/upload/async")
async def rag_upload_async(
    file: UploadFile = File(...),
    knowledge_point: str = Form(""),
    chunk_type: str = Form("question"),
    llm_config: LLMConfig = Depends(get_llm_config),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_rag(current_user, db)
    filename, file_bytes = await _read_validated_rag_upload(file)
    task_id = str(uuid.uuid4())
    _upload_status[task_id] = {
        "owner_user_id": current_user.id,
        "owner_auth_subject": current_user.auth_subject,
        "status": "pending",
        "message": "Queued",
        "filename": filename,
        "created_at": time.time(),
    }
    _prune_upload_status()
    asyncio.create_task(
        _run_upload_task(
            task_id,
            file_bytes,
            filename,
            (knowledge_point or "").strip(),
            (chunk_type or "question").strip() or "question",
            llm_config.provider,
            llm_config.api_key,
            llm_config.base_url,
            llm_config.model,
            current_user.id,
            current_user.auth_subject,
        )
    )
    return JSONResponse(status_code=202, content={"task_id": task_id, "status": "pending", "message": "Queued"})


@router.get("/upload/status/{task_id}")
async def rag_upload_status(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    if not task_id or task_id not in _upload_status:
        raise HTTPException(status_code=404, detail="Task not found")
    rec = _upload_status[task_id]
    if (int(rec.get("owner_user_id") or -1) != int(current_user.id)
            or rec.get("owner_auth_subject") != current_user.auth_subject):
        raise HTTPException(status_code=404, detail="Task not found")
    if time.time() - (rec.get("created_at") or 0) > _STATUS_EXPIRE_SEC:
        _upload_status.pop(task_id, None)
        raise HTTPException(status_code=404, detail="Task expired")
    return {
        "task_id": task_id,
        "status": rec.get("status", "pending"),
        "message": rec.get("message"),
        "filename": rec.get("filename"),
        "document_id": rec.get("document_id"),
        "error": rec.get("error"),
    }
