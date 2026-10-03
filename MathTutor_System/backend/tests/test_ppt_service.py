"""
PPT 服务单测：_clean_json_string、create_pptx_file。
不调用真实 API。运行: 在 backend 目录下 python -m pytest tests/test_ppt_service.py -v
"""
import sys
from io import BytesIO

sys.path.insert(0, ".")

from app.services.ppt_service import _clean_json_string, create_pptx_file


def test_ppt_clean_json_string():
    """去除 markdown 代码块后得到纯 JSON 字符串。"""
    raw = """```json
{"title": "Lesson", "slides": [{"layout": "title", "title": "Hi"}]}
```"""
    out = _clean_json_string(raw)
    assert "```" not in out
    assert "Lesson" in out
    assert "slides" in out


def test_create_pptx_file_returns_bytes():
    """create_pptx_file 返回的 BytesIO 内含有效 .pptx 字节（PK 头）。"""
    content = {
        "title": "Test Lesson",
        "slides": [
            {"layout": "title", "title": "Main", "subtitle": "Sub"},
            {"layout": "content", "title": "Point 1", "bullets": ["A", "B", "C"]},
        ],
    }
    buf = create_pptx_file(content)
    assert isinstance(buf, BytesIO)
    data = buf.getvalue()
    assert len(data) > 500
    # .pptx 是 ZIP，文件头为 PK
    assert data[:2] == b"PK"


def test_create_pptx_file_empty_slides_title_only():
    """仅标题页时也能生成。"""
    content = {"title": "Only Title", "slides": [{"layout": "title", "title": "Only", "subtitle": ""}]}
    buf = create_pptx_file(content)
    assert len(buf.getvalue()) > 100
    assert buf.getvalue()[:2] == b"PK"


def test_create_pptx_file_content_no_bullets():
    """内容页无 bullets 时不报错。"""
    content = {
        "title": "T",
        "slides": [{"layout": "content", "title": "Empty body", "bullets": []}],
    }
    buf = create_pptx_file(content)
    assert len(buf.getvalue()) > 100


# ---------- PHASE 2C-5C：数学字段渲染集成 ----------

from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE


def _pictures(slide):
    return [shape for shape in slide.shapes if shape.shape_type == MSO_SHAPE_TYPE.PICTURE]


def _text_shapes(slide):
    return [shape for shape in slide.shapes if shape.has_text_frame and shape.text_frame.text.strip()]


def test_plain_deck_keeps_native_text_and_no_pictures():
    """纯文本字段必须保持原生 PowerPoint 文本，绝不栅格化。"""
    content = {
        "title": "纯文本讲义",
        "slides": [
            {"layout": "title", "title": " Plain Title ", "subtitle": "Sub"},
            {"layout": "content", "title": "学习目标", "bullets": ["理解直角三角形", "掌握判定"]},
        ],
    }
    prs = Presentation(create_pptx_file(content))
    assert len(prs.slides) == 2
    for slide in prs.slides:
        assert _pictures(slide) == []
    body_texts = " | ".join(shape.text_frame.text for shape in _text_shapes(prs.slides[1]))
    assert "理解直角三角形" in body_texts
    assert "学习目标" in body_texts


def test_math_fields_become_png_pictures():
    content = {
        "title": "勾股定理",
        "slides": [
            {"layout": "title", "title": "勾股定理 $a^2+b^2=c^2$", "subtitle": "学习 $c=5$ 的情形"},
            {
                "layout": "content",
                "title": "核心公式 $a^2+b^2=c^2$",
                "bullets": ["理解直角三角形", "当 $x=2$ 时，$y=x^2+1$ 的值为 $5$。", "$$c=\sqrt{a^2+b^2}$$"],
            },
        ],
    }
    prs = Presentation(create_pptx_file(content))
    title_pics = _pictures(prs.slides[0])
    assert len(title_pics) == 2  # 数学标题 + 数学副标题
    for pic in title_pics:
        assert pic.image.content_type == "image/png"
        assert pic.image.size[0] > 0 and pic.image.size[1] > 0
    content_pics = _pictures(prs.slides[1])
    assert len(content_pics) == 3  # 数学标题 + 混排 bullet + 展示公式 bullet
    body_texts = " | ".join(shape.text_frame.text for shape in _text_shapes(prs.slides[1]))
    assert "•  理解直角三角形" in body_texts  # 纯文本 bullet 仍是原生文本


def test_malformed_bullet_falls_back_to_raw_source_text():
    """畸形公式不得使 deck 失败，也不得静默丢弃：回退为规范源文本。"""
    content = {
        "title": "T",
        "slides": [
            {"layout": "content", "title": "回退", "bullets": ["$\\frac{1$"]},
        ],
    }
    prs = Presentation(create_pptx_file(content))
    assert _pictures(prs.slides[0]) == []
    body_texts = " | ".join(shape.text_frame.text for shape in _text_shapes(prs.slides[0]))
    assert "$\\frac{1$" in body_texts


def test_unsupported_math_command_falls_back_to_text():
    content = {
        "title": "T",
        "slides": [
            {"layout": "content", "title": "回退", "bullets": ["$\\href{javascript:alert(1)}{x}$"]},
        ],
    }
    prs = Presentation(create_pptx_file(content))
    assert _pictures(prs.slides[0]) == []
    body_texts = " | ".join(shape.text_frame.text for shape in _text_shapes(prs.slides[0]))
    assert "javascript:alert(1)" in body_texts


def test_hostile_text_bullet_never_becomes_picture_or_link():
    content = {
        "title": "T",
        "slides": [
            {"layout": "content", "title": "安全", "bullets": ["<script>alert(1)</script>"]},
        ],
    }
    prs = Presentation(create_pptx_file(content))
    assert _pictures(prs.slides[0]) == []
    body_texts = " | ".join(shape.text_frame.text for shape in _text_shapes(prs.slides[0]))
    assert "<script>alert(1)</script>" in body_texts


if __name__ == "__main__":
    test_ppt_clean_json_string()
    test_create_pptx_file_returns_bytes()
    test_create_pptx_file_empty_slides_title_only()
    test_create_pptx_file_content_no_bullets()
    print("test_ppt_service: 全部通过")
