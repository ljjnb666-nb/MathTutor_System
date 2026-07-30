from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.chat_session import ChatMessage as ChatMessageModel
from app.models.chat_session import ChatSession
from app.schemas.chat_dto import ChatRequest


def get_user_session_or_404(db: Session, session_id: int, user_id: int) -> ChatSession:
    session = db.get(ChatSession, session_id)
    if session is None or session.user_id != user_id:
        raise HTTPException(status_code=404, detail="会话不存在")
    return session


def _build_session_title(request: ChatRequest) -> str:
    title = "未命名会话"
    if request.messages:
        first_content = (request.messages[0].content or "").strip()
        if first_content:
            title = first_content[:50] + ("…" if len(first_content) > 50 else "")
    return title


def persist_chat_turn(
    db: Session,
    request: ChatRequest,
    user_id: int,
    assistant_content: str,
) -> ChatSession:
    session_id: int | None = request.session_id
    if session_id is not None:
        session = get_user_session_or_404(db, session_id, user_id)
    else:
        session = ChatSession(
            user_id=user_id,
            student_id=request.student_id,
            title=_build_session_title(request),
        )
        db.add(session)
        db.flush()

    last_message = request.messages[-1] if request.messages else None
    skip_last_user = False
    if session_id is not None and last_message and last_message.role == "user":
        last_in_db = (
            db.query(ChatMessageModel)
            .filter(ChatMessageModel.session_id == session.id)
            .order_by(ChatMessageModel.id.desc())
            .limit(1)
            .first()
        )
        if (
            last_in_db
            and last_in_db.role == "user"
            and (last_in_db.content or "").strip() == (last_message.content or "").strip()
        ):
            skip_last_user = True

    if last_message and not skip_last_user:
        db.add(
            ChatMessageModel(
                session_id=session.id,
                role=last_message.role,
                content=last_message.content,
            )
        )
    db.add(
        ChatMessageModel(
            session_id=session.id,
            role="assistant",
            content=assistant_content,
        )
    )
    db.commit()
    return session


def list_user_sessions(db: Session, user_id: int) -> list[ChatSession]:
    return (
        db.query(ChatSession)
        .filter(ChatSession.user_id == user_id)
        .order_by(ChatSession.pinned.desc(), ChatSession.created_at.desc())
        .all()
    )


def update_session_pin(db: Session, session_id: int, user_id: int, pinned: bool) -> ChatSession:
    session = get_user_session_or_404(db, session_id, user_id)
    session.pinned = pinned
    db.commit()
    db.refresh(session)
    return session


def list_session_messages(db: Session, session_id: int, user_id: int) -> list[ChatMessageModel]:
    get_user_session_or_404(db, session_id, user_id)
    return (
        db.query(ChatMessageModel)
        .filter(ChatMessageModel.session_id == session_id)
        .order_by(ChatMessageModel.created_at.asc())
        .all()
    )


def update_user_message(
    db: Session,
    session_id: int,
    message_id: int,
    user_id: int,
    content: str,
) -> ChatMessageModel:
    get_user_session_or_404(db, session_id, user_id)
    msg = db.get(ChatMessageModel, message_id)
    if msg is None or msg.session_id != session_id or msg.role != "user":
        raise HTTPException(status_code=404, detail="消息不存在或不可编辑")

    msg.content = content.strip()
    db.query(ChatMessageModel).filter(
        ChatMessageModel.session_id == session_id,
        ChatMessageModel.id > message_id,
    ).delete(synchronize_session=False)
    db.commit()
    db.refresh(msg)
    return msg


def delete_user_session(db: Session, session_id: int, user_id: int) -> dict:
    session = get_user_session_or_404(db, session_id, user_id)
    db.query(ChatMessageModel).filter(ChatMessageModel.session_id == session_id).delete()
    db.delete(session)
    db.commit()
    return {"ok": True}
