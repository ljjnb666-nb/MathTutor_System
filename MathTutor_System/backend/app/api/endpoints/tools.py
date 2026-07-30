"""
工具类 API：PPT 生成等。
"""
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.core.config import DEEPSEEK_BASE_URL, DEEPSEEK_MODEL
from app.core.deps import LLMConfig, get_llm_config
from app.core.subscription import get_current_subscription, require_feature
from app.models.base import get_db
from app.models.user import User
from app.services.llm_key_test_service import test_llm_api_key
from app.services.ppt_service import create_pptx_file, generate_lecture_content

logger = logging.getLogger(__name__)
router = APIRouter()


class GeneratePPTRequest(BaseModel):
    topic: str = Field(..., description="主题，如 Pythagorean Theorem")
    grade: str = Field(default="Middle", description="学段：Primary | Middle | High School")


class LLMKeyTestResponse(BaseModel):
    ok: bool
    provider: str
    model: str
    base_url: str
    latency_ms: int
    message: str


class LLMKeyTestRequest(BaseModel):
    provider: str = Field(default="")
    api_key: str = Field(default="")
    base_url: str = Field(default="")
    model: str = Field(default="")


def _sanitize_pptx_filename(name: str) -> str:
    """只保留安全字符，并确保以 .pptx 结尾。"""
    if not name or not name.strip():
        return "Lesson.pptx"
    s = "".join(c for c in name.strip() if c.isalnum() or c in " _-（）()（）")
    s = s.strip() or "Lesson"
    return s + ".pptx" if not s.lower().endswith(".pptx") else s


class BuildPPTRequest(BaseModel):
    title: str = Field(default="", description="演示文稿标题")
    slides: list = Field(..., description="幻灯片列表，每项含 layout, title, subtitle?, bullets?")
    filename: str | None = Field(None, description="下载时使用的文件名（不含路径），不含 .pptx 则自动追加")


@router.post("/test-llm-key", response_model=LLMKeyTestResponse)
async def api_test_llm_key(
    body: LLMKeyTestRequest,
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Run a minimal authenticated LLM request without storing or returning the API key."""
    llm_config = LLMConfig(
        provider=body.provider.strip(),
        api_key=body.api_key.strip(),
        base_url=body.base_url.strip(),
        model=body.model.strip(),
    )
    return await test_llm_api_key(llm_config)


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
    require_feature(sub, "magic_ppt", current_user)
    topic = (body.topic or "").strip()
    grade = (body.grade or "Middle").strip() or "Middle"

    if not topic:
        raise HTTPException(status_code=400, detail="请填写主题 (topic)。")

    try:
        content = generate_lecture_content(
            topic=topic,
            grade=grade,
            api_key=llm_config.api_key,
            base_url=llm_config.base_url or DEEPSEEK_BASE_URL,
            model=llm_config.model or DEEPSEEK_MODEL,
        )
        return content
    except ValueError as e:
        logger.warning("PPT 生成参数或 AI 错误: %s", e)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("PPT 生成失败")
        raise HTTPException(status_code=500, detail=f"生成失败: {str(e)}")


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
    require_feature(sub, "magic_ppt", current_user)
    try:
        content = {"title": body.title or "Lesson", "slides": body.slides or []}
        if not content["slides"]:
            raise HTTPException(status_code=400, detail="slides 不能为空")
        buf = create_pptx_file(content)
        filename = _sanitize_pptx_filename(body.filename or "")
        return Response(
            content=buf.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("构建 PPT 文件失败")
        raise HTTPException(status_code=500, detail=f"构建失败: {str(e)}")
