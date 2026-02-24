"""
Word → PDF 转换：依赖 LibreOffice 无头模式，用于含图试卷按页识图流程。
若未安装 LibreOffice 或转换失败，调用方应回退到纯文本解析。
"""
import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)


def _find_libreoffice() -> str | None:
    """查找 LibreOffice 可执行路径（soffice 或 libreoffice）。"""
    names = ["soffice", "libreoffice"]
    exe = shutil.which("soffice") or shutil.which("libreoffice")
    if exe:
        return exe
    if os.name == "nt":
        for base in [
            os.environ.get("ProgramFiles", "C:\\Program Files"),
            os.environ.get("ProgramFiles(x86)", "C:\\Program Files (x86)"),
        ]:
            for name in ["LibreOffice", "LibreOffice 24", "LibreOffice 7"]:
                path = Path(base) / name / "program" / "soffice.exe"
                if path.exists():
                    return str(path)
    return None


def convert_docx_to_pdf(docx_bytes: bytes) -> bytes | None:
    """
    将 .docx 转为 PDF。依赖系统已安装 LibreOffice（无头模式）。
    :return: PDF 文件字节，失败返回 None。
    """
    if not docx_bytes or len(docx_bytes) == 0:
        return None
    exe = _find_libreoffice()
    if not exe:
        logger.warning("LibreOffice 未找到，无法执行 Word→PDF 转换")
        return None
    tmpdir = tempfile.mkdtemp(prefix="math_tutor_docx_")
    try:
        docx_path = Path(tmpdir) / "input.docx"
        docx_path.write_bytes(docx_bytes)
        out_dir = Path(tmpdir) / "out"
        out_dir.mkdir(exist_ok=True)
        env = os.environ.copy()
        env.setdefault("HOME", tmpdir)
        result = subprocess.run(
            [
                exe,
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                str(out_dir),
                str(docx_path),
            ],
            capture_output=True,
            timeout=60,
            env=env,
            cwd=tmpdir,
        )
        if result.returncode != 0:
            logger.warning(
                "LibreOffice 转换失败: returncode=%s stderr=%s",
                result.returncode,
                (result.stderr or b"").decode("utf-8", errors="replace")[:500],
            )
            return None
        pdf_path = out_dir / "input.pdf"
        if not pdf_path.exists():
            logger.warning("LibreOffice 未生成 input.pdf")
            return None
        return pdf_path.read_bytes()
    except subprocess.TimeoutExpired:
        logger.warning("Word→PDF 转换超时")
        return None
    except Exception as e:
        logger.warning("Word→PDF 转换异常: %s", e, exc_info=True)
        return None
    finally:
        try:
            shutil.rmtree(tmpdir, ignore_errors=True)
        except Exception:
            pass
