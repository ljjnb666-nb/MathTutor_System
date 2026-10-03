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


# ---------- RB01/RB02：真实 PPTX 几何不变量 ----------
#
# 权威下界：BODY_CONTENT_BOTTOM（由 _FOOTER_TOP / 卡片底边推导）。
# 对生成后的 PowerPoint 用 python-pptx 重开，直接断言每个正文 shape 的
# top >= body_top 且 top + height <= BODY_CONTENT_BOTTOM，并核对页脚不被覆盖。

from pptx.util import Inches, Pt

import pytest

from app.schemas.ppt_dto import MAX_BULLET_LENGTH, MAX_TITLE_LENGTH, PPTContent
from app.services.ppt_service import (
    ABSOLUTE_MIN_TEXT_PT,
    BODY_CONTENT_BOTTOM,
    PPTLayoutUnfitError,
    _BODY_BOTTOM_PAD,
    _BODY_GAP_PT,
    _BODY_MIN_PT,
    _BODY_PT,
    _BODY_TOP,
    _CARD_BOTTOM,
    _CARD_BOTTOM_PAD,
    _CONTENT_LEFT,
    _EMU_PER_INCH,
    _FOOTER_SEPARATOR_LIFT,
    _FOOTER_TOP,
    _LINE_HEIGHT_FACTOR,
    _MARGIN,
    _SLIDE_W,
    _SUBTITLE_MAX_H,
    _TEXTBOX_H_MARGIN,
    _TITLE_BOX_H,
    _TITLE_TOP,
    _count_block_lines,
    _measure_text_block,
    _plan_body_stack,
    _usable_text_width,
)

_GEOM_EPS = int(0.02 * _EMU_PER_INCH)  # 吸收放置时的整型截断
_TITLE_BOTTOM = _TITLE_TOP + _TITLE_BOX_H


def _content_slide_of(prs, index=0):
    """单内容页 deck 直接取该页；带 title 页的 deck 取第 2 页。"""
    return prs.slides[index] if len(prs.slides) == 1 else prs.slides[1]


def _card_top_of(slide):
    """内容卡 top：slide 上唯一的两块「自动形状 且 宽 >= 10in 且高 >= 3in」中的较上者。

    用 AUTO_SHAPE 类型排除 whole-body 单文本框（宽高也可能很大但是 TEXT_BOX）。
    """
    big = [
        s for s in slide.shapes
        if s.shape_type == MSO_SHAPE_TYPE.AUTO_SHAPE
        and s.width >= Inches(10) and s.height >= Inches(3)
    ]
    assert len(big) == 2, f"expected card + shadow, got {len(big)}"
    return min(s.top for s in big)


def _assert_body_geometry(slide):
    """正文所有 flow shape 必须落在 [card_top+0.12, BODY_CONTENT_BOTTOM] 内。"""
    card_top = _card_top_of(slide)
    body_top_line = card_top + Inches(0.12)
    body = [
        s for s in slide.shapes
        if body_top_line - _GEOM_EPS <= s.top <= BODY_CONTENT_BOTTOM + _GEOM_EPS
    ]
    assert body, "content slide must have body flow shapes"
    for shape in body:
        assert shape.top >= body_top_line - _GEOM_EPS, f"body shape above body_top: {shape.shape_type}"
        assert shape.top + shape.height <= BODY_CONTENT_BOTTOM + _GEOM_EPS, (
            f"body shape crosses BODY_CONTENT_BOTTOM: {shape.shape_type} "
            f"bottom={_emu_in(shape.top + shape.height):.3f}in"
        )
    return body


def _assert_subtitle_band(slide):
    """副标题 shape 必须位于标题块之下、内容卡之上，且不与之重叠。"""
    card_top = _card_top_of(slide)
    band = [
        s for s in slide.shapes
        if _TITLE_BOTTOM - _GEOM_EPS <= s.top < card_top - _GEOM_EPS
    ]
    assert band, "expected subtitle shapes between title and card"
    for shape in band:
        assert shape.top >= _TITLE_BOTTOM - _GEOM_EPS
        assert shape.top + shape.height <= card_top + _GEOM_EPS, "subtitle overlaps content card"
    return band


