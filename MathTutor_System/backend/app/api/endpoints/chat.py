"""
AI 对话接口：多轮对话，可选带入当前学生与知识点、知识库检索；支持流式输出与会话持久化。
"""
import json
import logging
import traceback

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.core.deps import LLMConfig, get_llm_config
from app.models.base import get_db
from app.models.user import User
from app.schemas.chat_dto import (
    ChatMessageItem,
    ChatMessageUpdate,
    ChatRequest,
    ChatResponse,
    ChatSessionItem,
    ChatSessionPinUpdate,
)
from app.services.llm_service import chat_completion_async, chat_completion_stream_async
from app.services.chat_context_service import build_chat_context
from app.services.chat_session_service import (
    delete_user_session,
    list_session_messages,
    list_user_sessions,
    persist_chat_turn,
    update_session_pin,
    update_user_message,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("", response_model=ChatResponse)
async def api_chat(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    llm_config: LLMConfig = Depends(get_llm_config),
) -> ChatResponse:
    """
    AI 对话：发送多轮消息，返回助手回复。
    可选 student_id、knowledge_point、use_knowledge_base 带入学情与知识库。
    """
    if not (llm_config.api_key or "").strip():
        raise HTTPException(
            status_code=400,
            detail="未配置 API Key。请在前端「设置」中填写，或在后端 .env 中设置 LLM_API_KEY。",
        )

    chat_context = build_chat_context(db, request, current_user, llm_config)

    messages = [{"role": m.role, "content": m.content} for m in request.messages]
    try:
        content = await chat_completion_async(messages, chat_context.system_prompt, llm_config)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        logger.exception("AI 对话出错")
        detail = str(e).strip() or "对话请求失败，请检查 API 配置与网络后重试。"
        if len(detail) > 300:
            detail = detail[:300] + "..."
        raise HTTPException(status_code=500, detail=detail)

    session = persist_chat_turn(db, request, current_user.id, content)
    return ChatResponse(
        content=content,
        session_id=session.id,
        rag_used=bool(chat_context.rag_sources),
        rag_sources=chat_context.rag_sources,
    )


async def _stream_chat_response(
    request: ChatRequest,
    system_prompt: str,
    llm_config,
    db: Session,
    current_user: User,
    rag_sources: list[str] | None = None,
):
    """流式生成：先 yield 内容片段（NDJSON），最后 yield done + session_id，并落库。"""
    messages = [{"role": m.role, "content": m.content} for m in request.messages]
    content_parts: list[str] = []
    try:
        async for chunk in chat_completion_stream_async(messages, system_prompt, llm_config):
            content_parts.append(chunk)
            yield (json.dumps({"content": chunk}, ensure_ascii=False) + "\n").encode("utf-8")
    except Exception as e:
        yield (json.dumps({"error": str(e)[:200]}, ensure_ascii=False) + "\n").encode("utf-8")
        return
    full_content = "".join(content_parts).strip() or "（无回复）"

    try:
        session = persist_chat_turn(db, request, current_user.id, full_content)
    except HTTPException as exc:
        yield (json.dumps({"done": True, "error": exc.detail}, ensure_ascii=False) + "\n").encode("utf-8")
        return
    payload = {
        "done": True,
        "session_id": session.id,
        "rag_used": bool(rag_sources),
        "rag_sources": list(rag_sources or []),
    }
    yield (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")


@router.post("/stream")
async def api_chat_stream(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    llm_config: LLMConfig = Depends(get_llm_config),
):
    """流式对话：返回 NDJSON 流，每行 {"content": "delta"}，最后一行 {"done": true, "session_id": id}。"""
    if not (llm_config.api_key or "").strip():
        raise HTTPException(
            status_code=400,
            detail="未配置 API Key。请在前端「设置」中填写，或在后端 .env 中设置 LLM_API_KEY。",
        )
    chat_context = build_chat_context(db, request, current_user, llm_config)

    return StreamingResponse(
        _stream_chat_response(request, chat_context.system_prompt, llm_config, db, current_user, chat_context.rag_sources),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/sessions", response_model=list[ChatSessionItem])
def list_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ChatSessionItem]:
    """当前用户的对话会话列表：固定会话在前，再按创建时间倒序。"""
    return list_user_sessions(db, current_user.id)


@router.patch("/sessions/{session_id}", response_model=ChatSessionItem)
def update_session(
    session_id: int,
    body: ChatSessionPinUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatSessionItem:
    """固定/取消固定会话。"""
    try:
        return update_session_pin(db, session_id, current_user.id, body.pinned)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions/{session_id}/messages", response_model=list[ChatMessageItem])
def get_session_messages(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ChatMessageItem]:
    """获取某会话的历史消息，需归属当前用户。"""
    return list_session_messages(db, session_id, current_user.id)


@router.patch("/sessions/{session_id}/messages/{message_id}", response_model=ChatMessageItem)
def update_session_message(
    session_id: int,
    message_id: int,
    body: ChatMessageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatMessageItem:
    """修改已发送的消息内容（仅 user 消息），并截断该条之后的所有消息（Gemini 式编辑后重新生成）。"""
    try:
        return update_user_message(db, session_id, message_id, current_user.id, body.content)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/sessions/{session_id}")
def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """删除会话及其消息，仅允许删除当前用户的会话。"""
    try:
        return delete_user_session(db, session_id, current_user.id)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
