"""
AI 鍑洪鎺ュ彛锛氭帴鏀跺墠绔弬鏁颁笌璇锋眰澶翠腑鐨?LLM 閰嶇疆锛岃皟鐢?llm_service锛岃繑鍥為鐩垪琛ㄣ€?"""
import logging
import traceback

from fastapi import APIRouter, Body, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.core.deps import LLMConfig, get_llm_config
from app.core.subscription import get_current_subscription, require_feature
from app.models.base import get_db
from app.models.user import User
from app.schemas.generation import (
    ExamGenerateRequest,
    GenerateRequest,
    QuestionItem,
    WeakPointGenerateRequest,
)
from app.services.llm_service import generate_full_exam_paper, generate_questions_async, verify_question_async
from app.services.weak_point_service import get_weak_points_for_student

logger = logging.getLogger(__name__)
router = APIRouter()




@router.post("/generate/weak-point")
async def api_generate_weak_point(
    request: WeakPointGenerateRequest,
    response: Response,
    llm_config: LLMConfig = Depends(get_llm_config),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    涓€閿寜寮遍」鍑洪锛堝璇惧寘锛夛細鏍规嵁璇ョ敓閿欓鏈腑寰呮帉鎻＄煡璇嗙偣鐢熸垚宸╁浐棰樸€?    浠呭彲涓烘湰鐢ㄦ埛鍚嶄笅瀛︾敓鍑洪锛涜嫢鏃犲急椤瑰垯杩斿洖 400銆?    """
    weak_points = get_weak_points_for_student(db, request.student_id, current_user.id)
    if not weak_points:
        raise HTTPException(
            status_code=400,
            detail="该学生暂无弱项知识点，请先录入错题或完成试卷批改后再生成。",
        )
    if request.use_knowledge_base:
        sub = get_current_subscription(current_user, db)
        require_feature(sub, "rag", current_user)
    if not (llm_config.api_key or "").strip():
        raise HTTPException(
            status_code=400,
            detail="未配置 API Key。请在前端设置中填写，或在后端 .env 中配置 LLM_API_KEY。",
        )
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
        result, rag_used = await generate_questions_async(gen_request, llm_config, owner_user_id=current_user.id)
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
        logger.exception("鎸夊急椤瑰嚭棰樻椂鍑洪敊")
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
    鏅鸿兘鍑洪锛氭牴鎹煡璇嗙偣銆侀毦搴︺€侀鍨嬪拰鏁伴噺鐢熸垚鏁板棰樸€?    鍚屾杈呭 (scenario=sync) 鏃惰繑鍥?{ knowledge_card, examples, questions }锛?    鍏朵粬鍦烘櫙杩斿洖棰樼洰鍒楄〃銆傚惎鐢ㄧ煡璇嗗簱鏃堕€氳繃鍝嶅簲澶?X-RAG-Used 鍛婄煡鏄惁鍛戒腑銆?    """
    if request.use_knowledge_base:
        sub = get_current_subscription(current_user, db)
        require_feature(sub, "rag", current_user)
    if not (llm_config.api_key or "").strip():
        raise HTTPException(
            status_code=400,
            detail="未配置 API Key。请在前端设置中填写，或在后端 .env 中配置 LLM_API_KEY。",
        )
    try:
        result, rag_used = await generate_questions_async(request, llm_config, owner_user_id=current_user.id)
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
    鐢熸垚瀹屾暣璇曞嵎锛? 閬撻€夋嫨棰?+ 8 閬撳～绌洪 + 12 閬撹В绛旈锛堝叡 28 棰橈級锛?    绗﹀悎鐭ヨ瘑鐐逛笌闅惧害锛? 涓垎鍧楀苟鍙戞墽琛岋紝鍗曞潡澶辫触鏃惰繑鍥炲凡鐢熸垚閮ㄥ垎銆傚惎鐢ㄧ煡璇嗗簱鏃堕€氳繃 X-RAG-Used 鍛婄煡鏄惁鍛戒腑銆?    """
    if request.use_knowledge_base:
        sub = get_current_subscription(current_user, db)
        require_feature(sub, "rag", current_user)
    if not (llm_config.api_key or "").strip():
        raise HTTPException(
            status_code=400,
            detail="未配置 API Key。请在前端设置中填写，或在后端 .env 中配置 LLM_API_KEY。",
        )
    try:
        questions, rag_used = await generate_full_exam_paper(request, llm_config, owner_user_id=current_user.id)
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
    body: dict = Body(..., description="寰呮牎瀵圭殑棰樼洰瀵硅薄 (content, options, answer, analysis 绛?"),
    llm_config: LLMConfig = Depends(get_llm_config),
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    棰樼洰鏍″锛氭鏌ュ苟淇鍗曢亾棰樼洰鐨勮绠楅敊璇€侀€昏緫婕忔礊銆佹牸寮忎笌瑙ｆ瀽锛岃繑鍥炰慨姝ｅ悗鐨勯鐩璞°€?    """
    if not (llm_config.api_key or "").strip():
        raise HTTPException(
            status_code=400,
            detail="未配置 API Key。请在前端设置中填写，或在后端 .env 中配置 LLM_API_KEY。",
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