def _bullet_text_shapes(slide):
    return [
        s for s in slide.shapes
        if s.has_text_frame and s.text_frame.text.strip().startswith("•")
    ]


def _emu_in(emu):
    return emu / _EMU_PER_INCH


def test_body_content_bottom_is_derived_from_footer_authority():
    """权威下界必须由页脚/卡片几何推导，且严格位于页脚分隔线之上。"""
    assert _CARD_BOTTOM == _FOOTER_TOP - _CARD_BOTTOM_PAD
    assert BODY_CONTENT_BOTTOM == _CARD_BOTTOM - _BODY_BOTTOM_PAD
    assert BODY_CONTENT_BOTTOM < _FOOTER_TOP - _FOOTER_SEPARATOR_LIFT


def test_rb01_scenario_a_short_bullets_with_math_bounded():
    """场景 A：12 条短要点（含数学）→ 所有正文 shape 都在正文可用区内。"""
    content = {
        "title": "T",
        "slides": [{
            "layout": "content",
            "title": "学习目标",
            "bullets": [f"直角三角形性质要点{i}" for i in range(11)] + ["勾股定理 $a^2+b^2=c^2$"],
        }],
    }
    prs = Presentation(create_pptx_file(content))
    slide = prs.slides[0]
    body = _assert_body_geometry(slide)
    # 无静默丢字段：11 条原生文本要点 + 1 张数学 PNG 全部在场。
    assert len(_bullet_text_shapes(slide)) == 11
    assert len(_pictures(slide)) == 1
    assert len(body) == 12


def test_rb01_scenario_b_twelve_math_bullets_bounded():
    """场景 B：12 条数学要点 → 12 张 PNG 全部在正文可用区内。"""
    content = {
        "title": "T",
        "slides": [{
            "layout": "content",
            "title": "公式训练",
            "bullets": [f"$x^{i}+{i}=0$" for i in range(12)],
        }],
    }
    prs = Presentation(create_pptx_file(content))
    slide = prs.slides[0]
    body = _assert_body_geometry(slide)
    assert len(_pictures(slide)) == 12
    assert len(body) == 12


def test_rb01_scenario_c_mixed_plain_math_fallback_bounded():
    """场景 C：plain / math / malformed 混排 → 全部落位，畸形回退源文本在场。"""
    bullets = []
    for i in range(4):
        bullets += [f"纯文本要点{i}", f"公式 $x^{i}$ 要点", "$\\frac{1$"]
    content = {
        "title": "T",
        "slides": [{"layout": "content", "title": "混合", "bullets": bullets}],
    }
    prs = Presentation(create_pptx_file(content))
    slide = prs.slides[0]
    _assert_body_geometry(slide)
    assert len(_pictures(slide)) == 4  # 4 条数学 PNG
    texts = " | ".join(s.text_frame.text for s in _bullet_text_shapes(slide))
    assert texts.count("纯文本要点") == 4
    assert texts.count("$\\frac{1$") == 4  # malformed 回退为源文本，不丢字段


def test_rb01_scenario_d_long_bullet_with_math_bounded():
    """场景 D：长要点 + 数学 → 收缩策略介入，但几何仍受权威下界约束。"""
    content = {
        "title": "T",
        "slides": [{
            "layout": "content",
            "title": "长文本与公式",
            "bullets": ["长" * 500, "勾股定理 $a^2+b^2=c^2$"],
        }],
    }
    prs = Presentation(create_pptx_file(content))
    slide = prs.slides[0]
    _assert_body_geometry(slide)
    assert len(_pictures(slide)) == 1
    texts = " | ".join(s.text_frame.text for s in _bullet_text_shapes(slide))
    assert "长" * 100 in texts  # 完整长文本在场（不截断）


