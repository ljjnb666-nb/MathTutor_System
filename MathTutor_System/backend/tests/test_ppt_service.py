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


if __name__ == "__main__":
    test_ppt_clean_json_string()
    test_create_pptx_file_returns_bytes()
    test_create_pptx_file_empty_slides_title_only()
    test_create_pptx_file_content_no_bullets()
    print("test_ppt_service: 全部通过")
