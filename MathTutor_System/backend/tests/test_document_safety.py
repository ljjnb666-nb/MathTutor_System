"""SEC-05: document preflight rejects expansion bombs before parse/render."""
import io
import zipfile

import pytest
from pypdf import PdfWriter

from app.services.document_safety import (
    MAX_DOCX_ENTRIES,
    MAX_PDF_PAGES_EXAM,
    DocumentSafetyError,
    preflight_document,
    preflight_docx,
    preflight_pdf,
)


def make_pdf(pages=1, page_size=(612.0, 792.0)):
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=page_size[0], height=page_size[1])
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def make_docx(extra_members=None, document_xml=b"<doc/>"):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("word/document.xml", document_xml)
        for name in extra_members or []:
            archive.writestr(name, b"x")
    return buffer.getvalue()


def test_pdf_magic_bytes_required():
    with pytest.raises(DocumentSafetyError, match="PDF"):
        preflight_pdf(b"fixture-not-a-pdf")
    with pytest.raises(DocumentSafetyError, match="PDF"):
        preflight_document(b"GIF89a-nope", "trick.pdf")


def test_pdf_page_cap_per_profile():
    rag_limit = 300
    exam_limit = MAX_PDF_PAGES_EXAM
    assert preflight_document(make_pdf(exam_limit), "a.pdf", profile="exam") is None
    with pytest.raises(DocumentSafetyError, match="页数"):
        preflight_document(make_pdf(exam_limit + 1), "a.pdf", profile="exam")
    # The same document passes the looser RAG cap.
    assert preflight_document(make_pdf(exam_limit + 1), "a.pdf", profile="rag") is None
    with pytest.raises(DocumentSafetyError, match="页数"):
        preflight_document(make_pdf(rag_limit + 1), "a.pdf", profile="rag")


def test_docx_requires_office_structure():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
    with pytest.raises(DocumentSafetyError, match="结构"):
        preflight_docx(buffer.getvalue())
    assert preflight_docx(make_docx()) is None


def _with_forged_metadata(data: bytes, member: str, file_size: int, compress_size: int) -> bytes:
    """Append a member whose central-directory metadata claims arbitrary sizes."""
    forged = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(data)) as src, zipfile.ZipFile(forged, "a", zipfile.ZIP_STORED) as dst:
        for info in src.infolist():
            dst.writestr(info, src.read(info.filename))
        fake = zipfile.ZipInfo(member)
        dst.writestr(fake, b"")
        # zipfile serializes the central directory on close from ZipInfo fields,
        # so patching after writestr forges exactly the CD metadata an attacker
        # would craft — without storing gigabytes anywhere.
        dst.infolist()[-1].file_size = file_size
        dst.infolist()[-1].compress_size = compress_size
    return forged.getvalue()


def test_docx_zip_bomb_metadata_rejected_without_expanding():
    """Ratio abuse is caught from central-directory metadata alone (no extraction)."""
    bomb = _with_forged_metadata(
        make_docx(),
        "word/media/bomb.bin",
        file_size=30 * 2**20,   # 30MiB: inside the single-member cap
        compress_size=1,        # 1 byte stored: ratio ≈ 31 million
    )
    with pytest.raises(DocumentSafetyError, match="压缩比"):
        preflight_docx(bomb)


def test_docx_entry_count_and_uncompressed_cap():
    overflow = [f"part/part-{i:05d}.bin" for i in range(MAX_DOCX_ENTRIES + 1 - 2)]
    with pytest.raises(DocumentSafetyError, match="数量"):
        preflight_docx(make_docx(extra_members=overflow))
    # Oversized single member declared in metadata, no bytes written.
    huge = _with_forged_metadata(make_docx(), "word/document.xml", file_size=40 * 2**20, compress_size=40 * 2**20)
    with pytest.raises(DocumentSafetyError, match="过大"):
        preflight_docx(huge)


@pytest.mark.parametrize("bad", [
    "../evil.xml",
    "/abs/path.xml",
    "C:/drive/path.xml",
])
def test_docx_unsafe_member_paths_rejected(bad):
    # zipfile itself normalizes backslashes on write, so traversal/absolute/drive
    # forms are the ones a real archive can carry; raw-bytes backslash archives
    # are additionally covered by preflight_docx's own separator check.
    with pytest.raises(DocumentSafetyError, match="内部结构"):
        preflight_docx(make_docx(extra_members=[bad]))


def test_docx_magic_bytes_required():
    with pytest.raises(DocumentSafetyError, match="Word"):
        preflight_docx(b"not a zip at all")


def test_giant_page_surface_rejected_before_render():
    """A 20000×20000pt page (~8.7MP at 150dpi²) exceeds the single-page cap pre-render."""
    giant = make_pdf(page_size=(20000.0, 20000.0))
    with pytest.raises(DocumentSafetyError, match="单页"):
        from app.services.pdf_to_images import pdf_pages_to_images

        pdf_pages_to_images(giant)


def test_unsupported_extension_rejected():
    with pytest.raises(DocumentSafetyError, match="仅支持"):
        preflight_document(b"whatever", "notes.txt")