def _assert_text_stack_measured_fit(box, paragraph_count: int) -> float:
    """F：用同一测量权威核算文本栈实际占高，必须 ≤ 文本框可用高度。"""
    paras = list(box.text_frame.paragraphs)
    assert len([p for p in paras if p.text.strip()]) == paragraph_count
    font_pt = paras[0].runs[0].font.size.pt
    usable_w_in = _usable_text_width(box.width / _EMU_PER_INCH)
    occupied = sum(_measure_text_block(p.text, font_pt, usable_w_in) for p in paras)
    occupied += sum((p.space_after.pt if p.space_after else 0) for p in paras[:-1]) / 72.0
    box_h_in = box.height / _EMU_PER_INCH
    assert occupied <= box_h_in + 0.02, (
        f"emitted text stack {occupied:.3f}in exceeds textbox {box_h_in:.3f}in"
    )
    return occupied


def test_rb01_extreme_plain_density_whole_body_bounded_and_complete():
    """极端纯文本密度（12×500）：字号确定性下探，内容完整且不越界。"""
    content = {
        "title": "T",
        "slides": [{
            "layout": "content",
            "title": "密度极限",
            "bullets": ["超" * 500 for _ in range(12)],
        }],
    }
    prs = Presentation(create_pptx_file(content))
    slide = prs.slides[0]
    body = _assert_body_geometry(slide)
    boxes = [s for s in body if s.has_text_frame]
    assert len(boxes) == 1  # whole-body 单文本框
    paragraphs = [p.text for p in boxes[0].text_frame.paragraphs if p.text.strip()]
    assert len(paragraphs) == 12  # 12 条要点一条不少
    assert all(p == f"•  {'超' * 500}" for p in paragraphs)
    # RB01-EXT F：权威测量占高 ≤ 文本框可用高度（visual fit contract）
    _assert_text_stack_measured_fit(boxes[0], 12)


def test_rb01_extreme_math_density_whole_body_fallback_no_silent_drop(caplog):
    """极端数学密度：whole-body safe fallback，数学条保留规范源文本，全部在场。"""
    import logging

    content = {
        "title": "T",
        "slides": [{
            "layout": "content",
            "title": "密度极限",
            "bullets": [f"压力测试{i} $a^2+b^2=c^2$ " + "长" * 500 for i in range(12)],
        }],
    }
    with caplog.at_level(logging.INFO, logger="app.services.ppt_math_renderer"):
        prs = Presentation(create_pptx_file(content))
    slide = prs.slides[0]
    _assert_body_geometry(slide)
    assert _pictures(slide) == []  # fallback 路径不放置任何正文 PNG
    boxes = [s for s in slide.shapes if s.has_text_frame and "压力测试0" in s.text_frame.text]
    assert len(boxes) == 1
    paragraphs = [p.text for p in boxes[0].text_frame.paragraphs if p.text.strip()]
    assert len(paragraphs) == 12
    assert all("$a^2+b^2=c^2$" in p for p in paragraphs)  # 数学以源文本保留
    assert any("body-density-fallback" in r.getMessage() for r in caplog.records)
    # 公式正文绝不进入日志
    assert "a^2+b^2=c^2" not in caplog.text
    assert "压力测试" not in caplog.text
    # RB01-EXT F：whole-body fallback 的文本栈同样必须通过权威测量 fit 核算
    _assert_text_stack_measured_fit(boxes[0], 12)


def test_rb01_plain_path_still_bounded_without_math():
    """纯文本常规要点：单文本框必须落在正文可用区内（含 12 条要点）。"""
    content = {
        "title": "T",
        "slides": [{
            "layout": "content",
            "title": "常规",
            "bullets": [f"要点内容第{i}条，用于验证纯文本路径的几何边界。" for i in range(12)],
        }],
    }
    prs = Presentation(create_pptx_file(content))
    slide = prs.slides[0]
    _assert_body_geometry(slide)
    boxes = _bullet_text_shapes(slide)
    assert len(boxes) == 1  # 单文本框
    paragraphs = [p.text for p in boxes[0].text_frame.paragraphs if p.text.strip()]
    assert len(paragraphs) == 12  # 12 条要点全部在场


