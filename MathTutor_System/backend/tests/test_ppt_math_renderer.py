"""PHASE 2C-5C：有界数学渲染器测试。

覆盖：
- 无显式数学 → None（保持原生文本路径，绝不栅格化纯文本）；
- 必备公式集合 → 透明 PNG，尺寸受预算约束；
- 畸形 / 不受支持命令 / 敌对文本 → 字段级回退，绝不拖垮 deck；
- 每一条资源预算限制都要在「接受边界」与「拒绝边界」两侧验证。
"""
import io

import pytest
from PIL import Image

from app.services.ppt_math_renderer import (
    MAX_MATH_SEGMENTS_PER_DECK,
    MAX_MATH_SEGMENTS_PER_FIELD,
    MAX_MATH_SEGMENTS_PER_SLIDE,
    MAX_MATH_SOURCE_CHARS_PER_SEGMENT,
    MAX_PNG_BYTES_PER_DECK,
    MAX_PNG_BYTES_PER_IMAGE,
    MAX_RENDER_HEIGHT_PX,
    MAX_RENDER_PIXELS_PER_DECK,
    MAX_RENDER_PIXELS_PER_IMAGE,
    MAX_RENDER_WIDTH_PX,
    RENDER_DPI,
    MathFieldFallbackError,
    MathRenderer,
)
from app.services.ppt_math_text import parse_math_text

COLOR = (0.2, 0.26, 0.33)


def _render(renderer, text, *, font_pt=19, width_in=11.0):
    return renderer.field_image(text, font_pt=font_pt, color=COLOR, width_in=width_in)


def _field_with_n_math(n: int) -> str:
    return " ".join(f"$x^{i}$" for i in range(n))


def test_documented_limits_are_pinned():
    assert MAX_MATH_SEGMENTS_PER_FIELD == 8
    assert MAX_MATH_SEGMENTS_PER_SLIDE == 16
    assert MAX_MATH_SEGMENTS_PER_DECK == 120
    assert MAX_MATH_SOURCE_CHARS_PER_SEGMENT == 200
    assert RENDER_DPI == 200
    assert MAX_RENDER_WIDTH_PX == 2400
    assert MAX_RENDER_HEIGHT_PX == 1400
    assert MAX_RENDER_PIXELS_PER_IMAGE == 2_500_000
    assert MAX_RENDER_PIXELS_PER_DECK == 24_000_000
    assert MAX_PNG_BYTES_PER_IMAGE == 1_500_000
    assert MAX_PNG_BYTES_PER_DECK == 16_000_000


# ---------- plain-text path ----------


def test_plain_fields_never_rasterize():
    renderer = MathRenderer()
    for text in ("学习目标", "理解直角三角形", "本课总结", "价格是 $5", "①第一步 √2 x^2", "", "   "):
        assert _render(renderer, text) is None


def test_hostile_text_is_plain_text_never_interpreted():
    renderer = MathRenderer()
    assert _render(renderer, "<script>alert(1)</script>") is None
    assert _render(renderer, "<svg onload=alert(1)>") is None


# ---------- math path ----------


@pytest.mark.parametrize("text", [
    "$x^2$",
    "$x_1$",
    "$\\frac{a}{b}$",
    "$\\sqrt{x}$",
    "$\\pm$",
    "$\\alpha$",
    "$\\sum_{i=1}^{n} i$",
    "$$c=\\sqrt{a^2+b^2}$$",
    "当 $x=2$ 时，函数 $y=x^2+1$ 的值为 $5$。",
])
def test_required_formula_examples_render(text):
    renderer = MathRenderer()
    image = _render(renderer, text)
    assert image is not None
    with Image.open(io.BytesIO(image.png)) as im:
        assert im.format == "PNG"
        assert im.size == (image.width_px, image.height_px)
    assert 0 < image.width_px <= MAX_RENDER_WIDTH_PX
    assert 0 < image.height_px <= MAX_RENDER_HEIGHT_PX
    assert image.width_px * image.height_px <= MAX_RENDER_PIXELS_PER_IMAGE


def test_display_math_on_its_own_line():
    renderer = MathRenderer()
    image = _render(renderer, "推导如下\n$$c=\\sqrt{a^2+b^2}$$")
    assert image is not None
    # 展示公式独立成行 → 高度明显高于单行。
    single = _render(MathRenderer(), "$c=\\sqrt{a^2+b^2}$")
    assert image.height_px > single.height_px


