"""
试卷上传解析：Word/PDF 文档解析为结构化题目。
支持 .docx 与 .pdf；含图试卷可先转 PDF 再按页识图（需 LibreOffice + 视觉模型）。
使用与智能出题相同的前端「设置」配置（请求头 x-llm-*）。
"""
import logging
import traceback
from io import BytesIO

from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile
from pypdf import PdfReader

from app.core.config import DEEPSEEK_BASE_URL, DEEPSEEK_MODEL
from app.core.deps import LLMConfig, get_llm_config
from app.services.docx_to_pdf import convert_docx_to_pdf
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
):
    """
    上传 .docx 或 .pdf 试卷，解析为题目 JSON 数组。
    - .docx：优先尝试 Word→PDF→按页识图（需安装 LibreOffice）；失败则回退为纯文本 + AI 解析。
    - .pdf：按页渲染成图后由视觉模型识别；若无图或识图失败则回退为 PDF 文本 + AI 解析。
    使用前端「设置」中的 API Key 与 Base URL。
    返回 { "questions": [...] }。
    """
    filename = (file.filename or "").strip().lower()
    if not filename.endswith(".docx") and not filename.endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="仅支持 .docx 或 .pdf 格式",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="文件为空")

    api_key = (llm_config.api_key or "").strip()
    base_url = llm_config.base_url or DEEPSEEK_BASE_URL
    model = llm_config.model or DEEPSEEK_MODEL

    def _text_fallback_docx() -> list:
        file_stream = BytesIO(content)
        text = extract_text_from_docx(file_stream)
        if not text or not text.strip():
            raise HTTPException(
                status_code=400,
                detail="文档中未解析出有效文本，请检查文件内容",
            )
        return parse_with_deepseek(
            text, api_key=api_key, base_url=base_url, model=model, provider=llm_config.provider
        )

    def _text_fallback_pdf(pdf_bytes: bytes) -> list:
        text = _extract_text_from_pdf_bytes(pdf_bytes)
        if not text:
            raise HTTPException(
                status_code=400,
                detail="PDF 中未解析出有效文本，请检查文件内容",
            )
        return parse_with_deepseek(
            text, api_key=api_key, base_url=base_url, model=model, provider=llm_config.provider
        )

    try:
        if filename.endswith(".pdf"):
            pdf_bytes = content
        else:
            pdf_bytes = convert_docx_to_pdf(content)
            if pdf_bytes is None:
                logger.info("Word→PDF 未可用，使用纯文本解析 .docx")
                questions = _text_fallback_docx()
                return {"questions": questions}

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
                    provider=llm_config.provider,
                )
                attach_question_images_from_page(img_bytes, page_q)
                pages_questions.append(page_q)
            except Exception as e:
                if first_vision_error is None:
                    first_vision_error = e
                    logger.warning("第 %s 页识图失败，跳过该页: %s", i + 1, e, exc_info=True)
                else:
                    logger.warning("第 %s 页识图失败，跳过该页: %s", i + 1, e)
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
        logger.warning("试卷解析参数或 API 错误: %s", e)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("试卷解析失败")
        raise HTTPException(
            status_code=500,
            detail=f"解析失败: {str(e)}",
        )


@router.post("/generate-analysis")
async def generate_analysis(
    body: dict = Body(..., description="含 questions 数组，每题含 content/options/answer 等"),
    llm_config: LLMConfig = Depends(get_llm_config),
):
    """
    为导入的试卷题目批量生成解析（analysis）。
    请求体：{ "questions": [ { "content", "options", "answer", ... }, ... ] }
    返回：{ "questions": [ ... ] }，与输入同序，仅 analysis 字段由 AI 填充或覆盖。
    使用前端「设置」中的 API Key 与模型。
    """
    questions = body.get("questions") if isinstance(body.get("questions"), list) else []
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
        traceback.print_exc()
        logger.exception("生成解析失败")
        raise HTTPException(
            status_code=500,
            detail=f"生成解析失败: {str(e)[:200]}",
        )