def test_rb02_plain_subtitle_survives_export():
    content = {
        "title": "T",
        "slides": [{
            "layout": "content",
            "title": "概念讲解",
            "subtitle": "直角三角形基础",
            "bullets": ["理解直角三角形"],
        }],
    }
    prs = Presentation(create_pptx_file(content))
    slide = prs.slides[0]
    texts = " | ".join(s.text_frame.text for s in slide.shapes if s.has_text_frame)
    assert "直角三角形基础" in texts  # 原生 PowerPoint 文本
    band = _assert_subtitle_band(slide)
    subtitle_boxes = [s for s in band if s.has_text_frame and "直角三角形基础" in s.text_frame.text]
    assert len(subtitle_boxes) == 1
    _assert_body_geometry(slide)


def test_rb02_math_subtitle_becomes_picture():
    content = {
        "title": "T",
        "slides": [{
            "layout": "content",
            "title": "概念讲解",
            "subtitle": "学习 $c=5$ 的情形",
            "bullets": ["理解直角三角形"],
        }],
    }
    prs = Presentation(create_pptx_file(content))
    slide = prs.slides[0]
    band = _assert_subtitle_band(slide)
    subtitle_pics = [s for s in band if s.shape_type == MSO_SHAPE_TYPE.PICTURE]
    assert len(subtitle_pics) == 1
    assert subtitle_pics[0].image.content_type == "image/png"
    assert _pictures(slide) == subtitle_pics  # body 无数学 → 无正文 PNG
    _assert_body_geometry(slide)


def test_rb02_malformed_subtitle_survives_as_raw_text():
    content = {
        "title": "T",
        "slides": [{
            "layout": "content",
            "title": "概念讲解",
            "subtitle": "$\\frac{1$",
            "bullets": ["理解直角三角形"],
        }],
    }
    prs = Presentation(create_pptx_file(content))
    slide = prs.slides[0]
    texts = " | ".join(s.text_frame.text for s in slide.shapes if s.has_text_frame)
    assert "$\\frac{1$" in texts  # renderer 失败 → 原样源文本，不丢
    assert _pictures(slide) == []
    _assert_subtitle_band(slide)
    _assert_body_geometry(slide)


def test_rb02_subtitle_with_max_body_stays_bounded():
    """副标题 + 满载正文：副标题带、正文区、页脚互不越界。"""
    content = {
        "title": "T",
        "slides": [{
            "layout": "content",
            "title": "满载页 $x^2$",
            "subtitle": "本页要点较多，请结合例题理解每个公式的适用条件与推导过程。" * 3,
            "bullets": [f"公式 $x^{i}+{i}=0$ 与应用要点说明" for i in range(12)],
        }],
    }
    prs = Presentation(create_pptx_file(content))
    slide = prs.slides[0]
    _assert_subtitle_band(slide)
    body = _assert_body_geometry(slide)
    assert len(body) == 12  # 12 条数学要点全部在场
    # 页脚分隔线之上无正文越界（权威下界严格小于分隔线 top）
    assert BODY_CONTENT_BOTTOM < _FOOTER_TOP - _FOOTER_SEPARATOR_LIFT


def test_rb02_no_subtitle_keeps_legacy_body_top():
    """无副标题内容页保持既有 body_top 几何，回归保护。"""
    content = {
        "title": "T",
        "slides": [{"layout": "content", "title": "常规页", "bullets": ["要点"]}],
    }
    prs = Presentation(create_pptx_file(content))
    slide = prs.slides[0]
    card_top = _card_top_of(slide)
    assert card_top == _BODY_TOP - Inches(0.12)
    _assert_body_geometry(slide)


# ---------- RB01-EXT：文本流测量契约（measurement == emission） ----------


def _plain_body_w_in():
    return (_SLIDE_W - _CONTENT_LEFT - _MARGIN) / _EMU_PER_INCH


def _plain_usable_h_in():
    return (BODY_CONTENT_BOTTOM - _BODY_TOP) / _EMU_PER_INCH


def _expected_plain_plan(bullets):
    return _plan_body_stack(bullets, _plain_body_w_in(), _plain_usable_h_in())


