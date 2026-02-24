"""
PDF 按页渲染为图片，用于按页视觉识别题目。
"""
import logging
from io import BytesIO

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
    :return: 每页一张 PNG 的字节列表，失败或未安装 PyMuPDF 时返回 []
    """
    if not pdf_bytes or len(pdf_bytes) == 0:
        return []
    if fitz is None:
        logger.warning("PyMuPDF 未安装，无法将 PDF 转为图片。请执行: pip install pymupdf")
        return []
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        images: list[bytes] = []
        zoom = dpi / 72.0
        for page in doc:
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img_bytes = pix.tobytes(output="png")
            images.append(img_bytes)
        doc.close()
        return images
    except Exception as e:
        logger.warning("PDF 转图片失败: %s", e, exc_info=True)
        return []
