import json
import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.core.deps import LLMConfig, get_llm_config
from app.core.prompts import (
    AFTER_CLASS_COMMENT_PROMPT,
    LEARNING_REPORT_PARSE_PROMPT,
    POLISH_DRAFT_PROMPT,
    POLISH_DRAFT_WITH_TEMPLATE_PROMPT,
)
from app.models.base import get_db
from app.models.student import Student
from app.models.user import User
from app.schemas.report_dto import (
    AfterClassCommentRequest,
    AfterClassCommentResponse,
    LearningReportParseRequest,
    LearningReportParseResponse,
    WeakPointItem,
)
from app.schemas.report_snapshot_dto import ReportPeriod, StudentReportSnapshot
from app.services.llm_service import chat_completion_async
from app.services.report_pdf_service import (
    build_student_report_pdf_buffer,
    report_pdf_response,
    require_own_student,
)
from app.services.report_snapshot_service import build_student_report_snapshot

logger = logging.getLogger(__name__)
router = APIRouter()


def _require_api_key(llm_config: LLMConfig) -> None:
    if not (llm_config.api_key or "").strip():
        raise HTTPException(
            status_code=400,
            detail="未配置 API Key。请在前端「设置」中填写，或在后端 .env 中设置 LLM_API_KEY。",
        )


def _build_after_class_prompt(body: AfterClassCommentRequest) -> str:
    draft = (body.draft or "").strip()
    template = (body.template or "").strip()
    if draft:
        prompt = (
            POLISH_DRAFT_WITH_TEMPLATE_PROMPT.format(template=template, draft=draft)
            if template
            else POLISH_DRAFT_PROMPT.format(draft=draft)
        )
    else:
        focus_stars = "★" * body.focus_level + "☆" * (5 - body.focus_level)
        mastery_stars = "★" * body.mastery_level + "☆" * (5 - body.mastery_level)
        keywords_text = "、".join(
            (keyword or "").strip() for keyword in (body.keywords or []) if (keyword or "").strip()
        ) or "（无）"
        prompt = AFTER_CLASS_COMMENT_PROMPT.format(
            focus_stars=focus_stars,
            mastery_stars=mastery_stars,
            keywords_text=keywords_text,
        )

    student_name = (body.student_name or "").strip()
    if student_name:
        prompt += f"\n\n**学生姓名**：{student_name}。请在评语中自然称呼。"
    return prompt


def _normalize_comment(content: str) -> str:
    comment = (content or "").strip()
    if not comment:
        raise ValueError("AI 未返回有效评语")
    for prefix in ("评语：", "评语:", "家长您好，", "家长您好:"):
        if comment.startswith(prefix):
            return comment[len(prefix) :].strip()
    return comment


@router.post("/after-class", response_model=AfterClassCommentResponse)
async def generate_after_class_comment(
    body: AfterClassCommentRequest,
    llm_config: LLMConfig = Depends(get_llm_config),
    current_user: User = Depends(get_current_user),
) -> AfterClassCommentResponse:
    """Generate or polish an after-class parent-facing comment."""
    _require_api_key(llm_config)
    prompt = _build_after_class_prompt(body)
    messages = [{"role": "user", "content": prompt}]
    try:
        content = await chat_completion_async(
            messages,
            None,
            llm_config,
            temperature=0.6,
            max_tokens=512,
        )
        return AfterClassCommentResponse(comment=_normalize_comment(content))
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("after_class_comment_failed external_error_type=%s", type(e).__name__)
        raise HTTPException(status_code=500, detail="REPORT_PROVIDER_ERROR: 评语生成失败，请稍后重试。") from None


def _strip_json_markdown(text: str) -> str:
    if not text:
        return ""
    text = text.strip().lstrip("\ufeff")
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if match:
        return match.group(1).strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*\n?", "", text, count=1).strip()
    return text


def _parse_learning_report_payload(raw: str) -> LearningReportParseResponse:
    cleaned = _strip_json_markdown(raw)
    data = json.loads(cleaned or raw)
    mastered = data.get("mastered")
    weak_points = data.get("weak_points")
    estimated_hours = data.get("estimated_hours", 0)

    if not isinstance(mastered, list):
        mastered = []
    if not isinstance(weak_points, list):
        weak_points = []

    weak_items: list[WeakPointItem] = []
    for item in weak_points:
        if isinstance(item, dict) and item.get("point"):
            weak_items.append(
                WeakPointItem(
                    point=str(item.get("point", "")).strip(),
                    description=str(item.get("description", "")).strip() or None,
                )
            )
        elif isinstance(item, str) and item.strip():
            weak_items.append(WeakPointItem(point=item.strip(), description=None))

    try:
        estimated_hours = max(0, min(99, int(estimated_hours)))
    except (TypeError, ValueError):
        estimated_hours = 0

    return LearningReportParseResponse(
        mastered=[str(item).strip() for item in mastered if str(item).strip()],
        weak_points=weak_items,
        estimated_hours=estimated_hours,
    )