def _single_bullet_box(slide):
    boxes = [
        s for s in slide.shapes
        if s.has_text_frame and s.text_frame.text.strip().startswith("•")
    ]
    assert len(boxes) == 1, f"expected single body textbox, got {len(boxes)}"
    return boxes[0]


def test_rb01ext_gap_authority_planner_matches_emitted_paragraphs():
    """A（GAP A）：planner chosen font/gap 与发射的 paragraphs 完全一致；
    段 1..N-1 space_after == chosen gap，最后一段 space_after == 0。"""
    bullets = [f"短要点{i}" for i in range(12)]
    plan = _expected_plain_plan(bullets)
    # 12 条短要点在首选间距下即可放下：chosen gap 必须就是 preferred gap 本身。
    assert plan.gap_pt == _BODY_GAP_PT
    assert plan.total_h_in <= _plain_usable_h_in() + 0.01

    content = {
        "title": "T",
        "slides": [{"layout": "content", "title": "学习目标", "bullets": bullets}],
    }
    prs = Presentation(create_pptx_file(content))
    box = _single_bullet_box(prs.slides[0])
    paras = box.text_frame.paragraphs
    assert len(paras) == 12
    for j, para in enumerate(paras):
        expected_gap = Pt(plan.gap_pt) if j < len(paras) - 1 else Pt(0)
        assert para.space_after == expected_gap, f"paragraph {j} spacing mismatch"
        assert para.runs and para.runs[0].font.size == Pt(plan.font_pt), (
            f"paragraph {j} font mismatch"
        )


def test_rb01ext_twelve_short_plain_bullets_measured_fit():
    """B：12 条短 plain bullets 全部存在；权威测量占高 ≤ 可用框高；
    发射 spacing == planner spacing；shape 仍受 BODY_CONTENT_BOTTOM 约束。"""
    bullets = [f"要点内容第{i}条，覆盖常规正文密度。" for i in range(12)]
    plan = _expected_plain_plan(bullets)
    usable_h_in = _plain_usable_h_in()
    occupied = sum(plan.heights_in) + plan.gap_pt * (len(bullets) - 1) / 72.0
    assert occupied == pytest.approx(plan.total_h_in)
    assert occupied <= usable_h_in + 0.01

    content = {
        "title": "T",
        "slides": [{"layout": "content", "title": "常规", "bullets": bullets}],
    }
    prs = Presentation(create_pptx_file(content))
    slide = prs.slides[0]
    _assert_body_geometry(slide)
    box = _single_bullet_box(slide)
    paras = box.text_frame.paragraphs
    assert len([p for p in paras if p.text.strip()]) == 12
    for j, para in enumerate(paras):
        expected_gap = Pt(plan.gap_pt) if j < len(paras) - 1 else Pt(0)
        assert para.space_after == expected_gap
    _assert_text_stack_measured_fit(box, 12)


def test_rb01ext_explicit_newlines_measured_and_emitted():
    """C1：`第一行\\n第二行\\n第三行` 的显式换行被测量正确计入，
    并以同数量 <a:br/> 软换行发射。"""
    bullets = ["第一行\n第二行\n第三行"]
    plan = _expected_plain_plan(bullets)
    assert plan.line_counts == (3,)  # 3 个逻辑行一个不少
    assert plan.font_pt == _BODY_PT  # 低密度：字号保持首选
    assert plan.heights_in[0] == pytest.approx(3 * _BODY_PT * _LINE_HEIGHT_FACTOR / 72)

    content = {
        "title": "T",
        "slides": [{"layout": "content", "title": "换行要点", "bullets": bullets}],
    }
    prs = Presentation(create_pptx_file(content))
    slide = prs.slides[0]
    _assert_body_geometry(slide)
    box = _single_bullet_box(slide)
    para = box.text_frame.paragraphs[0]
    assert para.text.replace("\x0b", "\n") == "•  第一行\n第二行\n第三行"
    assert para.text.count("\x0b") == 2  # 发射的软换行数量 == 测量逻辑行数 - 1
    _assert_text_stack_measured_fit(box, 1)


