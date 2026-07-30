import logging
from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import RAG_TOP_K
from app.core.subscription import get_current_subscription, require_feature
from app.models.mistake import MistakeRecord
from app.models.student import Student
from app.models.user import User
from app.schemas.chat_dto import ChatRequest
from app.services.topic_service import split_topics

logger = logging.getLogger(__name__)

CHAT_SYSTEM_PROMPT_DEFAULT = """你是初中数学备课助手，可解答数学与备课相关问题。回答请简洁清晰。数学公式使用 LaTeX，用单个美元符号包裹，如 $x^2$、$\\frac{1}{2}$。"""


@dataclass(frozen=True)
class ChatContext:
    system_prompt: str
    rag_sources: list[str]


def require_own_student(row: Student | None, current_user: User) -> Student:
    if row is None:
        raise HTTPException(status_code=404, detail="学生不存在")
    if row.user_id is not None and row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="学生不存在")
    return row


def get_student_context_for_chat(
    db: Session, student_id: int, current_user_id: int, max_mistakes: int = 8
) -> tuple[list[str], list[str]]:
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
    for mistake in mistakes:
        weak_points |= split_topics(mistake.topic)
        content_preview = (mistake.content or "").strip()[:80]
        if content_preview:
            content_preview = content_preview.replace("\n", " ")
        suffix = "…" if len((mistake.content or "").strip()) > 80 else ""
        summaries.append(f"【{mistake.topic}】{content_preview}{suffix}")
    return (sorted(weak_points), summaries)


def build_chat_context(db: Session, request: ChatRequest, current_user: User, llm_config) -> ChatContext:
    knowledge_point = (request.knowledge_point or "").strip()
    use_kb = request.use_knowledge_base and bool(knowledge_point)
    if use_kb:
        sub = get_current_subscription(current_user, db)
        require_feature(sub, "rag", current_user)

    student_name: str | None = None
    if request.student_id is not None:
        row = db.get(Student, request.student_id)
        require_own_student(row, current_user)
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
        weak_points, mistake_summaries = get_student_context_for_chat(
            db, request.student_id, current_user.id
        )
        if weak_points:
            system_prompt += "\n\n该生薄弱知识点：" + "、".join(weak_points) + "。"
        if mistake_summaries:
            system_prompt += "\n\n近期待巩固错题（摘要）：\n" + "\n".join(mistake_summaries)

    rag_sources: list[str] = []
    if use_kb:
        try:
            from app.services.rag_service import get_rag_service

            rag = get_rag_service(llm_config)
            last_user_content = (request.messages[-1].content or "").strip() if request.messages else ""
            kb_context, rag_sources = rag.search_context_for_chat_with_sources(
                last_user_content, knowledge_point=knowledge_point or None, n_results=RAG_TOP_K
            )
            if kb_context and kb_context.strip():
                system_prompt += "\n\n参考知识库：\n" + kb_context.strip()
        except Exception as exc:
            logger.warning("RAG 检索失败，继续不带知识库对话: %s", exc)
            rag_sources = []

    context_question = (request.context_question or "").strip()
    if context_question:
        system_prompt += "\n\n用户当前关注的题目如下，回答时可针对该题讲解、出变式或指出易错点：\n" + context_question

    return ChatContext(system_prompt=system_prompt, rag_sources=rag_sources)
