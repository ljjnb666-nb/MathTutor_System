"""
文档解析服务：解析用户上传的 PDF / Word，提取纯文本。
"""
import io
import re

from fastapi import HTTPException, UploadFile
from pypdf import PdfReader

try:
    import docx
except ImportError:
    docx = None


def _normalize_text(text: str) -> str:
    """去除多余空行和常见乱码，保留可读纯文本。"""
    if not text or not text.strip():
        return ""
    # 替换各类空白（含全角、制表、连续空格）为普通空格
    text = re.sub(r"[\t\x0b\x0c\r]+", " ", text)
    text = re.sub(r"\s+", " ", text)
    # 去除不可见/控制字符，保留常见标点和中英文
    text = "".join(c for c in text if c.isprintable() or c in "\n")
    # 合并连续空行至最多一个换行
    text = re.sub(r"\n\s*\n", "\n", text)
    return text.strip()


def parse_file_from_bytes(content: bytes, filename: str) -> str:
    """
    从字节流解析文档为纯文本（供后台任务等同步场景使用）。
    支持 .pdf、.docx；其他格式或解析失败抛出 ValueError。
    SEC-05：解析前先做 document_safety 预检（页数 / ZIP 展开上限 / 魔数）。
    """
    content_str = ""
    name = (filename or "").lower().strip()
    if not name:
        raise ValueError("缺少文件名")
    # 单一安全预检 authority：页数上限取知识库配置（试卷路径在 upload.py 另行收紧）。
    preflight_document(content, name, profile="rag")
    file_stream = io.BytesIO(content)

    try:
        if name.endswith(".pdf"):
            reader = PdfReader(file_stream)
            for page in reader.pages:
                raw = page.extract_text()
                if raw:
                    content_str += raw + "\n"
        elif name.endswith(".docx"):
            if docx is None:
                raise ValueError("未安装 python-docx，无法解析 Word 文档。请执行: pip install python-docx")
            word_doc = docx.Document(file_stream)
            for para in word_doc.paragraphs:
                if para.text:
                    content_str += para.text + "\n"
            for table in word_doc.tables:
                for row in table.rows:
                    for cell in row.cells:
                        if cell.text:
                            content_str += cell.text.strip() + " "
                    content_str += "\n"
        else:
            raise ValueError("不支持的文件格式，仅支持 PDF (.pdf) 和 Word (.docx)")
    except ValueError as exc:
        if str(exc) in {
            "不支持的文件格式，仅支持 PDF (.pdf) 和 Word (.docx)",
            "未安装 python-docx，无法解析 Word 文档。请执行: pip install python-docx",
        }:
            raise
        raise ValueError("DOCUMENT_PARSE_ERROR: 文件解析失败，请检查文档格式后重试。") from None
    except Exception:
        raise ValueError("DOCUMENT_PARSE_ERROR: 文件解析失败，请检查文档格式后重试。") from None

    return _normalize_text(content_str)


async def parse_file(file: UploadFile) -> str:
    """
    解析上传文件，提取纯文本。
    支持 .pdf、.docx；其他格式抛出 HTTP 400。
    """
    filename = (file.filename or "").strip()
    if not filename:
        raise HTTPException(status_code=400, detail="缺少文件名")
    file_bytes = await file.read()
    try:
        return parse_file_from_bytes(file_bytes, filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