def test_rb01ext_dense_newline_bullet_counts_every_logical_line():
    """C2：近 500 字符、含大量显式换行的合法 bullet——每个逻辑行都被计入，
    字号确定性下探后仍在正文区内完整呈现（不截断、不丢行）。"""
    dense = "\n".join(["内容行"] * 100)  # 100 个逻辑行，399 字符 ≤ 500
    assert len(dense) <= MAX_BULLET_LENGTH
    plan = _expected_plain_plan([dense])
    assert plan.line_counts == (100,)  # 100 个换行一个不少
    assert plan.total_h_in <= _plain_usable_h_in() + 0.01

    content = {
        "title": "T",
        "slides": [{"layout": "content", "title": "高密度换行", "bullets": [dense]}],
    }
    prs = Presentation(create_pptx_file(content))
    slide = prs.slides[0]
    _assert_body_geometry(slide)
    box = _single_bullet_box(slide)
    para = box.text_frame.paragraphs[0]
    normalized = para.text.replace("\x0b", "\n")
    lines = normalized.splitlines()
    assert len(lines) == 100  # 100 个逻辑行完整发射
    assert lines[0] == "•  内容行"
    assert lines[-1] == "内容行"
    assert para.text.count("\x0b") == 99
    # 测量 == 发射：以发射字号/框宽重新测量，与 plan 一致且不超过可用框高
    font_pt = para.runs[0].font.size.pt
    assert font_pt == plan.font_pt
    emitted_measured = _measure_text_block(
        para.text, font_pt, _usable_text_width(box.width / _EMU_PER_INCH))
    assert emitted_measured == pytest.approx(plan.heights_in[0])
    assert emitted_measured <= _plain_usable_h_in() + 0.01


def test_rb01ext_mixed_flow_newline_items_measured_and_bounded():
    """D：plain-with-newline / 合法 math / malformed fallback-with-newline /
    plain 混排页——全部条目保留、测量正确、几何有界。"""
    bullets = [
        "多行纯文本要点\n第二行要点",
        "公式 $x^2$ 要点",
        "畸形 $\\frac{1$\n换行后仍是源文本",
        "普通要点",
    ]
    content = {
        "title": "T",
        "slides": [{"layout": "content", "title": "混排换行", "bullets": bullets}],
    }
    prs = Presentation(create_pptx_file(content))
    slide = prs.slides[0]
    _assert_body_geometry(slide)
    assert len(_pictures(slide)) == 1  # 合法 math → PNG
    text_shapes = _bullet_text_shapes(slide)
    assert len(text_shapes) == 3  # 多行 plain + malformed fallback + plain
    joined = " | ".join(s.text_frame.text for s in text_shapes)
    assert "多行纯文本要点\x0b第二行要点" in joined
    assert "畸形 $\\frac{1$\x0b换行后仍是源文本" in joined
    assert "普通要点" in joined
    # 每个 flow 文本条：发射框高 == 权威测量高度（同 margins/字号模型）
    for shape in text_shapes:
        run_font = shape.text_frame.paragraphs[0].runs[0].font.size.pt
        measured = _measure_text_block(
            shape.text_frame.text, run_font, _usable_text_width(shape.width / _EMU_PER_INCH))
        assert shape.height / _EMU_PER_INCH == pytest.approx(measured, abs=0.02)


def test_rb01ext_plain_subtitle_newlines_bounded():
    """E1：多行 plain subtitle 内容完整、高度含显式换行、不覆盖 title/body card。"""
    subtitle = "第一行\n第二行\n第三行"
    content = {
        "title": "T",
        "slides": [{
            "layout": "content",
            "title": "概念讲解",
            "subtitle": subtitle,
            "bullets": ["理解直角三角形"],
        }],
    }
    prs = Presentation(create_pptx_file(content))
    slide = prs.slides[0]
    band = _assert_subtitle_band(slide)
    sub_boxes = [s for s in band if s.has_text_frame and "第一行" in s.text_frame.text]
    assert len(sub_boxes) == 1
    box = sub_boxes[0]
    assert box.text_frame.text.replace("\x0b", "\n") == subtitle
    assert box.text_frame.paragraphs[0].text.count("\x0b") == 2
    font_pt = box.text_frame.paragraphs[0].runs[0].font.size.pt
    measured = _measure_text_block(
        box.text_frame.text, font_pt, _usable_text_width(box.width / _EMU_PER_INCH))
    assert box.height / _EMU_PER_INCH == pytest.approx(measured, abs=0.02)
    assert measured <= _SUBTITLE_MAX_H / _EMU_PER_INCH + 0.01
    _assert_body_geometry(slide)


