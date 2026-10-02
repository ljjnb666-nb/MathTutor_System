"""
试卷上传解析：Word/PDF 文档解析为结构化题目。
支持 .docx 与 .pdf；含图试卷可先转 PDF 再按页识图（需 LibreOffice + 视觉模型）。
使用与智能出题相同的前端「设置」配置（请求头 x-llm-*）。
"""
import json
import logging
from io import BytesIO

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict, Field, model_validator
from pypdf import PdfReader

from app.api.endpoints.auth import get_current_user
from app.core.deps import LLMConfig, get_llm_config
from app.models.user import User
from app.services.docx_to_pdf import convert_docx_to_pdf
from app.services.document_safety import DocumentSafetyError, preflight_document
from app.services.pdf_to_images import pdf_pages_to_images
from app.services.llm_service import generate_analysis_for_questions_async
from app.services.word_parser import (
    attach_question_images_from_page,
    extract_text_from_docx,
    merge_page_questions,
    parse_page_image_with_vision,
    parse_with_deepseek,
)

logger = logging.getLogger(__name__)
router = APIRouter()
MAX_UPLOAD_BYTES = 12 * 1024 * 1024
MAX_ANALYSIS_QUESTIONS = 50
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream",
}


class AnalysisQuestionItem(BaseModel):
    """待生成解析的单题输入；未知扩展字段一并限长，防止无限 payload。"""

    model_config = ConfigDict(extra="allow")

    content: str = Field(..., min_length=1, max_length=8000, description="题干")
    options: list[str] = Field(default_factory=list, max_length=10, description="选项（选择题）")
    answer: str = Field(default="", max_length=4000, description="答案")
    analysis: str = Field(default="", max_length=4000, description="已有解析（将被覆盖）")
    question_type: str = Field(default="", max_length=64, description="题型")
    difficulty: str = Field(default="", max_length=8, description="难度")
    knowledge_point: str = Field(default="", max_length=255, description="知识点")

    @model_validator(mode="after")
    def _bound_option_and_extra_lengths(self) -> "AnalysisQuestionItem":
        for option in self.options:
            if len(option) > 2000:
                raise ValueError("单个选项不能超过 2000 字符")
        extras = self.__pydantic_extra__ or {}
        if len(extras) > 20:
            raise ValueError("扩展字段数量过多")
        for key, value in extras.items():
            if len(json.dumps(value, ensure_ascii=False, default=str)) > 4000:
                raise ValueError(f"扩展字段 {key} 过长")
        return self


class GenerateAnalysisRequest(BaseModel):
    """批量生成解析请求（SEC-08：题目数量与单题字段全部有界）。"""

    questions: list[AnalysisQuestionItem] = Field(
        ...,
        min_length=1,
        max_length=MAX_ANALYSIS_QUESTIONS,
        description=f"题目列表，最多 {MAX_ANALYSIS_QUESTIONS} 题",
    )


def _validate_exam_upload(file: UploadFile, content: bytes) -> str:
    filename = (file.filename or "").strip().lower()
    if not filename.endswith(".docx") and not filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only .docx and .pdf files are supported")
    if file.content_type and file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    if not content:
        raise HTTPException(status_code=400, detail="File is empty")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File is too large")
    # SEC-05: same preflight authority as RAG, with the tighter exam page cap.
    try:
        preflight_document(content, filename, profile="exam")
    except DocumentSafetyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    return filename


def _extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    """从 PDF 字节提取纯文本，用于识图不可用时的回退。"""
    reader = PdfReader(BytesIO(pdf_bytes))
    parts = []
    for page in reader.pages:
        raw = page.extract_text()
        if raw:
            parts.append(raw)
    return "\n".join(parts).strip()


