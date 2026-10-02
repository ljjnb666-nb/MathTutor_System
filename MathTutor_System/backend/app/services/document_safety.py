"""Document safety preflight — the single authority for PDF/DOCX upload safety.

SEC-05: a 12MB raw upload is not a resource boundary. A crafted PDF can expand
into hundreds of rendered pages or gigantic page surfaces, and a DOCX is a ZIP
that can decompress into gigabytes. Everything here runs BEFORE parsing or
rendering and rejects with a stable user-facing message.
"""
from __future__ import annotations

import io
import posixpath
import zipfile

MAX_DOCX_ENTRIES = 2000
MAX_DOCX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024
MAX_DOCX_SINGLE_MEMBER_BYTES = 32 * 1024 * 1024
# A stored member of ~320KB expanding to 64MB is still allowed; a 1KB member
# claiming 200MB is a bomb. Applies per member.
MAX_DOCX_COMPRESSION_RATIO = 200

# Exam parsing renders every page at 150dpi and calls a vision model per page:
# hard-cap at 50 pages. RAG ingestion is text-extraction only: 300 pages.
MAX_PDF_PAGES_EXAM = 50
MAX_PDF_PAGES_RAG = 300

# Render-time pixel budget enforced by pdf_pages_to_images (150dpi zoom ≈ 2.08):
# an A4 page is ~2.1MP; the caps bound a single page surface and a whole job.
MAX_RENDERED_PIXELS_PER_PAGE = 24_000_000
MAX_RENDERED_PIXELS_TOTAL = 160_000_000

_PDF_MAGIC = b"%PDF-"
_DOCX_REQUIRED_MEMBERS = ("[Content_Types].xml", "word/document.xml")


class DocumentSafetyError(ValueError):
    """Raised when an upload fails the document safety preflight."""


def _fail(message: str) -> "DocumentSafetyError":
    return DocumentSafetyError(message)


def preflight_pdf(content: bytes, *, max_pages: int = MAX_PDF_PAGES_RAG) -> None:
    """Magic bytes + page count for a PDF, before any parsing/rendering."""
    if not content.startswith(_PDF_MAGIC):
        raise _fail("文档格式不正确：不是有效的 PDF 文件。")
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(content))
        page_count = len(reader.pages)
    except DocumentSafetyError:
        raise
    except Exception as exc:
        raise _fail("PDF 文件无法读取，请检查文件后重试。") from exc
    if page_count > max_pages:
        raise _fail(f"PDF 页数超过限制：最多 {max_pages} 页，当前 {page_count} 页。")


def _safe_zip_member_path(name: str) -> None:
    """Reject absolute paths, traversal, drive letters and odd separators."""
    if not name:
        raise _fail("文档内部结构异常，已拒绝处理。")
    if "\\" in name:
        raise _fail("文档内部结构异常，已拒绝处理。")
    if name.startswith(("/", "~")) or ":" in name:
        raise _fail("文档内部结构异常，已拒绝处理。")
    parts = posixpath.normpath(name).split("/")
    if any(part == ".." for part in parts):
        raise _fail("文档内部结构异常，已拒绝处理。")


def preflight_docx(content: bytes) -> None:
    """ZIP central-directory bounds for a DOCX before python-docx/LibreOffice touch it."""
    if len(content) < 4 or not content.startswith(b"PK"):
        raise _fail("文档格式不正确：不是有效的 Word (.docx) 文件。")
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            names = archive.namelist()
            if len(names) > MAX_DOCX_ENTRIES:
                raise _fail(f"文档内部文件数量超过限制（{MAX_DOCX_ENTRIES}），已拒绝处理。")
            missing = [member for member in _DOCX_REQUIRED_MEMBERS if member not in names]
            if missing:
                raise _fail("文档缺少必要的 Word 结构，已拒绝处理。")
            total_uncompressed = 0
            for info in archive.infolist():
                _safe_zip_member_path(info.filename)
                declared = max(0, int(info.file_size or 0))
                compressed = max(0, int(info.compress_size or 0))
                total_uncompressed += declared
                if declared > MAX_DOCX_SINGLE_MEMBER_BYTES:
                    raise _fail("文档内部单个文件过大，已拒绝处理。")
                if compressed > 0 and declared > compressed * MAX_DOCX_COMPRESSION_RATIO:
                    raise _fail("文档压缩比异常，已拒绝处理。")
                if declared > MAX_DOCX_UNCOMPRESSED_BYTES:
                    raise _fail("文档解压后超过大小限制，已拒绝处理。")
            if total_uncompressed > MAX_DOCX_UNCOMPRESSED_BYTES:
                raise _fail("文档解压后超过大小限制，已拒绝处理。")
    except DocumentSafetyError:
        raise
    except zipfile.BadZipFile as exc:
        raise _fail("文档格式不正确：不是有效的 Word (.docx) 文件。") from exc
    except (OSError, ValueError) as exc:
        raise _fail("文档无法读取，请检查文件后重试。") from exc


def preflight_document(
    content: bytes,
    filename: str,
    *,
    profile: str = "rag",
) -> None:
    """One entry point for every PDF/DOCX upload path.

    profile: "exam" caps PDFs at 50 pages (render + vision), "rag" at 300.
    """
    name = (filename or "").lower().strip()
    max_pages = MAX_PDF_PAGES_EXAM if profile == "exam" else MAX_PDF_PAGES_RAG
    if name.endswith(".pdf"):
        preflight_pdf(content, max_pages=max_pages)
    elif name.endswith(".docx"):
        preflight_docx(content)
    else:
        raise _fail("仅支持 PDF (.pdf) 和 Word (.docx) 文档。")