def test_rb01ext_malformed_subtitle_with_newline_survives():
    """E2：malformed-math fallback subtitle + 显式换行——原样保留、量测正确、
    不覆盖 title 与 body card，也不产生任何 PNG。"""
    subtitle = "$\\frac{1$\n第二行"
    content = {
        "title": "T",
        "slides": [{
            "layout": "content",
            "title": "概念讲解",
            "subtitle": subtitle,
            "bullets": ["理解直角三角形"],
        }],
    }
    prs = Presentation(create_pptx_file(content))
    slide = prs.slides[0]
    assert _pictures(slide) == []
    band = _assert_subtitle_band(slide)
    sub_boxes = [s for s in band if s.has_text_frame and "$\\frac{1$" in s.text_frame.text]
    assert len(sub_boxes) == 1
    box = sub_boxes[0]
    assert box.text_frame.text.replace("\x0b", "\n") == subtitle
    font_pt = box.text_frame.paragraphs[0].runs[0].font.size.pt
    measured = _measure_text_block(
        box.text_frame.text, font_pt, _usable_text_width(box.width / _EMU_PER_INCH))
    assert box.height / _EMU_PER_INCH == pytest.approx(measured, abs=0.02)
    _assert_body_geometry(slide)


# ---------- RB01-EXT2：物理可渲染性 gate（schema validity != renderability） ----------

DENSE_250_LINES = "\n".join(["x"] * 250)  # 499 字符、250 个逻辑行，schema 合法


def test_rb01ext2_body_impossible_fit_rejected():
    """A：12×250 逻辑行（共 3000 行）在绝对 floor 下物理放不下 → 受控失败。"""
    assert len(DENSE_250_LINES) <= MAX_BULLET_LENGTH
    assert PPTContent.model_validate({
        "title": "T",
        "slides": [{"layout": "content", "title": "T", "bullets": [DENSE_250_LINES] * 12}],
    })  # schema 合法
    with pytest.raises(PPTLayoutUnfitError) as exc_info:
        create_pptx_file({
            "title": "T",
            "slides": [{"layout": "content", "title": "T", "bullets": [DENSE_250_LINES] * 12}],
        })
    assert exc_info.value.reason == "body-unfit"
    # 错误本身不携带用户文本
    assert "xxx" not in str(exc_info.value)


def test_rb01ext2_boundary_floor_payload_still_renders():
    """B：恰好在绝对 floor 上能 fit 的 payload 必须成功——判断基于权威测量而非过度拒绝。"""
    assert ABSOLUTE_MIN_TEXT_PT == 2.0
    bullets = ["\n".join(["内容行"] * 100)]  # 在 floor=2pt 恰好放进正文区
    prs = Presentation(create_pptx_file({
        "title": "T",
        "slides": [{"layout": "content", "title": "边界", "bullets": bullets}],
    }))
    slide = prs.slides[0]
    _assert_body_geometry(slide)
    box = _single_bullet_box(slide)
    para = box.text_frame.paragraphs[0]
    assert para.text.count("\x0b") == 99
    assert para.runs[0].font.size == Pt(ABSOLUTE_MIN_TEXT_PT)  # floor 上被权威测量接受


def test_rb01ext2_content_subtitle_impossible_fit_rejected():
    """C：250 逻辑行 subtitle 即使在 floor 字号也远超 _SUBTITLE_MAX_H → 受控失败。"""
    with pytest.raises(PPTLayoutUnfitError) as exc_info:
        create_pptx_file({
            "title": "T",
            "slides": [{
                "layout": "content",
                "title": "T",
                "subtitle": DENSE_250_LINES,
                "bullets": ["要点"],
            }],
        })
    assert exc_info.value.reason == "content-subtitle-unfit"


