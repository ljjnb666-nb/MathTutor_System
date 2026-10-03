"""
工具类 API：PPT 生成等。
"""
import logging
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.core.deps import LLMConfig, get_llm_config
from app.core.subscription import get_current_subscription, require_feature
from app.models.base import get_db
from app.models.user import User
from app.schemas.ppt_dto import PPTContent, PPTSlide
from app.services.ppt_service import PPTLayoutUnfitError, create_pptx_file, generate_lecture_content

logger = logging.getLogger(__name__)
router = APIRouter()


class GeneratePPTRequest(BaseModel):
    topic: str = Field(..., min_length=1, max_length=255, description="主题，如 Pythagorean Theorem")
    grade: str = Field(default="Middle", max_length=64, description="学段：Primary | Middle | High School")


def _sanitize_pptx_filename(name: str) -> str:
    """只保留安全字符，并确保以 .pptx 结尾。"""
    if not name or not name.strip():
        return "Lesson.pptx"
    s = "".join(c for c in name.strip() if c.isalnum() or c in " _-（）()（）")
    s = s.strip() or "Lesson"
    return s + ".pptx" if not s.lower().endswith(".pptx") else s


def _content_disposition(filename: str) -> str:
    """RFC 5987：HTTP 头只能 latin-1，中文文件名用 filename* 传递，ASCII 兜底。"""
    ascii_fallback = filename if filename.isascii() else "Lesson.pptx"
    return f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{quote(filename)}"


class BuildPPTRequest(BaseModel):
    """构建请求：幻灯片结构由规范 DTO（app/schemas/ppt_dto.py）唯一校验。"""

    title: str = Field(default="", max_length=255, description="演示文稿标题")
    slides: list[PPTSlide] = Field(..., min_length=1, max_length=30, description="幻灯片列表，最多 30 页")
    filename: str | None = Field(None, max_length=180, description="下载时使用的文件名（不含路径），不含 .pptx 则自动追加")


@router.post("/generate-ppt")
def api_generate_ppt(
    body: GeneratePPTRequest,
    llm_config: LLMConfig = Depends(get_llm_config),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    根据主题与学段生成讲稿内容（JSON），供前端预览；不返回文件。需专业版及以上套餐。
    """
    sub = get_current_subscription(current_user, db)
    require_feature(sub, "magic_ppt", current_user, db)
    topic = (body.topic or "").strip()
    grade = (body.grade or "Middle").strip() or "Middle"

    if not topic:
        raise HTTPException(status_code=400, detail="请填写主题 (topic)。")

    try:
        content = generate_lecture_content(
            topic=topic,
            grade=grade,
            llm_config=llm_config,
            api_key=llm_config.api_key,
            base_url=llm_config.base_url,
            model=llm_config.model,
        )
        return content
    except ValueError as e:
        logger.warning("ppt_generation_failed error_type=%s", type(e).__name__)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("ppt_generation_failed external_error_type=%s", type(e).__name__)
        raise HTTPException(status_code=500, detail="PPT_GENERATION_ERROR: 讲稿生成失败，请稍后重试。") from None


@router.post("/build-pptx")
def api_build_pptx(
    body: BuildPPTRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    根据已有讲稿 JSON 生成 .pptx 文件并返回，供「下载 PPT」使用。需专业版及以上套餐。
    """
    sub = get_current_subscription(current_user, db)
    require_feature(sub, "magic_ppt", current_user, db)
    try:
        content = PPTContent(title=body.title or "Lesson", slides=body.slides)
        if not content.slides:
            raise HTTPException(status_code=400, detail="slides 不能为空")
        buffer = create_pptx_file(content.model_dump())
        filename = _sanitize_pptx_filename(body.filename or "")
        return Response(
            content=buffer.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            headers={
                "Content-Disposition": _content_disposition(filename),
            },
        )
    except HTTPException:
        raise
    except PPTLayoutUnfitError as exc:
        # schema 合法但物理不可渲染：受控业务错误，不泄漏字段内容/几何/异常类。
        logger.warning("pptx_build_layout_unfit reason=%s", exc.reason)
        raise HTTPException(
            status_code=422,
            detail="PPT_LAYOUT_UNFIT: 当前幻灯片内容过多，无法在单页中完整排版，请减少内容后重试。",
        ) from None
    except Exception as e:
        logger.error("pptx_build_failed error_type=%s", type(e).__name__)
        raise HTTPException(status_code=500, detail="PPT_BUILD_ERROR: PPT 文件构建失败。") from None
