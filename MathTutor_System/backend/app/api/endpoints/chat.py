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
from app.core.config import RAG_TOP_K
from app.core.deps import LLMConfig, get_llm_config
from app.core.subscription import get_current_subscription, require_feature
from app.models.base import get_db
from app.models.chat_session import ChatMessage as ChatMessageModel
from app.models.chat_session import ChatSession
from app.models.mistake import MistakeRecord
from app.models.student import Student
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
from app.services.rag_service import get_rag_service

logger = logging.getLogger(__name__)
router = APIRouter()


def _require_own_student(row: Student | None, current_user: User) -> Student:
    """若学生不存在或不属于当前用户，则 404。"""
    if row is None:
        raise HTTPException(status_code=404, detail="学生不存在")
    if row.user_id is not None and row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="学生不存在")
    return row


def _split_topics(topic_str: str | None) -> set[str]:
    """将可能为组合知识点的字符串（如 'A + B'）拆分为集合。"""
    if not topic_str or not str(topic_str).strip():
        return set()
    return {s.strip() for s in str(topic_str).split("+") if s.strip()}


def _get_student_context_for_chat(
    db: Session, student_id: int, current_user_id: int, max_mistakes: int = 8
) -> tuple[list[str], list[str]]:
    """
    获取该生的弱项知识点与近期待巩固错题摘要（仅当前用户名下学生）。
    返回 (weak_points 列表, 错题摘要列表，每条为 "topic: content前80字"）。
    """
    mistakes = (
        db.query(MistakeRecord)
        .join(Student, MistakeRecord.student_id == Student.id)
        .filter(
            MistakeRecord.student_id == student_id,
            MistakeRecord.status == "pending",
            Student.user_id == current_user_id,
        )
        .order_by(MistakeRecord.created_at.desc())
        .limit(max_mistakes)
        .all()
    )
    weak_points: set[str] = set()
    summaries: list[str] = []
    for m in mistakes:
        weak_points |= _split_topics(m.topic)
        content_preview = (m.content or "").strip()[:80]
        if content_preview:
            content_preview = content_preview.replace("\n", " ")
        summaries.append(f"【{m.topic}】{content_preview}{'…' if len((m.content or '').strip()) > 80 else ''}")
    return (sorted(weak_points), summaries)