# ---------- field-level fallback ----------


def test_malformed_delimiter_falls_back_without_killing_deck():
    renderer = MathRenderer()
    with pytest.raises(MathFieldFallbackError) as exc_info:
        _render(renderer, "$\\frac{1$")
    assert exc_info.value.reason == "malformed-math"
    # deck 继续：后续合法字段仍可渲染。RB04：失败字段的 attempt 预算不退回，
    # 由专用 reservation 测试覆盖。
    assert _render(renderer, "$y=2x+1$") is not None


def test_unsupported_command_falls_back_with_stable_reason():
    renderer = MathRenderer()
    with pytest.raises(MathFieldFallbackError) as exc_info:
        _render(renderer, "$\\href{javascript:alert(1)}{x}$")
    # reason 是稳定代号，不含公式内容，更不含 javascript 载荷。
    assert exc_info.value.reason == "malformed-math"
    assert "javascript" not in str(exc_info.value)
    assert "alert" not in str(exc_info.value)


def test_backslash_in_text_part_falls_back():
    renderer = MathRenderer()
    with pytest.raises(MathFieldFallbackError) as exc_info:
        _render(renderer, "$x$ then \\(y")
    assert exc_info.value.reason == "backslash-in-text"


def test_newline_inside_math_falls_back():
    renderer = MathRenderer()
    with pytest.raises(MathFieldFallbackError) as exc_info:
        _render(renderer, "$$x+\ny$$")
    assert exc_info.value.reason == "newline-in-math"


def test_empty_math_segment_falls_back():
    renderer = MathRenderer()
    with pytest.raises(MathFieldFallbackError) as exc_info:
        _render(renderer, "$ $")
    assert exc_info.value.reason == "empty-math"


# ---------- limits: field / slide / deck segments ----------


def test_field_segment_limit_boundaries():
    accepted = MathRenderer()
    assert _render(accepted, _field_with_n_math(MAX_MATH_SEGMENTS_PER_FIELD)) is not None

    rejected = MathRenderer()
    with pytest.raises(MathFieldFallbackError) as exc_info:
        _render(rejected, _field_with_n_math(MAX_MATH_SEGMENTS_PER_FIELD + 1))
    assert exc_info.value.reason == "segment-limit-field"
    # 被拒字段不消耗 deck 预算。
    assert rejected.deck_bytes == 0


def test_slide_segment_limit_boundaries():
    renderer = MathRenderer()
    renderer.start_slide()
    assert _render(renderer, _field_with_n_math(8)) is not None
    assert _render(renderer, _field_with_n_math(8)) is not None  # 16 = slide 上限，接受
    with pytest.raises(MathFieldFallbackError) as exc_info:
        _render(renderer, "$x$")
    assert exc_info.value.reason == "segment-limit-slide"

    fresh = MathRenderer()
    fresh.start_slide()
    assert _render(fresh, _field_with_n_math(8)) is not None
    fresh.start_slide()  # 重置 slide 计数
    assert _render(fresh, _field_with_n_math(8)) is not None


