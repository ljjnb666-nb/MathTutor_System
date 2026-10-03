"""PDF 按页渲染为图片，用于按页视觉识别题目。

SEC-05：渲染前先按页面几何计算像素预算，杜绝「渲染完才发现超限」。
单页像素与整份文档累计像素都有硬上限，畸形 PDF 无法制造数百 MB 的图片列表。
"""
import logging

from app.services.document_safety import (
    MAX_RENDERED_PIXELS_PER_PAGE,
    MAX_RENDERED_PIXELS_TOTAL,
    DocumentSafetyError,
)

logger = logging.getLogger(__name__)

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None


def pdf_pages_to_images(pdf_bytes: bytes, dpi: int = 150) -> list[bytes]:
    """
    将 PDF 每一页渲染为 PNG 图片字节。
    :param pdf_bytes: PDF 文件完整字节
    :param dpi: 渲染分辨率，默认 150
    :return: 每页一张 PNG 的字节列表；未安装 PyMuPDF 时返回 []，
             页面超限或累计像素超限时抛出 DocumentSafetyError。
    """
    if not pdf_bytes or len(pdf_bytes) == 0:
        return []
    if fitz is None:
        logger.warning("PyMuPDF 未安装，无法将 PDF 转为图片。请执行: pip install pymupdf")
        return []
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    images: list[bytes] = []
    zoom = dpi / 72.0
    total_pixels = 0
    try:
        for page in doc:
            rect = page.rect
            page_pixels = int(rect.width * rect.height * zoom * zoom)
            if page_pixels > MAX_RENDERED_PIXELS_PER_PAGE:
                raise DocumentSafetyError(
                    f"PDF 单页尺寸过大，无法识别（第 {page.number + 1} 页）。"
                )
            total_pixels += page_pixels
            if total_pixels > MAX_RENDERED_PIXELS_TOTAL:
                raise DocumentSafetyError("PDF 渲染总量超过限制，无法识别该试卷。")
            matrix = fitz.Matrix(zoom, zoom)
            pixmap = page.get_pixmap(matrix=matrix, alpha=False)
            images.append(pixmap.tobytes(output="png"))
    except DocumentSafetyError:
        raise
    except Exception as exc:
        logger.warning("pdf_to_images_failed error_type=%s", type(exc).__name__)
        return []
    finally:
        doc.close()
    return images
