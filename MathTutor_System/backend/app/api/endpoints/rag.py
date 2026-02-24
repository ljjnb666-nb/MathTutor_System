"""
RAG 知识库：文档上传、列表、按来源删除，解析后写入向量库。
上传时使用请求头 x-llm-*（与「设置」中服务商一致）做 Embedding。
支持同步上传与异步上传（大文件立即返回 202，后台处理，可轮询状态）。
"""
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
from app.services.rag_service import (
    get_rag_service,
    rag_delete_by_source_no_auth,
    rag_get_chunks_by_source_no_auth,
    rag_list_documents_from_registry,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# 异步上传任务状态：task_id -> { status, message?, error?, filename?, created_at }
_upload_status: dict[str, dict] = {}
_STATUS_EXPIRE_SEC = 600
_MAX_STATUS_ENTRIES = 100


# 固定路由必须在 /documents/{source:path} 之前声明，避免 path 参数误匹配
@router.get("/documents")
def rag_list_documents():
    """
    知识库文档列表。仅读本地 JSON 注册表，不访问 ChromaDB，避免阻塞或连接重置。
    不依赖鉴权，无文档或异常时返回空列表。
    """
    try:
        items = rag_list_documents_from_registry()
        return {"documents": items if isinstance(items, list) else []}
    except Exception as e:
        logger.warning("GET /api/rag/documents 异常: %s", e)
        return {"documents": []}


@router.get("/documents/chunks")
async def rag_get_document_chunks(
    source: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    按来源获取文档的文本块列表（用于预览）。需基础版及以上套餐（rag 功能）。
    """
    sub = get_current_subscription(current_user, db)
    require_feature(sub, "rag", current_user)
    if not source or not source.strip():
        raise HTTPException(status_code=400, detail="缺少 source 参数")
    decoded = unquote(source).strip()
    try:
        chunks = rag_get_chunks_by_source_no_auth(decoded)
        return {"source": decoded, "chunks": chunks}
    except Exception as e:
        logger.exception("RAG 获取文本块失败: %s", decoded)
        raise HTTPException(status_code=500, detail=f"获取预览失败: {str(e)}")


@router.delete("/documents/{source:path}")
async def rag_delete_document(
    source: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    按来源删除知识库中的文档。需基础版及以上套餐（rag 功能）。
    """
    sub = get_current_subscription(current_user, db)
    require_feature(sub, "rag", current_user)
    if not source or not source.strip():
        raise HTTPException(status_code=400, detail="缺少文档来源")
    decoded = unquote(source).strip()
    try:
        deleted = rag_delete_by_source_no_auth(decoded)
        return {"message": "已删除", "source": decoded, "chunk_count": deleted}
    except Exception as e:
        logger.exception("RAG 删除失败: %s", decoded)
        raise HTTPException(status_code=500, detail=f"删除失败: {str(e)}")


@router.post("/upload")
async def rag_upload(
    file: UploadFile = File(...),
    knowledge_point: str = Form(""),
    chunk_type: str = Form("题目"),
    llm_config: LLMConfig = Depends(get_llm_config),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    上传 PDF/Word 文档，解析为纯文本并写入本地知识库（ChromaDB）。
    需基础版及以上套餐（rag 功能）。可选表单项：knowledge_point、chunk_type。
    """
    sub = get_current_subscription(current_user, db)
    require_feature(sub, "rag", current_user)
    if not file.filename:
        raise HTTPException(status_code=400, detail="缺少文件名")
    try:
        text = await parse_file(file)
        if not text.strip():
            raise HTTPException(status_code=400, detail="文档解析后无有效文本，请检查文件内容")
        rag = get_rag_service(llm_config=llm_config)
        rag.add_document(
            text,
            file.filename,
            knowledge_point=(knowledge_point or "").strip(),
            chunk_type=(chunk_type or "题目").strip() or "题目",
        )
        logger.info("RAG 已导入文档: %s", file.filename)
        return {"message": "知识库已更新", "filename": file.filename}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("RAG 上传失败")
        raise HTTPException(status_code=500, detail=f"上传或写入知识库失败: {str(e)}")


def _do_upload_sync(
    file_bytes: bytes,
    filename: str,
    knowledge_point: str,
    chunk_type: str,
    provider: str,
    api_key: str,
    base_url: str,
    model: str,
) -> None:
    """同步执行：解析 + 写入向量库（在线程池中运行，避免阻塞事件循环）。"""
    text = parse_file_from_bytes(file_bytes, filename)
    if not text.strip():
        raise ValueError("文档解析后无有效文本，请检查文件内容")
    llm_config = LLMConfig(provider=provider, api_key=api_key, base_url=base_url, model=model)
    rag = get_rag_service(llm_config=llm_config)
    rag.add_document(
        text,
        filename,
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
) -> None:
    """后台任务：在线程池中执行解析与写入，并更新状态。"""
    _upload_status[task_id]["status"] = "processing"
    _upload_status[task_id]["message"] = "正在解析并写入知识库…"
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
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
            ),
        )
        _upload_status[task_id]["status"] = "done"
        _upload_status[task_id]["message"] = "知识库已更新"
        _upload_status[task_id]["filename"] = filename
        logger.info("RAG 异步导入完成: %s", filename)
    except Exception as e:
        logger.exception("RAG 异步上传失败: %s", filename)
        _upload_status[task_id]["status"] = "failed"
        _upload_status[task_id]["error"] = str(e)[:500]
        _upload_status[task_id]["filename"] = filename


def _prune_upload_status() -> None:
    """保留最近条目，避免内存无限增长。"""
    if len(_upload_status) <= _MAX_STATUS_ENTRIES:
        return
    by_time = sorted(_upload_status.items(), key=lambda x: x[1].get("created_at") or 0)
    for task_id, _ in by_time[: len(_upload_status) - _MAX_STATUS_ENTRIES]:
        _upload_status.pop(task_id, None)


@router.post("/upload/async")
async def rag_upload_async(
    file: UploadFile = File(...),
    knowledge_point: str = Form(""),
    chunk_type: str = Form("题目"),
    llm_config: LLMConfig = Depends(get_llm_config),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    异步上传：立即返回 202 与 task_id，后台解析并写入知识库。需基础版及以上套餐（rag 功能）。
    """
    sub = get_current_subscription(current_user, db)
    require_feature(sub, "rag", current_user)
    if not file.filename:
        raise HTTPException(status_code=400, detail="缺少文件名")
    name_lower = (file.filename or "").lower()
    if not name_lower.endswith(".pdf") and not name_lower.endswith(".docx"):
        raise HTTPException(status_code=400, detail="仅支持 .pdf 或 .docx")
    file_bytes = await file.read()
    task_id = str(uuid.uuid4())
    _upload_status[task_id] = {
        "status": "pending",
        "message": "已加入队列",
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
        )
    )
    return JSONResponse(
        status_code=202,
        content={"task_id": task_id, "status": "pending", "message": "已加入队列，正在后台处理"},
    )


@router.get("/upload/status/{task_id}")
async def rag_upload_status(task_id: str):
    """
    查询异步上传任务状态。返回 status: pending | processing | done | failed；
    done 时含 filename，failed 时含 error。
    """
    if not task_id or task_id not in _upload_status:
        raise HTTPException(status_code=404, detail="任务不存在或已过期")
    rec = _upload_status[task_id]
    created = rec.get("created_at") or 0
    if time.time() - created > _STATUS_EXPIRE_SEC:
        _upload_status.pop(task_id, None)
        raise HTTPException(status_code=404, detail="任务已过期")
    return {
        "task_id": task_id,
        "status": rec.get("status", "pending"),
        "message": rec.get("message"),
        "filename": rec.get("filename"),
        "error": rec.get("error"),
    }