def test_deck_segment_limit_boundaries():
    renderer = MathRenderer(max_math_segments_per_deck=MAX_MATH_SEGMENTS_PER_DECK)
    for _ in range(MAX_MATH_SEGMENTS_PER_DECK // MAX_MATH_SEGMENTS_PER_FIELD):
        renderer.start_slide()
        assert _render(renderer, _field_with_n_math(MAX_MATH_SEGMENTS_PER_FIELD)) is not None
    renderer.start_slide()
    with pytest.raises(MathFieldFallbackError) as exc_info:
        _render(renderer, "$x$")
    assert exc_info.value.reason == "segment-limit-deck"


def test_deck_segment_limit_uses_injected_small_budget():
    renderer = MathRenderer(max_math_segments_per_deck=2)
    renderer.start_slide()
    assert _render(renderer, "$a$ $b$") is not None  # 恰好 2 段，接受
    renderer.start_slide()
    with pytest.raises(MathFieldFallbackError) as exc_info:
        _render(renderer, "$c$")
    assert exc_info.value.reason == "segment-limit-deck"


# ---------- limits: segment chars ----------


def test_segment_chars_limit_boundaries():
    renderer = MathRenderer()
    # 用 8pt 渲染 200 个句点：远小于宽度预算，仅验证字符数边界。
    assert _render(renderer, "$" + "." * MAX_MATH_SOURCE_CHARS_PER_SEGMENT + "$", font_pt=8) is not None
    with pytest.raises(MathFieldFallbackError) as exc_info:
        _render(renderer, "$" + "." * (MAX_MATH_SOURCE_CHARS_PER_SEGMENT + 1) + "$", font_pt=8)
    assert exc_info.value.reason == "segment-chars"


# ---------- limits: canvas / pixels / bytes ----------


def test_width_limit_boundaries():
    wide = MathRenderer()
    assert _render(wide, "当 $x=2$ 时，函数 $y=x^2+1$ 的值为 $5$。") is not None

    narrow = MathRenderer(max_render_width_px=400)
    with pytest.raises(MathFieldFallbackError) as exc_info:
        _render(narrow, "当 $x=2$ 时，函数 $y=x^2+1$ 的值为 $5$。")
    assert exc_info.value.reason == "canvas-bounds"


def test_height_limit_boundaries():
    tall_text = "\n".join(f"第{i}行 $x={i}$" for i in range(1, 7))  # 6 行 6 段，未超 field 段数上限
    renderer = MathRenderer()
    assert _render(renderer, tall_text) is not None

    short = MathRenderer(max_render_height_px=120)
    with pytest.raises(MathFieldFallbackError) as exc_info:
        _render(short, tall_text)
    assert exc_info.value.reason == "canvas-bounds"


def test_pixels_per_image_limit_boundaries():
    measured = _render(MathRenderer(), "当 $x=2$ 时")
    px = measured.width_px * measured.height_px

    exact = MathRenderer(max_render_pixels_per_image=px)
    assert _render(exact, "当 $x=2$ 时") is not None  # 等于预算 → 接受

    tiny = MathRenderer(max_render_pixels_per_image=px - 1)
    with pytest.raises(MathFieldFallbackError) as exc_info:
        _render(tiny, "当 $x=2$ 时")
    assert exc_info.value.reason == "canvas-bounds"


def test_deck_pixels_limit_boundaries():
    measured = _render(MathRenderer(), "当 $x=2$ 时")
    px = measured.width_px * measured.height_px

    exact = MathRenderer(max_render_pixels_per_deck=px)
    assert _render(exact, "当 $x=2$ 时") is not None  # 第一张恰好用尽 deck 像素预算
    with pytest.raises(MathFieldFallbackError) as exc_info:
        _render(exact, "当 $x=2$ 时")
    assert exc_info.value.reason == "deck-pixels"


def test_png_bytes_per_image_limit_boundaries():
    measured = _render(MathRenderer(), "当 $x=2$ 时")
    size = len(measured.png)

    exact = MathRenderer(max_png_bytes_per_image=size)
    assert _render(exact, "当 $x=2$ 时") is not None
    tighter = MathRenderer(max_png_bytes_per_image=size - 1)
    with pytest.raises(MathFieldFallbackError) as exc_info:
        _render(tighter, "当 $x=2$ 时")
    assert exc_info.value.reason == "png-bytes"


def test_png_bytes_per_deck_limit_boundaries():
    measured = _render(MathRenderer(), "当 $x=2$ 时")
    size = len(measured.png)

    exact = MathRenderer(max_png_bytes_per_deck=size)
    assert _render(exact, "当 $x=2$ 时") is not None
    with pytest.raises(MathFieldFallbackError) as exc_info:
        _render(exact, "当 $x=2$ 时")
    assert exc_info.value.reason == "deck-bytes"


def test_fallback_logs_reason_not_formula(caplog):
    import logging

    from app.services.ppt_math_renderer import field_fallback_log

    with caplog.at_level(logging.INFO, logger="app.services.ppt_math_renderer"):
        field_fallback_log("malformed-math")
    assert "malformed-math" in caplog.text


# ---------- RB04：render attempt 预算（渲染前预留，失败不退回） ----------


def _spy_render_lines(monkeypatch):
    """统计真正进入 _render_lines（Figure/canvas.draw）的次数。"""
    calls = {"render": 0}
    original = MathRenderer._render_lines

    def counting(self, lines, **kwargs):
        calls["render"] += 1
        return original(self, lines, **kwargs)

    monkeypatch.setattr(MathRenderer, "_render_lines", counting)
    return calls


def test_failed_renders_consume_attempt_budget(monkeypatch):
    calls = _spy_render_lines(monkeypatch)
    renderer = MathRenderer(max_math_segments_per_deck=3)
    renderer.start_slide()
    # 预算内：3 个畸形字段（各 1 段）都真正进入渲染器，全部失败。
    for _ in range(3):
        with pytest.raises(MathFieldFallbackError) as exc_info:
            _render(renderer, "$\\href{javascript:alert(1)}{x}$")
        assert exc_info.value.reason == "malformed-math"
    assert calls["render"] == 3

    # 预算耗尽：下一次不再进入 actual renderer，直接被 attempt 预算拒绝。
    with pytest.raises(MathFieldFallbackError) as exc_info:
        _render(renderer, "$x$")
    assert exc_info.value.reason == "segment-limit-deck"
    assert calls["render"] == 3


def test_attempt_budget_has_no_refund_for_mixed_success_and_failure(monkeypatch):
    calls = _spy_render_lines(monkeypatch)
    renderer = MathRenderer(max_math_segments_per_deck=3)
    renderer.start_slide()
    with pytest.raises(MathFieldFallbackError):
        _render(renderer, "$\\frac{1$")  # 失败：消耗 1 段，不退回
    assert _render(renderer, "$a$") is not None          # 成功：消耗 1 段
    assert _render(renderer, "$b$") is not None          # 成功：消耗第 3 段（边界值可尝试）
    assert calls["render"] == 3
    with pytest.raises(MathFieldFallbackError) as exc_info:
        _render(renderer, "$c$")
    assert exc_info.value.reason == "segment-limit-deck"
    assert calls["render"] == 3  # 不再进入渲染器


def test_attempt_budget_is_per_slide_and_per_deck(monkeypatch):
    calls = _spy_render_lines(monkeypatch)
    renderer = MathRenderer(max_math_segments_per_slide=2, max_math_segments_per_deck=100)
    renderer.start_slide()
    with pytest.raises(MathFieldFallbackError):
        _render(renderer, "$\\frac{1$")  # attempt 1：进入渲染器，失败，消耗 1 段
    with pytest.raises(MathFieldFallbackError):
        _render(renderer, "$\\frac{2$")  # attempt 2：边界值仍可尝试，失败
    assert calls["render"] == 2
    with pytest.raises(MathFieldFallbackError) as exc_info:
        _render(renderer, "$x$")
    assert exc_info.value.reason == "segment-limit-slide"  # slide 预算拒绝，不进渲染器
    assert calls["render"] == 2

    renderer.start_slide()  # slide 计数重置，但 deck 计数不重置
    assert _render(renderer, "$y$") is not None
    assert calls["render"] == 3


def test_attempt_budget_rejects_without_entering_renderer_after_failures(monkeypatch):
    """失败公式不能无限放大昂贵工作量：进入渲染器的次数受 deck 预算硬封顶。"""
    calls = _spy_render_lines(monkeypatch)
    budget = 5
    renderer = MathRenderer(max_math_segments_per_deck=budget)
    for i in range(50):
        renderer.start_slide()
        try:
            _render(renderer, "$\\href{x}{y}$")
        except MathFieldFallbackError:
            pass
    assert calls["render"] == budget  # 50 次请求最多只有 budget 次真正渲染


# ---------- RF06：display 数学独立成行的三段 visual-line 语义 ----------


def test_display_math_with_surrounding_text_forms_three_lines():
    parts = parse_math_text("前 $$x=1$$ 后")
    lines = MathRenderer._build_lines(parts)
    assert lines == ["前", "$x=1$", "后"]


def test_bracket_display_with_surrounding_text_forms_three_lines():
    parts = parse_math_text("前 \\[y=2x+1\\] 后")
    lines = MathRenderer._build_lines(parts)
    assert lines == ["前", "$y=2x+1$", "后"]


def test_inline_math_with_surrounding_text_stays_single_line():
    parts = parse_math_text("前 $x$ 后")
    lines = MathRenderer._build_lines(parts)
    assert lines == ["前 $x$ 后"]


def test_consecutive_display_math_each_own_line():
    parts = parse_math_text("$$a$$ 中间 $$b$$")
    lines = MathRenderer._build_lines(parts)
    assert lines == ["$a$", "中间", "$b$"]


def test_display_block_renders_taller_than_inline_single_line():
    display = _render(MathRenderer(), "前 $$x=1$$ 后")
    inline = _render(MathRenderer(), "前 $x=1$ 后")
    assert display is not None and inline is not None
    assert display.height_px > inline.height_px  # 3 行 vs 1 行
