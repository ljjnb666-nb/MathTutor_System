"""PHASE 2C-5A：Magic PPT 规范内容 DTO（app/schemas/ppt_dto.py）校验权威测试。

覆盖：合法规范 JSON、slides/slide/字段类型错误、SEC-08 硬上限的
接受/拒绝边界。上限：slides<=30、bullets<=12、title<=255、
subtitle<=500、bullet<=500。
"""
import pytest
from pydantic import ValidationError

from app.schemas.ppt_dto import (
    MAX_BULLET_LENGTH,
    MAX_BULLETS_PER_SLIDE,
    MAX_SLIDES,
    MAX_SUBTITLE_LENGTH,
    MAX_TITLE_LENGTH,
    PPTContent,
    PPTSlide,
)

VALID_CONTENT = {
    "title": "勾股定理",
    "slides": [
        {"layout": "title", "title": "勾股定理", "subtitle": "直角三角形基础"},
        {
            "layout": "content",
            "title": "核心公式",
            "bullets": ["在直角三角形中，$a^2+b^2=c^2$。", "$$c=\\sqrt{a^2+b^2}$$"],
        },
    ],
}


def test_valid_canonical_ppt_json():
    content = PPTContent.model_validate(VALID_CONTENT)
    assert content.title == "勾股定理"
    assert content.slides[1].bullets[0] == "在直角三角形中，$a^2+b^2=c^2$。"
    assert content.slides[1].bullets[1] == "$$c=\\sqrt{a^2+b^2}$$"


def test_extra_keys_are_ignored_not_propagated():
    data = {
        **VALID_CONTENT,
        "topic": "勾股定理",
        "slides": [{**VALID_CONTENT["slides"][0], "notes": "should be dropped"}],
    }
    content = PPTContent.model_validate(data)
    assert content.model_dump()["slides"][0] == {
        "layout": "title",
        "title": "勾股定理",
        "subtitle": "直角三角形基础",
        "bullets": [],
    }


def test_slides_must_be_list():
    with pytest.raises(ValidationError):
        PPTContent.model_validate({"title": "T", "slides": "nope"})


def test_slides_required():
    with pytest.raises(ValidationError):
        PPTContent.model_validate({"title": "T"})


def test_slide_object_must_validate():
    with pytest.raises(ValidationError):
        PPTContent.model_validate({"title": "T", "slides": ["not a slide"]})


def test_bullets_must_be_strings():
    with pytest.raises(ValidationError):
        PPTSlide.model_validate({"layout": "content", "title": "T", "bullets": [1, 2]})


def test_slide_must_be_object():
    with pytest.raises(ValidationError):
        PPTContent.model_validate({"title": "T", "slides": [{"layout": ["content"]}]})


def test_slides_upper_boundary_accepted():
    slides = [{"layout": "content", "title": f"S{i}", "bullets": ["b"]} for i in range(MAX_SLIDES)]
    content = PPTContent.model_validate({"title": "T", "slides": slides})
    assert len(content.slides) == MAX_SLIDES


def test_slides_over_limit_rejected():
    slides = [{"layout": "content", "title": f"S{i}", "bullets": []} for i in range(MAX_SLIDES + 1)]
    with pytest.raises(ValidationError):
        PPTContent.model_validate({"title": "T", "slides": slides})


def test_bullets_upper_boundary_accepted():
    bullets = ["b" for _ in range(MAX_BULLETS_PER_SLIDE)]
    slide = PPTSlide.model_validate({"layout": "content", "title": "T", "bullets": bullets})
    assert len(slide.bullets) == MAX_BULLETS_PER_SLIDE


def test_bullets_over_limit_rejected():
    bullets = ["b" for _ in range(MAX_BULLETS_PER_SLIDE + 1)]
    with pytest.raises(ValidationError):
        PPTSlide.model_validate({"layout": "content", "title": "T", "bullets": bullets})


def test_field_length_boundaries_accepted():
    slide = PPTSlide.model_validate({
        "layout": "content",
        "title": "x" * MAX_TITLE_LENGTH,
        "subtitle": "y" * MAX_SUBTITLE_LENGTH,
        "bullets": ["z" * MAX_BULLET_LENGTH],
    })
    assert len(slide.title) == MAX_TITLE_LENGTH
    assert len(slide.subtitle) == MAX_SUBTITLE_LENGTH
    assert len(slide.bullets[0]) == MAX_BULLET_LENGTH


def test_field_length_over_limits_rejected():
    with pytest.raises(ValidationError):
        PPTSlide.model_validate({"title": "x" * (MAX_TITLE_LENGTH + 1)})
    with pytest.raises(ValidationError):
        PPTSlide.model_validate({"subtitle": "y" * (MAX_SUBTITLE_LENGTH + 1)})
    with pytest.raises(ValidationError):
        PPTSlide.model_validate({"bullets": ["z" * (MAX_BULLET_LENGTH + 1)]})


def test_content_title_over_limit_rejected():
    with pytest.raises(ValidationError):
        PPTContent.model_validate({"title": "x" * (MAX_TITLE_LENGTH + 1), "slides": VALID_CONTENT["slides"]})


# ---------- RB05：canonical layout enum 契约 ----------


@pytest.mark.parametrize("layout", ["title", "content"])
def test_layout_enum_accepts_canonical_values(layout):
    slide = PPTSlide.model_validate({"layout": layout, "title": "T"})
    assert slide.layout == layout


def test_layout_default_is_content():
    assert PPTSlide.model_validate({"title": "T"}).layout == "content"


@pytest.mark.parametrize("layout", ["section", "unknown", "Title", "CONTENT", "", "divider"])
def test_layout_enum_rejects_non_canonical_values(layout):
    with pytest.raises(ValidationError):
        PPTSlide.model_validate({"layout": layout, "title": "T"})


def test_content_with_section_layout_rejected():
    with pytest.raises(ValidationError):
        PPTContent.model_validate({
            "title": "T",
            "slides": [{"layout": "section", "title": "分节"}],
        })
