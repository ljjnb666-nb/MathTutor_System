"""
AI 出题接口：接收前端参数与请求头中的 LLM 配置，调用 llm_service，返回题目列表。
"""
import logging
import traceback

from fastapi import APIRouter, Body, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.core.deps import LLMConfig, get_llm_config
from app.core.subscription import get_current_subscription, require_feature
from app.models.base import get_db
from app.models.mistake import MistakeRecord
from app.models.student import Student
from app.models.user import User
from app.schemas.generation import (
    ExamGenerateRequest,
    GenerateRequest,
    QuestionItem,
    WeakPointGenerateRequest,
)
from app.services.llm_service import generate_full_exam_paper, generate_questions_async, verify_question_async

logger = logging.getLogger(__name__)
router = APIRouter()


def _split_topics(topic_str: str | None) -> set[str]:
    """将可能为组合知识点的字符串（如 'A + B'）拆分为集合。"""
    if not topic_str or not str(topic_str).strip():
        return set()
    return {s.strip() for s in str(topic_str).split("+") if s.strip()}


def _get_weak_points_for_student(db: Session, student_id: int, user_id: int) -> list[str]:
    """获取指定学生的弱项知识点列表（pending 错题对应的 topic），学生须属于 user_id。"""
    student = db.get(Student, student_id)
    if student is None or (student.user_id is not None and student.user_id != user_id):
        return []
    mistakes = (
        db.query(MistakeRecord)
        .filter(
            MistakeRecord.student_id == student_id,
            MistakeRecord.status == "pending",
        )
        .all()
    )
    weak: set[str] = set()
    for m in mistakes:
        weak |= _split_topics(m.topic)
    return sorted(weak)


@router.post("/generate/weak-point")
async def api_generate_weak_point(
    request: WeakPointGenerateRequest,
    response: Response,
    llm_config: LLMConfig = Depends(get_llm_config),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    一键按弱项出题（备课包）：根据该生错题本中待掌握知识点生成巩固题。
    仅可为本用户名下学生出题；若无弱项则返回 400。
    """
    weak_points = _get_weak_points_for_student(db, request.student_id, current_user.id)
    if not weak_points:
        raise HTTPException(
            status_code=400,
            detail="该生暂无弱项知识点，请先在错题本中录入错题或完成试卷批改后再生成。",
        )
    if request.use_knowledge_base:
        sub = get_current_subscription(current_user, db)
        require_feature(sub, "rag", current_user)
    if not (llm_config.api_key or "").strip():
        raise HTTPException(
            status_code=400,
            detail="未配置 API Key。请在前端「设置」中填写，或在后端 .env 中设置 LLM_API_KEY。",
        )
    # 多个弱项用顿号拼接，供模型在一套题中覆盖
    knowledge_point = "、".join(weak_points[:8])
    gen_request = GenerateRequest(
        knowledge_point=knowledge_point,
        difficulty=request.difficulty,
        question_type=request.question_type,
        count=request.count,
        scenario="default",
        ref_content=None,
        student_id=request.student_id,
        use_knowledge_base=request.use_knowledge_base,
    )
    try:
        result, rag_used = await generate_questions_async(gen_request, llm_config)
        response.headers["X-RAG-Used"] = "true" if rag_used else "false"
        if isinstance(result, dict):
            return result
        questions = result
        questions = [q.model_copy(update={"student_id": request.student_id}) for q in questions]
        return questions
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        logger.exception("按弱项出题时出错")
        detail = str(e).strip() or "生成题目时出错，请检查 API 配置与网络后重试。"
        if len(detail) > 300:
            detail = detail[:300] + "..."
        raise HTTPException(status_code=500, detail=detail)


@router.post("/generate")
async def api_generate(
    request: GenerateRequest,
    response: Response,
    llm_config: LLMConfig = Depends(get_llm_config),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    智能出题：根据知识点、难度、题型和数量生成数学题。
    同步辅导 (scenario=sync) 时返回 { knowledge_card, examples, questions }；
    其他场景返回题目列表。启用知识库时通过响应头 X-RAG-Used 告知是否命中。
    """
    if request.use_knowledge_base:
        sub = get_current_subscription(current_user, db)
        require_feature(sub, "rag", current_user)
    if not (llm_config.api_key or "").strip():
        raise HTTPException(
            status_code=400,
            detail="未配置 API Key。请在前端「设置」中填写，或在后端 .env 中设置 LLM_API_KEY。",
        )
    try:
        result, rag_used = await generate_questions_async(request, llm_config)
        response.headers["X-RAG-Used"] = "true" if rag_used else "false"
        if isinstance(result, dict):
            return result
        questions = result
        if request.student_id is not None:
            questions = [q.model_copy(update={"student_id": request.student_id}) for q in questions]
        return questions
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        logger.exception("生成题目时出错")
        detail = str(e).strip() or "生成题目时出错，请检查 API 配置与网络后重试。"
        if len(detail) > 300:
            detail = detail[:300] + "..."
        raise HTTPException(status_code=500, detail=detail)


@router.post("/exam", response_model=list[QuestionItem])
async def api_generate_exam(
    request: ExamGenerateRequest,
    response: Response,
    llm_config: LLMConfig = Depends(get_llm_config),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[QuestionItem]:
    """
    生成完整试卷：8 道选择题 + 8 道填空题 + 12 道解答题（共 28 题），
    符合知识点与难度，4 个分块并发执行，单块失败时返回已生成部分。启用知识库时通过 X-RAG-Used 告知是否命中。
    """
    if request.use_knowledge_base:
        sub = get_current_subscription(current_user, db)
        require_feature(sub, "rag", current_user)
    if not (llm_config.api_key or "").strip():
        raise HTTPException(
            status_code=400,
            detail="未配置 API Key。请在前端「设置」中填写，或在后端 .env 中设置 LLM_API_KEY。",
        )
    try:
        questions, rag_used = await generate_full_exam_paper(request, llm_config)
        response.headers["X-RAG-Used"] = "true" if rag_used else "false"
        return questions
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        logger.exception("生成完整试卷时出错")
        detail = str(e).strip() or "生成完整试卷时出错，请检查 API 配置与网络后重试。"
        if len(detail) > 300:
            detail = detail[:300] + "..."
        raise HTTPException(status_code=500, detail=detail)


@router.post("/verify")
async def api_verify_question(
    body: dict = Body(..., description="待校对的题目对象 (content, options, answer, analysis 等)"),
    llm_config: LLMConfig = Depends(get_llm_config),
) -> dict:
    """
    题目校对：检查并修正单道题目的计算错误、逻辑漏洞、格式与解析，返回修正后的题目对象。
    """
    if not (llm_config.api_key or "").strip():
        raise HTTPException(
            status_code=400,
            detail="未配置 API Key。请在前端「设置」中填写，或在后端 .env 中设置 LLM_API_KEY。",
        )
    try:
        result = await verify_question_async(body, llm_config)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        logger.exception("题目校对时出错")
        detail = str(e).strip() or "题目校对失败，请检查 API 配置与网络后重试。"
        if len(detail) > 300:
            detail = detail[:300] + "..."
        raise HTTPException(status_code=500, detail=detail)