# 通用助手系统提示（无学情上下文）
CHAT_SYSTEM_PROMPT_DEFAULT = """你是初中数学备课助手，可解答数学与备课相关问题。
回答请简洁清晰。数学公式使用 LaTeX，用单个美元符号包裹，如 $x^2$、$\\frac{1}{2}$。"""


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

    knowledge_point = (request.knowledge_point or "").strip()
    use_kb = request.use_knowledge_base and bool(knowledge_point)
    if use_kb:
        sub = get_current_subscription(current_user, db)
        require_feature(sub, "rag", current_user)

    student_name: str | None = None
    if request.student_id is not None:
        row = db.get(Student, request.student_id)
        _require_own_student(row, current_user)
        student_name = (row.name or "").strip() or "学生"

    system_prompt = CHAT_SYSTEM_PROMPT_DEFAULT
    if student_name or knowledge_point:
        parts = ["当前辅导上下文："]
        if student_name:
            parts.append(f"辅导对象：{student_name}。")
        if knowledge_point:
            parts.append(f"知识点：{knowledge_point}。")
        parts.append("请结合学情与上述资料回答，数学公式用 LaTeX，用 $...$ 包裹。")
        system_prompt = " ".join(parts)

    if request.student_id is not None:
        weak_points, mistake_summaries = _get_student_context_for_chat(
            db, request.student_id, current_user.id
        )
        if weak_points:
            system_prompt += "\n\n该生薄弱知识点：" + "、".join(weak_points) + "。"
        if mistake_summaries:
            system_prompt += "\n\n近期待巩固错题（摘要）：\n" + "\n".join(mistake_summaries)

    rag_sources: list[str] = []
    if use_kb:
        try:
            rag = get_rag_service(llm_config)
            last_user_content = (request.messages[-1].content or "").strip() if request.messages else ""
            kb_context, rag_sources = rag.search_context_for_chat_with_sources(
                last_user_content, knowledge_point=knowledge_point or None, n_results=RAG_TOP_K
            )
            if kb_context and kb_context.strip():
                system_prompt += "\n\n参考知识库：\n" + kb_context.strip()
        except Exception as e:
            logger.warning("RAG 检索失败，继续不带知识库对话: %s", e)
            rag_sources = []

    context_question = (request.context_question or "").strip()
    if context_question:
        system_prompt += "\n\n用户当前关注的题目如下，回答时可针对此题讲解、出变式或指出易错点：\n" + context_question

    messages = [{"role": m.role, "content": m.content} for m in request.messages]
    try:
        content = await chat_completion_async(messages, system_prompt, llm_config)
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

    session_id: int | None = request.session_id
    if session_id is not None:
        session = db.get(ChatSession, session_id)
        if session is None or session.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="会话不存在")
    else:
        title = "未命名会话"
        if request.messages:
            first_content = (request.messages[0].content or "").strip()
            if first_content:
                title = first_content[:50] + ("…" if len(first_content) > 50 else "")
        session = ChatSession(
            user_id=current_user.id,
            student_id=request.student_id,
            title=title,
        )
        db.add(session)
        db.flush()

    last_user = request.messages[-1] if request.messages else None
    # 已有会话且最后一条已是该用户消息（编辑后重新生成）：只追加助手回复，不再重复写入用户消息
    skip_last_user = False
    if session_id is not None and last_user and last_user.role == "user":
        last_in_db = (
            db.query(ChatMessageModel)
            .filter(ChatMessageModel.session_id == session.id)
            .order_by(ChatMessageModel.id.desc())
            .limit(1)
            .first()
        )
        if last_in_db and last_in_db.role == "user" and (last_in_db.content or "").strip() == (last_user.content or "").strip():
            skip_last_user = True
    if last_user and not skip_last_user:
        db.add(
            ChatMessageModel(
                session_id=session.id,
                role=last_user.role,
                content=last_user.content,
            )
        )
    db.add(
        ChatMessageModel(
            session_id=session.id,
            role="assistant",
            content=content,
        )
    )
    db.commit()
    return ChatResponse(
        content=content,
        session_id=session.id,
        rag_used=bool(rag_sources),
        rag_sources=rag_sources,
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

    session_id: int | None = request.session_id
    if session_id is not None:
        session = db.get(ChatSession, session_id)
        if session is None or session.user_id != current_user.id:
            yield (json.dumps({"done": True, "error": "会话不存在"}, ensure_ascii=False) + "\n").encode("utf-8")
            return
    else:
        title = "未命名会话"
        if request.messages:
            first_content = (request.messages[0].content or "").strip()
            if first_content:
                title = first_content[:50] + ("…" if len(first_content) > 50 else "")
        session = ChatSession(
            user_id=current_user.id,
            student_id=request.student_id,
            title=title,
        )
        db.add(session)
        db.flush()

    last_user = request.messages[-1] if request.messages else None
    # 已有会话且最后一条已是该用户消息（编辑后重新生成）：只追加助手回复，不再重复写入用户消息
    skip_last_user = False
    if session_id is not None and last_user and last_user.role == "user":
        last_in_db = (
            db.query(ChatMessageModel)
            .filter(ChatMessageModel.session_id == session.id)
            .order_by(ChatMessageModel.id.desc())
            .limit(1)
            .first()
        )
        if last_in_db and last_in_db.role == "user" and (last_in_db.content or "").strip() == (last_user.content or "").strip():
            skip_last_user = True
    if last_user and not skip_last_user:
        db.add(
            ChatMessageModel(
                session_id=session.id,
                role=last_user.role,
                content=last_user.content,
            )
        )
    db.add(
        ChatMessageModel(
            session_id=session.id,
            role="assistant",
            content=full_content,
        )
    )
    db.commit()
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
    knowledge_point = (request.knowledge_point or "").strip()
    use_kb = request.use_knowledge_base and bool(knowledge_point)
    if use_kb:
        sub = get_current_subscription(current_user, db)
        require_feature(sub, "rag", current_user)
    student_name = None
    if request.student_id is not None:
        row = db.get(Student, request.student_id)
        _require_own_student(row, current_user)
        student_name = (row.name or "").strip() or "学生"
    system_prompt = CHAT_SYSTEM_PROMPT_DEFAULT
    if student_name or knowledge_point:
        parts = ["当前辅导上下文："]
        if student_name:
            parts.append(f"辅导对象：{student_name}。")
        if knowledge_point:
            parts.append(f"知识点：{knowledge_point}。")
        parts.append("请结合学情与上述资料回答，数学公式用 LaTeX，用 $...$ 包裹。")
        system_prompt = " ".join(parts)
    if request.student_id is not None:
        weak_points, mistake_summaries = _get_student_context_for_chat(db, request.student_id, current_user.id)
        if weak_points:
            system_prompt += "\n\n该生薄弱知识点：" + "、".join(weak_points) + "。"
        if mistake_summaries:
            system_prompt += "\n\n近期待巩固错题（摘要）：\n" + "\n".join(mistake_summaries)
    stream_rag_sources: list[str] = []
    if use_kb:
        try:
            rag = get_rag_service(llm_config)
            last_user_content = (request.messages[-1].content or "").strip() if request.messages else ""
            kb_context, stream_rag_sources = rag.search_context_for_chat_with_sources(
                last_user_content, knowledge_point=knowledge_point or None, n_results=RAG_TOP_K
            )
            if kb_context and kb_context.strip():
                system_prompt += "\n\n参考知识库：\n" + kb_context.strip()
        except Exception as e:
            logger.warning("RAG 检索失败，继续不带知识库对话: %s", e)
            stream_rag_sources = []
    context_question = (request.context_question or "").strip()
    if context_question:
        system_prompt += "\n\n用户当前关注的题目如下，回答时可针对此题讲解、出变式或指出易错点：\n" + context_question

    return StreamingResponse(
        _stream_chat_response(request, system_prompt, llm_config, db, current_user, stream_rag_sources),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/sessions", response_model=list[ChatSessionItem])
def list_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ChatSession]:
    """当前用户的对话会话列表：固定会话在前，再按创建时间倒序。"""
    sessions = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.pinned.desc(), ChatSession.created_at.desc())
        .all()
    )
    return sessions