@router.post("/parse/word")
async def parse_word_exam(
    file: UploadFile = File(...),
    llm_config: LLMConfig = Depends(get_llm_config),
    current_user: User = Depends(get_current_user),
):
    """
    上传 .docx 或 .pdf 试卷，解析为题目 JSON 数组。
    - .docx：优先尝试 Word→PDF→按页识图（需安装 LibreOffice）；失败则回退为纯文本 + AI 解析。
    - .pdf：按页渲染成图后由视觉模型识别；若无图或识图失败则回退为 PDF 文本 + AI 解析。
    使用前端「设置」中的 API Key 与 Base URL。
    返回 { "questions": [...] }。
    """
    content = await file.read()
    filename = _validate_exam_upload(file, content)

    api_key = (llm_config.api_key or "").strip()
    base_url = llm_config.base_url
    model = llm_config.model

    def _text_fallback_docx() -> list:
        file_stream = BytesIO(content)
        text = extract_text_from_docx(file_stream)
        if not text or not text.strip():
            raise HTTPException(
                status_code=400,
                detail="文档中未解析出有效文本，请检查文件内容",
            )
        return parse_with_deepseek(
            text, api_key=api_key, base_url=base_url, model=model, provider=llm_config.provider, llm_config=llm_config
        )

    def _text_fallback_pdf(pdf_bytes: bytes) -> list:
        text = _extract_text_from_pdf_bytes(pdf_bytes)
        if not text:
            raise HTTPException(
                status_code=400,
                detail="PDF 中未解析出有效文本，请检查文件内容",
            )
        return parse_with_deepseek(
            text, api_key=api_key, base_url=base_url, model=model, provider=llm_config.provider, llm_config=llm_config
        )

    try:
        if filename.endswith(".pdf"):
            pdf_bytes = content
        else:
            pdf_bytes = convert_docx_to_pdf(content)
            if pdf_bytes is None:
                logger.info("Word→PDF 不可用，改用纯文本解析 .docx")
                questions = _text_fallback_docx()
                return {"questions": questions}
            # SEC-05: the LibreOffice output is re-bounded before rendering.
            try:
                preflight_document(pdf_bytes, "converted.pdf", profile="exam")
            except DocumentSafetyError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from None

        page_images = pdf_pages_to_images(pdf_bytes)
        if not page_images or not api_key:
            if filename.endswith(".pdf"):
                questions = _text_fallback_pdf(pdf_bytes)
            else:
                questions = _text_fallback_docx()
            return {"questions": questions}

        pages_questions: list[list] = []
        first_vision_error: Exception | None = None
        for i, img_bytes in enumerate(page_images):
            try:
                page_q = parse_page_image_with_vision(
                    img_bytes, api_key=api_key, base_url=base_url, model=model,
                    provider=llm_config.provider, llm_config=llm_config,
                )
                attach_question_images_from_page(img_bytes, page_q)
                pages_questions.append(page_q)
            except Exception as e:
                if first_vision_error is None:
                    first_vision_error = e
                    logger.warning("page_vision_failed page=%s external_error_type=%s", i + 1, type(e).__name__)
                else:
                    logger.warning("page_vision_failed page=%s external_error_type=%s", i + 1, type(e).__name__)
                pages_questions.append([])

        questions = merge_page_questions(pages_questions)
        if not questions:
            if filename.endswith(".pdf"):
                questions = _text_fallback_pdf(pdf_bytes)
            else:
                questions = _text_fallback_docx()
        return {"questions": questions}
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning("exam_parse_failed error_type=%s", type(e).__name__)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("exam_parse_failed external_error_type=%s", type(e).__name__)
        raise HTTPException(status_code=500, detail="DOCUMENT_PARSE_ERROR: 试卷解析失败，请检查文件后重试。") from None


@router.post("/generate-analysis")
async def generate_analysis(
    body: GenerateAnalysisRequest,
    llm_config: LLMConfig = Depends(get_llm_config),
    current_user: User = Depends(get_current_user),
):
    """
    为导入的试卷题目批量生成解析（analysis）。
    请求体：{ "questions": [ { "content", "options", "answer", ... }, ... ] }
    返回：{ "questions": [ ... ] }，与输入同序，仅 analysis 字段由 AI 填充或覆盖。
    使用前端「设置」中的 API Key 与模型。
    """
    questions = [q.model_dump(exclude_none=True) for q in body.questions]
    if not questions:
        raise HTTPException(status_code=400, detail="请提供 questions 数组")
    if not (llm_config.api_key or "").strip():
        raise HTTPException(
            status_code=400,
            detail="未配置 API Key。请在前端「设置」中填写。",
        )
    try:
        result = await generate_analysis_for_questions_async(questions, llm_config)
        return {"questions": result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("analysis_generation_failed external_error_type=%s", type(e).__name__)
        raise HTTPException(status_code=500, detail="LLM_PROVIDER_ERROR: 生成解析失败，请稍后重试。") from None