def test_rb01ext2_content_title_newline_overflow_rejected():
    """D：≤255 字符高密度显式换行的 content title 在 floor 下放不进标题框 → 受控失败。"""
    title = "\n".join(["T"] * 127)  # 253 字符 ≤ 255
    assert len(title) <= MAX_TITLE_LENGTH
    with pytest.raises(PPTLayoutUnfitError) as exc_info:
        create_pptx_file({
            "title": "T",
            "slides": [{"layout": "content", "title": title, "bullets": ["要点"]}],
        })
    assert exc_info.value.reason == "content-title-unfit"


def test_rb01ext2_title_slide_title_newline_overflow_rejected():
    """E：标题页主标题同样有 fit authority。"""
    title = "\n".join(["T"] * 127)
    with pytest.raises(PPTLayoutUnfitError) as exc_info:
        create_pptx_file({
            "title": "T",
            "slides": [{"layout": "title", "title": title}],
        })
    assert exc_info.value.reason == "title-slide-title-unfit"


def test_rb01ext2_title_slide_subtitle_overflow_rejected():
    """F：标题页副标题 ≤500 字符但物理放不下 → 受控失败。"""
    with pytest.raises(PPTLayoutUnfitError) as exc_info:
        create_pptx_file({
            "title": "T",
            "slides": [{"layout": "title", "title": "主标题", "subtitle": DENSE_250_LINES}],
        })
    assert exc_info.value.reason == "title-slide-subtitle-unfit"


def test_rb01ext2_malformed_math_fallback_still_gated(caplog):
    """G：renderer 失败回退为 native text 后必须通过同一 fit gate，
    不能借 renderer failure 绕过 renderability。"""
    import logging

    bullet = "$\\frac{1$\n" + DENSE_250_LINES  # malformed math + 海量换行 → 原生回退
    with caplog.at_level(logging.WARNING, logger="app.services.ppt_service"):
        with pytest.raises(PPTLayoutUnfitError) as exc_info:
            create_pptx_file({
                "title": "T",
                "slides": [{"layout": "content", "title": "T", "bullets": [bullet]}],
            })
    assert exc_info.value.reason == "body-unfit"
    # 日志只含 reason code 与安全元数据，不含用户字段内容
    assert "body-unfit" in caplog.text
    assert "slide_index=0" in caplog.text
    assert "\\frac" not in caplog.text
    assert "xxx" not in caplog.text


def test_rb01ext2_normal_title_and_subtitle_keep_preferred_fonts():
    """常规短标题/副标题不受 gate 影响：字号保持版式首选值。"""
    prs = Presentation(create_pptx_file({
        "title": "T",
        "slides": [
            {"layout": "title", "title": "勾股定理", "subtitle": "直角三角形基础"},
            {"layout": "content", "title": "概念讲解", "subtitle": "学习要点", "bullets": ["要点"]},
        ],
    }))
    title_slide = prs.slides[0]
    title_box = next(s for s in title_slide.shapes
                     if s.has_text_frame and s.text_frame.text.strip() == "勾股定理")
    assert title_box.text_frame.paragraphs[0].runs[0].font.size == Pt(48)
    sub_box = next(s for s in title_slide.shapes
                   if s.has_text_frame and s.text_frame.text.strip() == "直角三角形基础")
    assert sub_box.text_frame.paragraphs[0].runs[0].font.size == Pt(24)
    content_slide = prs.slides[1]
    content_title = next(s for s in content_slide.shapes
                         if s.has_text_frame and s.text_frame.text.strip() == "概念讲解")
    assert content_title.text_frame.paragraphs[0].runs[0].font.size == Pt(28)


if __name__ == "__main__":
    test_ppt_clean_json_string()
    test_create_pptx_file_returns_bytes()
    test_create_pptx_file_empty_slides_title_only()
    test_create_pptx_file_content_no_bullets()
    print("test_ppt_service: 全部通过")