@router.patch("/sessions/{session_id}", response_model=ChatSessionItem)
def update_session(
    session_id: int,
    body: ChatSessionPinUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatSession:
    """固定/取消固定会话。"""
    session = db.get(ChatSession, session_id)
    if session is None or session.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="会话不存在")
    try:
        session.pinned = body.pinned
        db.commit()
        db.refresh(session)
        return session
    except Exception as e:
        db.rollback()
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions/{session_id}/messages", response_model=list[ChatMessageItem])
def get_session_messages(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ChatMessageModel]:
    """获取某会话的历史消息，需归属当前用户。"""
    session = db.get(ChatSession, session_id)
    if session is None or session.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="会话不存在")
    messages = (
        db.query(ChatMessageModel)
        .filter(ChatMessageModel.session_id == session_id)
        .order_by(ChatMessageModel.created_at.asc())
        .all()
    )
    return messages


@router.patch("/sessions/{session_id}/messages/{message_id}", response_model=ChatMessageItem)
def update_session_message(
    session_id: int,
    message_id: int,
    body: ChatMessageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatMessageModel:
    """修改已发送的消息内容（仅 user 消息），并截断该条之后的所有消息（Gemini 式编辑后重新生成）。"""
    session = db.get(ChatSession, session_id)
    if session is None or session.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="会话不存在")
    msg = db.get(ChatMessageModel, message_id)
    if msg is None or msg.session_id != session_id or msg.role != "user":
        raise HTTPException(status_code=404, detail="消息不存在或不可编辑")
    try:
        msg.content = body.content.strip()
        # 截断：删除该条之后的所有消息，便于前端“从此处重新生成”
        db.query(ChatMessageModel).filter(
            ChatMessageModel.session_id == session_id,
            ChatMessageModel.id > message_id,
        ).delete(synchronize_session=False)
        db.commit()
        db.refresh(msg)
        return msg
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
    session = db.get(ChatSession, session_id)
    if session is None or session.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="会话不存在")
    try:
        db.query(ChatMessageModel).filter(ChatMessageModel.session_id == session_id).delete()
        db.delete(session)
        db.commit()
        return {"ok": True}
    except Exception as e:
        db.rollback()
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