@router.post("/learning-visual", response_model=LearningReportParseResponse)
async def parse_learning_report(
    body: LearningReportParseRequest,
    llm_config: LLMConfig = Depends(get_llm_config),
    current_user: User = Depends(get_current_user),
) -> LearningReportParseResponse:
    """Parse a free-form learning report draft into visualizable structured data."""
    _require_api_key(llm_config)
    draft = (body.draft or "").strip()
    if not draft:
        raise HTTPException(status_code=400, detail="请提供学情描述内容。")

    prompt = LEARNING_REPORT_PARSE_PROMPT.format(draft=draft)
    messages = [{"role": "user", "content": prompt}]
    try:
        content = await chat_completion_async(
            messages,
            None,
            llm_config,
            temperature=0.2,
            max_tokens=1024,
        )
        return _parse_learning_report_payload((content or "").strip())
    except json.JSONDecodeError as e:
        logger.warning("learning_report_response_invalid error_type=%s", type(e).__name__)
        raise HTTPException(status_code=400, detail="AI 返回格式无法解析，请简化描述后重试。")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("learning_report_parse_failed external_error_type=%s", type(e).__name__)
        raise HTTPException(status_code=500, detail="REPORT_PROVIDER_ERROR: 学情报告解析失败，请稍后重试。") from None


def _build_own_student_report_pdf(
    db: Session,
    current_user: User,
    student_id: int,
    period: ReportPeriod,
):
    """own-student → snapshot → PDF 的唯一路径；canonical 与 legacy 共用。"""
    student = require_own_student(db.get(Student, student_id), current_user)
    snapshot = build_student_report_snapshot(db, student, period)
    buffer = build_student_report_pdf_buffer(snapshot)
    return report_pdf_response(buffer)


@router.get("/students/{student_id}/snapshot", response_model=StudentReportSnapshot)
def get_student_report_snapshot_api(
    response: Response,
    student_id: int,
    period: ReportPeriod = Query(default="all_time"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StudentReportSnapshot:
    """canonical snapshot：DB → build_student_report_snapshot → StudentReportSnapshot。

    foreign / missing student 一律 404（不泄漏他租户学生存在性）；无 admin bypass。
    """
    try:
        student = require_own_student(db.get(Student, student_id), current_user)
        snapshot = build_student_report_snapshot(db, student, period)
        # REPORT-SNAPSHOT-CACHE-01：学生学情 JSON 与 PDF 同级敏感数据，禁止缓存。
        response.headers["Cache-Control"] = "private, no-store"
        return snapshot
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "student_report_snapshot_failed user_id=%s student_id=%s period=%s error_type=%s",
            current_user.id,
            student_id,
            period,
            type(e).__name__,
        )
        raise HTTPException(status_code=500, detail="REPORT_SNAPSHOT_ERROR: 生成学情快照失败，请稍后重试。") from None


@router.get("/students/{student_id}/pdf")
def get_student_report_pdf_canonical(
    student_id: int,
    period: ReportPeriod = Query(default="all_time"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """canonical teacher PDF：与 snapshot API 共用同一 snapshot，PDF 仅是纯展示层。"""
    try:
        return _build_own_student_report_pdf(db, current_user, student_id, period)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "student_report_pdf_failed user_id=%s student_id=%s period=%s error_type=%s",
            current_user.id,
            student_id,
            period,
            type(e).__name__,
        )
        raise HTTPException(status_code=500, detail="REPORT_GENERATION_ERROR: 生成报告失败。") from None


@router.get("/{student_id}")
def get_student_report_pdf_legacy(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """legacy compatibility wrapper：固定 all_time，与 canonical PDF 共用
    snapshot / renderer / headers，不再保留旧 DB 计算路径。"""
    try:
        return _build_own_student_report_pdf(db, current_user, student_id, "all_time")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "student_report_pdf_legacy_failed user_id=%s student_id=%s error_type=%s",
            current_user.id,
            student_id,
            type(e).__name__,
        )
        raise HTTPException(status_code=500, detail="REPORT_GENERATION_ERROR: 生成报告失败。") from None
