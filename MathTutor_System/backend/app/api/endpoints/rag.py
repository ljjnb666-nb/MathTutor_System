"""Owner-scoped RAG document APIs."""
import asyncio
import logging
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
from app.services.file_parser import parse_file, parse_file_from_bytes
from app.services.rag_service import get_rag_service

logger = logging.getLogger(__name__)
router = APIRouter()

_upload_status: dict[str, dict] = {}
_STATUS_EXPIRE_SEC = 600
_MAX_STATUS_ENTRIES = 100


def _require_rag(current_user: User, db: Session) -> None:
    sub = get_current_subscription(current_user, db)
    require_feature(sub, "rag", current_user)


def _prune_upload_status() -> None:
    if len(_upload_status) <= _MAX_STATUS_ENTRIES:
        return
    by_time = sorted(_upload_status.items(), key=lambda item: item[1].get("created_at") or 0)
    for task_id, _ in by_time[: len(_upload_status) - _MAX_STATUS_ENTRIES]:
        _upload_status.pop(task_id, None)


@router.get("/documents")
def rag_list_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_rag(current_user, db)
    try:
        return {"documents": get_rag_service().list_owned_documents(current_user.id)}
    except Exception as exc:
        logger.warning("RAG list failed: %s", exc)
        return {"documents": []}


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
    chunks = get_rag_service().get_owned_chunks(current_user.id, doc_id)
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
    deleted = get_rag_service().delete_document(current_user.id, doc_id)
    if deleted <= 0:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"message": "Deleted", "document_id": doc_id, "chunk_count": deleted}


@router.post("/upload")
async def rag_upload(
    file: UploadFile = File(...),
    knowledge_point: str = Form(""),
    chunk_type: str = Form("题目"),
    llm_config: LLMConfig = Depends(get_llm_config),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_rag(current_user, db)
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")
    name_lower = file.filename.lower()
    if not name_lower.endswith(".pdf") and not name_lower.endswith(".docx"):
        raise HTTPException(status_code=400, detail="Only .pdf and .docx are supported")
    try:
        text = await parse_file(file)
        if not text.strip():
            raise HTTPException(status_code=400, detail="Parsed document is empty")
        document_id = get_rag_service(llm_config=llm_config).add_document(
            text,
            file.filename,
            owner_user_id=current_user.id,
            knowledge_point=(knowledge_point or "").strip(),
            chunk_type=(chunk_type or "题目").strip() or "题目",
        )
        return {"message": "Knowledge base updated", "filename": file.filename, "document_id": document_id}
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        logger.exception("RAG upload failed")
        raise HTTPException(status_code=500, detail="Upload failed")


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
) -> str | None:
    text = parse_file_from_bytes(file_bytes, filename)
    if not text.strip():
        raise ValueError("Parsed document is empty")
    rag = get_rag_service(LLMConfig(provider=provider, api_key=api_key, base_url=base_url, model=model))
    return rag.add_document(
        text,
        filename,
        owner_user_id=owner_user_id,
        knowledge_point=knowledge_point,
        chunk_type=chunk_type,
    )


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
            ),
        )
        _upload_status[task_id].update(
            {"status": "done", "message": "Knowledge base updated", "filename": filename, "document_id": document_id}
        )
    except Exception as exc:
        logger.exception("RAG async upload failed: %s", filename)
        _upload_status[task_id].update({"status": "failed", "error": str(exc)[:200], "filename": filename})


@router.post("/upload/async")
async def rag_upload_async(
    file: UploadFile = File(...),
    knowledge_point: str = Form(""),
    chunk_type: str = Form("题目"),
    llm_config: LLMConfig = Depends(get_llm_config),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_rag(current_user, db)
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")
    name_lower = file.filename.lower()
    if not name_lower.endswith(".pdf") and not name_lower.endswith(".docx"):
        raise HTTPException(status_code=400, detail="Only .pdf and .docx are supported")
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="File is empty")
    task_id = str(uuid.uuid4())
    _upload_status[task_id] = {
        "owner_user_id": current_user.id,
        "status": "pending",
        "message": "Queued",
        "filename": file.filename,
        "created_at": time.time(),
    }
    _prune_upload_status()
    asyncio.create_task(
        _run_upload_task(
            task_id,
            file_bytes,
            file.filename,
            (knowledge_point or "").strip(),
            (chunk_type or "题目").strip() or "题目",
            llm_config.provider,
            llm_config.api_key,
            llm_config.base_url,
            llm_config.model,
            current_user.id,
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
    if int(rec.get("owner_user_id") or -1) != int(current_user.id):
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
