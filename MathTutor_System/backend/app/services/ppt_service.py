"""
Magic PPT 生成服务：用 DeepSeek 生成讲稿 JSON，再用 python-pptx 生成 .pptx 文件。
采用空白布局 + 自定义版式，统一配色与字体层级，呈现更美观、专业的教学风格。

PHASE 2C-5：含显式数学定界符的字段经 ppt_math_renderer 渲染为透明 PNG
（字段级：title / subtitle / 单条 bullet），其余字段保持原生可编辑文本；
字段渲染失败时回退为规范源文本的纯文本展示。
"""
import math
from io import BytesIO
from typing import Any, NamedTuple

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.util import Inches, Pt

from app.services.ppt_content_service import (
    clean_json_string as _clean_json_string,
    generate_lecture_content,
)
from app.services.ppt_math_text import has_explicit_math
from app.services.ppt_math_renderer import (
    RENDER_DPI,
    MathFieldFallbackError,
    MathFieldImage,
    MathRenderer,
    field_fallback_log,
)

# 版式常量（16:9 宽屏）
_SLIDE_W = Inches(13.333)
_SLIDE_H = Inches(7.5)
_MARGIN = Inches(0.85)
_CONTENT_LEFT = Inches(1.15)   # 内容区左边界（留出竖条后）
_ACCENT_BAR_W = Inches(0.18)   # 左侧竖条略宽，更醒目
_TITLE_TOP = Inches(0.55)
_TITLE_BOX_H = Inches(0.75)
_BODY_TOP = Inches(1.45)
_BODY_TOP_NO_TITLE = Inches(1.0)
_FOOTER_TOP = Inches(6.85)
_FONT_NAME = "Microsoft YaHei"

# ---- RB01：正文几何权威 ----
# 内容卡底边与正文可用下界都从 _FOOTER_TOP 推导：页脚分隔线位于
# _FOOTER_TOP - _FOOTER_SEPARATOR_LIFT，正文任何 shape（原生文本框或数学 PNG）
# 的底边都不得超过 BODY_CONTENT_BOTTOM。除此之外不得再引入正文下界 magic number。
_FOOTER_SEPARATOR_LIFT = Pt(10)   # 页脚分隔线相对 _FOOTER_TOP 的上移量
_CARD_BOTTOM_PAD = Inches(0.15)   # 内容卡底边与页脚的间距
_BODY_BOTTOM_PAD = Inches(0.08)   # 正文最后一条与内容卡底边的余量
_CARD_BOTTOM = _FOOTER_TOP - _CARD_BOTTOM_PAD
BODY_CONTENT_BOTTOM = _CARD_BOTTOM - _BODY_BOTTOM_PAD

# ---- 正文有界排布参数（RB01 deterministic bounded layout）----
_BODY_PT = 19                     # 正文首选字号（沿用既有值）
_BODY_MIN_PT = 11                 # 流式布局正文字号下限；低于此转入 whole-body fallback
_MIN_IMAGE_SCALE = 0.25           # 数学 PNG 等比收缩下限；低于此转入 whole-body fallback
_BODY_FONT_LADDER_STEP = 1.0      # whole-body fallback 字号步进
_LAYOUT_EPS_IN = 0.01             # 几何比较容差（英寸）

# ---- RB01-EXT：文本流测量契约（measurement == emission）----
# 行高系数与文本框内边距都是发射与测量共用的唯一模型：
# 写入 PowerPoint 的每个正文/副标题文本框都显式应用 _apply_textbox_margins，
# 测量高度一律用 _measure_text_block（newline 先切逻辑行、逐行按可用宽度 soft-wrap）。
_LINE_HEIGHT_FACTOR = 1.45        # 单行高度 = font_pt * 该系数 / 72 英寸
_TEXTBOX_H_MARGIN = Inches(0.05)  # 文本框左右内边距（显式常量，计入可用宽度）
_TEXTBOX_V_MARGIN = 0             # 文本框上下内边距显式为 0：框高即内容可用高
_BODY_GAP_PT = 16.0               # 首选段间距（pt）
_BODY_GAP_MIN_PT = 6.0            # 收缩后的最小段间距（pt）

# ---- 内容页副标题（RB02 export semantics）----
_SUBTITLE_PT = 14
_SUBTITLE_MIN_PT = 10
_SUBTITLE_MAX_H = Inches(1.1)
_SUBTITLE_TOP_PAD = Inches(0.06)   # 标题块与副标题间距
_SUBTITLE_BODY_GAP = Inches(0.18)  # 副标题与内容卡间距

# 配色：现代教学风（主色蓝 + 辅色青 + 暖白底）
_BG = RGBColor(0xFA, 0xFC, 0xFE)            # 极浅蓝白背景
_BG_CARD = RGBColor(0xFF, 0xFF, 0xFF)        # 内容卡片白
_ACCENT = RGBColor(0x1D, 0x4E, 0xD8)         # 主蓝（更鲜亮）
_ACCENT_SOFT = RGBColor(0x3B, 0x82, 0xF6)   # 亮蓝（标题/强调）
_ACCENT_TEAL = RGBColor(0x0D, 0x94, 0x8D)    # 青绿（小装饰）
_TITLE_COLOR = RGBColor(0x0C, 0x12, 0x24)   # 深色主标题
_SUBTITLE_COLOR = RGBColor(0x47, 0x5A, 0x69)
_BODY_COLOR = RGBColor(0x33, 0x43, 0x54)    # 正文略深，更易读
_FOOTER_COLOR = RGBColor(0x94, 0xA3, 0xB8)
_SECTION_BG = RGBColor(0x1D, 0x4E, 0xD8)
_SECTION_GRADIENT_END = RGBColor(0x25, 0x6E, 0xE0)   # 略亮蓝，渐变用
_ACCENT_GRADIENT_END = RGBColor(0x0D, 0x94, 0x8D)  # 蓝到青绿渐变
_SECTION_TITLE = RGBColor(0xFF, 0xFF, 0xFF)
_LINE_LIGHT = RGBColor(0xE2, 0xE8, 0xF0)
_CARD_SHADOW = RGBColor(0xF1, 0xF5, 0xF9)
_SHADOW_COLOR = RGBColor(0xE2, 0xE8, 0xF0)   # 卡片阴影


# 字号（略放大，层次更清晰）
_TITLE_SLIDE_TITLE_PT = 48
_TITLE_SLIDE_SUBTITLE_PT = 24
_SECTION_TITLE_PT = 34
_CONTENT_TITLE_PT = 28
_BODY_PT = 19
_FOOTER_PT = 11

_EMU_PER_INCH = 914400


def _rgb(color: RGBColor) -> tuple[float, float, float]:
    return (color[0] / 255, color[1] / 255, color[2] / 255)


def _set_run_font(run, font_pt: int, color: RGBColor, bold: bool = False) -> None:
    run.font.size = Pt(font_pt)
    run.font.color.rgb = color
    run.font.bold = bold
    run.font.name = _FONT_NAME


def _set_para_font(para, font_pt: int, color: RGBColor) -> None:
    for run in para.runs:
        run.font.size = Pt(font_pt)
        run.font.color.rgb = color
        run.font.name = _FONT_NAME


def _slide_background(slide, color: RGBColor) -> None:
    try:
        fill = slide.background.fill
        fill.solid()
        fill.fore_color.rgb = color
    except Exception:
        pass


def _apply_gradient(shape, color_start: RGBColor, color_end: RGBColor, angle_deg: float = 90) -> None:
    """为形状应用线性渐变（自上而下 angle=90）。"""
    try:
        fill = shape.fill
        fill.gradient()
        fill.gradient_angle = angle_deg
        stops = fill.gradient_stops
        if len(stops) >= 2:
            stops[0].position = 0.0
            stops[0].color.rgb = color_start
            stops[1].position = 1.0
            stops[1].color.rgb = color_end
    except Exception:
        shape.fill.solid()
        shape.fill.fore_color.rgb = color_start


def _try_render_field(
    renderer: MathRenderer, text: str, *, font_pt: float, color: RGBColor, width_in: float
) -> MathFieldImage | None:
    """渲染含数学字段；任何字段级失败回退为原生文本（记录稳定代号）。"""
    try:
        return renderer.field_image(text, font_pt=font_pt, color=_rgb(color), width_in=width_in)
    except MathFieldFallbackError as fallback:
        field_fallback_log(fallback.reason)
        return None


def _fit_picture(image: MathFieldImage, max_w_in: float, max_h_in: float) -> tuple[float, float]:
    """按原始 DPI 尺寸适配到字段框内（等比，只缩不放过大写）。"""
    nat_w = image.width_px / RENDER_DPI
    nat_h = image.height_px / RENDER_DPI
    w = min(nat_w, max_w_in)
    h = w * nat_h / nat_w
    if h > max_h_in:
        h = max_h_in
        w = h * nat_w / nat_h
    return w, h


def _add_field_picture(shapes, image: MathFieldImage, left_in: float, top_in: float,
                       box_w_in: float, box_h_in: float, align: str = "left") -> float:
    """把字段 PNG 放入指定框；返回实际占用高度（英寸）。"""
    w, h = _fit_picture(image, box_w_in, box_h_in)
    left = left_in if align == "left" else left_in + (box_w_in - w) / 2
    shapes.add_picture(BytesIO(image.png), int(left * _EMU_PER_INCH), int(top_in * _EMU_PER_INCH),
                       width=int(w * _EMU_PER_INCH), height=int(h * _EMU_PER_INCH))
    return h


# ---- RB01/RB01-EXT：确定性有界正文排布与文本流测量契约 ----


def _count_block_lines(text: str, font_pt: float, usable_w_in: float) -> int:
    """单一权威行数模型：显式换行（\\n 与 <a:br/> 对应）先切逻辑行，
    每个逻辑行再按可用宽度 soft-wrap；全角字符按 1 个全宽计。"""
    per_line = max(1.0, usable_w_in * 72.0 / font_pt)
    count = 0
    for logical_line in text.splitlines() or [""]:
        units = sum(2 if ord(c) > 0x2E80 else 1 for c in logical_line) / 2
        count += max(1, math.ceil(units / per_line))
    return count


def _measure_text_block(text: str, font_pt: float, usable_w_in: float) -> float:
    """单一权威段落块高度（英寸）。planner 与 writer 必须都用本函数：
    发射端每个正文/副标题文本框都带 _apply_textbox_margins 写入的同一 margins，
    显式换行经 paragraph.text setter 变成 <a:br/> 软换行，语义与此测量一致。"""
    return _count_block_lines(text, font_pt, usable_w_in) * font_pt * _LINE_HEIGHT_FACTOR / 72.0


def _usable_text_width(box_w_in: float) -> float:
    """文本框可用宽度：显式减去 _apply_textbox_margins 写入的左右内边距。"""
    return box_w_in - 2.0 * (_TEXTBOX_H_MARGIN / _EMU_PER_INCH)


def _apply_textbox_margins(box) -> None:
    """显式写入文本框内边距（上下 0、左右已知常量）——测量契约的发射半边。"""
    frame = box.text_frame
    frame.margin_top = _TEXTBOX_V_MARGIN
    frame.margin_bottom = _TEXTBOX_V_MARGIN
    frame.margin_left = _TEXTBOX_H_MARGIN
    frame.margin_right = _TEXTBOX_H_MARGIN


class TextBlockLayout(NamedTuple):
    """正文文本栈的确定性排布计划（backend 内部布局契约，不暴露给客户端）。

    planner 用它评估是否放得下；writer 按同一 font_pt/gap_pt 发射：
    段 1..N-1 space_after = gap_pt，最后一段 space_after = 0。
    """
    font_pt: float
    gap_pt: float
    line_counts: tuple[int, ...]
    heights_in: tuple[float, ...]
    total_h_in: float


def _plan_body_stack(body_lines: list[str], box_w_in: float, usable_h_in: float) -> TextBlockLayout:
    """确定性求解正文 (font, gap)：首选间距优先，其次最小间距，字号逐级下探；
    全部候选都用同一测量权威评估。极端密度允许字号低于可读下限，
    该产品债登记为 PPT_SLIDE_CONTENT_DENSITY_LIMIT；内容绝不截断或丢弃。
    box_w_in 为文本框全宽；可用宽度由 _usable_text_width 权威扣除。"""
    usable_w_in = _usable_text_width(box_w_in)

    def build(font_pt: float, gap_pt: float) -> TextBlockLayout:
        labels = [f"•  {line}" for line in body_lines]
        line_counts = tuple(_count_block_lines(t, font_pt, usable_w_in) for t in labels)
        heights = tuple(_measure_text_block(t, font_pt, usable_w_in) for t in labels)
        gaps_in = gap_pt * (len(labels) - 1) / 72.0
        return TextBlockLayout(font_pt, gap_pt, line_counts, heights, sum(heights) + gaps_in)

    for gap_pt in (_BODY_GAP_PT, _BODY_GAP_MIN_PT):
        font = float(_BODY_PT)
        while font >= _BODY_MIN_PT:
            plan = build(font, gap_pt)
            if plan.total_h_in <= usable_h_in + _LAYOUT_EPS_IN:
                return plan
            font -= _BODY_FONT_LADDER_STEP
    font = float(_BODY_MIN_PT)
    while font > _BODY_FONT_LADDER_STEP:
        font -= _BODY_FONT_LADDER_STEP
        plan = build(font, _BODY_GAP_MIN_PT)
        if plan.total_h_in <= usable_h_in + _LAYOUT_EPS_IN:
            return plan
    return build(font, _BODY_GAP_MIN_PT)


def _add_plain_body(shapes, body_lines: list[str], body_top: int, body_w: int) -> None:
    """无数学正文：单文本框。字号/段间距由 _plan_body_stack 确定性求解，
    emission 与测量完全一致（同 margins、同字号、段 1..N-1 space_after=gap、
    最后一段 space_after=0）。"""
    avail_h_in = (BODY_CONTENT_BOTTOM - body_top) / _EMU_PER_INCH
    plan = _plan_body_stack(body_lines, body_w / _EMU_PER_INCH, avail_h_in)
    box = shapes.add_textbox(_CONTENT_LEFT, body_top, body_w, int(avail_h_in * _EMU_PER_INCH))
    box.text_frame.word_wrap = True
    _apply_textbox_margins(box)
    last_index = len(body_lines) - 1
    for j, line in enumerate(body_lines):
        if j == 0:
            para = box.text_frame.paragraphs[0]
        else:
            para = box.text_frame.add_paragraph()
        para.text = f"•  {line}"
        para.space_after = Pt(plan.gap_pt) if j < last_index else Pt(0)
        para.level = 0
        _set_para_font(para, int(plan.font_pt), _BODY_COLOR)


def _measure_flow_items(renderer, body_lines: list[str], body_w_in: float,
                        box_h_in: float) -> list[dict]:
    """逐条量测：数学条渲染为 PNG（field 级失败回退源文本），文本条用测量权威。"""
    usable_w_in = _usable_text_width(body_w_in)
    items: list[dict] = []
    for line in body_lines:
        labeled = f"•  {line}"
        image = _try_render_field(renderer, labeled, font_pt=_BODY_PT,
                                  color=_BODY_COLOR, width_in=body_w_in) if renderer else None
        if image is not None:
            w, h = _fit_picture(image, body_w_in, box_h_in)
            items.append({"kind": "picture", "image": image, "w": w, "h": h})
        else:
            items.append({"kind": "text", "text": labeled, "font_pt": _BODY_PT,
                          "h": _measure_text_block(labeled, _BODY_PT, usable_w_in)})
    return items


def _flow_total_h(items: list[dict], gap_in: float) -> float:
    if not items:
        return 0.0
    return sum(item["h"] for item in items) + gap_in * (len(items) - 1)


def _place_flow_items(shapes, items: list[dict], body_top_in: float,
                      gap_in: float, body_w_in: float, avail_h_in: float) -> None:
    """按已成功的排布方案放置所有正文 shape（只放不测，保证几何确定）。"""
    y = body_top_in
    for index, item in enumerate(items):
        if item["kind"] == "picture":
            _add_field_picture(shapes, item["image"], _CONTENT_LEFT / _EMU_PER_INCH, y,
                               item["w"], item["h"], align="left")
        else:
            box_h_in = max(item["h"], 0.05)
            box = shapes.add_textbox(_CONTENT_LEFT, int(y * _EMU_PER_INCH),
                                     int(body_w_in * _EMU_PER_INCH), int(box_h_in * _EMU_PER_INCH))
            box.text_frame.word_wrap = True
            _apply_textbox_margins(box)
            para = box.text_frame.paragraphs[0]
            para.text = item["text"]
            _set_para_font(para, int(item["font_pt"]), _BODY_COLOR)
        y += item["h"] + (gap_in if index < len(items) - 1 else 0.0)
    # 最终防线：浮点累计不得越过权威下界（正常路径由成功校验保证，不会触发）。
    if y > body_top_in + avail_h_in + _LAYOUT_EPS_IN:
        field_fallback_log("body-layout-overflow-guard")


def _add_bounded_flow_body(shapes, renderer, body_lines: list[str],
                           body_top: int, body_w: int) -> None:
    """数学混排正文：先量测全部条目，再在首选间距 → 最小间距 → 等比收缩三级
    策略中选择第一个能放进正文可用区的方案；全部失败才转入 whole-body fallback。
    任何路径都不丢字段、不越出 BODY_CONTENT_BOTTOM。"""
    body_top_in = body_top / _EMU_PER_INCH
    avail_h_in = (BODY_CONTENT_BOTTOM - body_top) / _EMU_PER_INCH
    body_w_in = body_w / _EMU_PER_INCH
    gap_pref_in = _BODY_GAP_PT / 72.0
    gap_min_in = _BODY_GAP_MIN_PT / 72.0
    single_box_h_in = max(0.2, avail_h_in - gap_min_in)

    items = _measure_flow_items(renderer, body_lines, body_w_in, single_box_h_in)

    if _flow_total_h(items, gap_pref_in) <= avail_h_in + _LAYOUT_EPS_IN:
        _place_flow_items(shapes, items, body_top_in, gap_pref_in, body_w_in, avail_h_in)
        return
    if _flow_total_h(items, gap_min_in) <= avail_h_in + _LAYOUT_EPS_IN:
        _place_flow_items(shapes, items, body_top_in, gap_min_in, body_w_in, avail_h_in)
        return

    # 等比收缩：文本字号降到 _BODY_MIN_PT（同一测量权威重量），PNG 按剩余空间等比缩放。
    flow_usable_w_in = _usable_text_width(body_w_in)
    scaled: list[dict] = []
    for item in items:
        if item["kind"] == "text":
            scaled.append({**item, "font_pt": _BODY_MIN_PT,
                           "h": _measure_text_block(item["text"], _BODY_MIN_PT, flow_usable_w_in)})
        else:
            scaled.append({**item})
    gaps_h = gap_min_in * max(0, len(scaled) - 1)
    text_h = sum(i["h"] for i in scaled if i["kind"] == "text")
    image_h = sum(i["h"] for i in scaled if i["kind"] == "picture")
    image_avail = avail_h_in - gaps_h - text_h
    scale = min(1.0, image_avail / image_h) if image_h > 0 else 1.0
    if image_avail >= -_LAYOUT_EPS_IN and scale >= _MIN_IMAGE_SCALE:
        for item in scaled:
            if item["kind"] == "picture":
                item["w"] *= scale
                item["h"] *= scale
        if _flow_total_h(scaled, gap_min_in) <= avail_h_in + _LAYOUT_EPS_IN:
            _place_flow_items(shapes, scaled, body_top_in, gap_min_in, body_w_in, avail_h_in)
            return

    # whole-body safe fallback：合法但密度超出任何可读布局 → 全部条目合并进单个
    # 原生文本框（数学条保留规范源文本），确定性求解字号直至放进正文可用区。
    field_fallback_log("body-density-fallback")
    _add_plain_body(shapes, body_lines, body_top, body_w)


def _add_footer(shapes, slide_num: int, total: int, left=_MARGIN) -> None:
    footer_left = shapes.add_textbox(left, _FOOTER_TOP - Pt(2), Inches(2.5), Inches(0.35))
    footer_left.text_frame.paragraphs[0].text = "初中数学"
    _set_para_font(footer_left.text_frame.paragraphs[0], _FOOTER_PT, _FOOTER_COLOR)
    footer_right = shapes.add_textbox(_SLIDE_W - _MARGIN - Inches(1.1), _FOOTER_TOP - Pt(2), Inches(1.1), Inches(0.35))
    footer_right.text_frame.paragraphs[0].text = f"{slide_num:02d} / {total:02d}"
    footer_right.text_frame.paragraphs[0].alignment = 2
    for run in footer_right.text_frame.paragraphs[0].runs:
        _set_run_font(run, 13, _ACCENT_SOFT, bold=True)


def _add_title_slide(prs, slide_spec: dict, presentation_title: str, total: int = 1,
                     renderer: MathRenderer | None = None) -> None:
    """标题页：顶部色条 + 居中大标题 + 副标题 + 双色装饰线。"""
    blank = prs.slide_layouts[6]
    slide = prs.slides.add_slide(blank)
    _slide_background(slide, _BG)
    shapes = slide.shapes

    title_text = slide_spec.get("title") or presentation_title
    subtitle_text = (slide_spec.get("subtitle") or "").strip()

    # 顶部主色条（圆角 + 蓝→青绿渐变）
    bar_h = Inches(0.38)
    bar_top = Inches(0.45)
    bar_left = Inches(1.2)
    bar_w = _SLIDE_W - Inches(2.4)
    top_bar = shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, bar_left, bar_top, bar_w, bar_h)
    _apply_gradient(top_bar, _ACCENT, _ACCENT_GRADIENT_END, 0)
    top_bar.line.fill.background()

    # 右上角品牌角标
    badge_w = Inches(1.0)
    badge_h = Inches(0.28)
    badge = shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, _SLIDE_W - badge_w - Inches(0.5), Inches(0.5), badge_w, badge_h)
    badge.fill.solid()
    badge.fill.fore_color.rgb = _ACCENT_TEAL
    badge.line.fill.background()
    badge_tf = shapes.add_textbox(_SLIDE_W - badge_w - Inches(0.5), Inches(0.52), badge_w, badge_h)
    badge_tf.text_frame.paragraphs[0].text = "初中数学"
    badge_tf.text_frame.paragraphs[0].alignment = 1
    for run in badge_tf.text_frame.paragraphs[0].runs:
        _set_run_font(run, 12, _SECTION_TITLE, bold=True)

    # 标题（居中；含显式数学时渲染为图片，其余保持原生文本）
    tx_w = Inches(10)
    tx_left = (_SLIDE_W - tx_w) / 2
    title_image = _try_render_field(renderer, title_text, font_pt=_TITLE_SLIDE_TITLE_PT,
                                    color=_TITLE_COLOR, width_in=tx_w / _EMU_PER_INCH) if renderer else None
    if title_image is not None:
        _add_field_picture(shapes, title_image, tx_left / _EMU_PER_INCH, Inches(1.55) / _EMU_PER_INCH,
                           tx_w / _EMU_PER_INCH, Inches(1.5) / _EMU_PER_INCH, align="center")
    else:
        title_box = shapes.add_textbox(tx_left, Inches(1.55), tx_w, Inches(1.5))
        tf = title_box.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = title_text
        p.alignment = 1
        p.space_after = Pt(18)
        for run in p.runs:
            _set_run_font(run, _TITLE_SLIDE_TITLE_PT, _TITLE_COLOR, bold=True)

    # 双线装饰：主色 + 青绿（圆角细条）
    line_w = Inches(2.2)
    line_left = (_SLIDE_W - line_w) / 2
    line_top = Inches(3.15)
    l1 = shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, line_left, line_top, line_w, Pt(4))
    l1.fill.solid()
    l1.fill.fore_color.rgb = _ACCENT
    l1.line.fill.background()
    l2 = shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, line_left, line_top + Pt(6), line_w * 0.55, Pt(2.5))
    l2.fill.solid()
    l2.fill.fore_color.rgb = _ACCENT_TEAL
    l2.line.fill.background()

    if subtitle_text:
        sub_image = _try_render_field(renderer, subtitle_text, font_pt=_TITLE_SLIDE_SUBTITLE_PT,
                                      color=_SUBTITLE_COLOR, width_in=tx_w / _EMU_PER_INCH) if renderer else None
        if sub_image is not None:
            _add_field_picture(shapes, sub_image, tx_left / _EMU_PER_INCH, Inches(3.6) / _EMU_PER_INCH,
                               tx_w / _EMU_PER_INCH, Inches(0.9) / _EMU_PER_INCH, align="center")
        else:
            sub_box = shapes.add_textbox(tx_left, Inches(3.6), tx_w, Inches(0.9))
            sub_tf = sub_box.text_frame
            sub_tf.word_wrap = True
            sp = sub_tf.paragraphs[0]
            sp.text = subtitle_text
            sp.alignment = 1
            for run in sp.runs:
                _set_run_font(run, _TITLE_SLIDE_SUBTITLE_PT, _SUBTITLE_COLOR)

    # 页脚：左品牌 + 右页码（与内容页一致）
    _add_footer(shapes, 1, total)


def _add_section_slide(prs, slide_spec: dict, slide_num: int, total: int) -> None:
    """分节页：圆角顶条 + 青绿 accent 线 + 白色大标题 + 圆角提示卡。"""
    blank = prs.slide_layouts[6]
    slide = prs.slides.add_slide(blank)
    _slide_background(slide, _BG)
    shapes = slide.shapes

    # 顶部主色条（圆角 + 蓝→青绿渐变）
    bar_h = Inches(1.78)
    bar = shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, 0, 0, _SLIDE_W, bar_h)
    _apply_gradient(bar, _SECTION_BG, _ACCENT_GRADIENT_END, 0)
    bar.line.fill.background()

    # 条下方细 accent 线（青绿）
    accent_h = Pt(4)
    accent_bar = shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, bar_h, _SLIDE_W, accent_h)
    accent_bar.fill.solid()
    accent_bar.fill.fore_color.rgb = _ACCENT_TEAL
    accent_bar.line.fill.background()

    title_text = (slide_spec.get("title") or "本节要点").strip()
    tx_w = _SLIDE_W - _MARGIN * 2
    title_box = shapes.add_textbox(_MARGIN, Inches(0.5), tx_w, Inches(1.0))
    tf = title_box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = title_text
    for run in p.runs:
        _set_run_font(run, _SECTION_TITLE_PT, _SECTION_TITLE, bold=True)

    # 中部：圆角浅色卡 + 提示文字
    hint = "以下为本章内容"
    card_w = Inches(5)
    card_h = Inches(1.2)
    card_left = (_SLIDE_W - card_w) / 2
    card_top = Inches(3.2)
    card = shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, card_left, card_top, card_w, card_h)
    card.fill.solid()
    card.fill.fore_color.rgb = _CARD_SHADOW
    card.line.color.rgb = _LINE_LIGHT
    card.line.width = Pt(0.5)
    hint_box = shapes.add_textbox(card_left + Inches(0.3), card_top + Inches(0.35), card_w - Inches(0.6), Inches(0.5))
    hint_tf = hint_box.text_frame
    hint_tf.paragraphs[0].text = f"—— {hint} ——"
    hint_tf.paragraphs[0].alignment = 1
    for run in hint_tf.paragraphs[0].runs:
        _set_run_font(run, 15, RGBColor(0x94, 0xA3, 0xB8))

    # 页脚：左品牌 + 右页码
    _add_footer(shapes, slide_num, total)


def _add_content_subtitle(shapes, renderer, subtitle_text: str, sub_left_in: float,
                          sub_w_in: float, subtitle_top_in: float) -> float:
    """内容页副标题（RB02/RB01-EXT）：plain → 原生文本，数学 → 字段 PNG，
    失败 → 规范源文本。plain/malformed 分支用同一测量权威（newline-aware、
    margin-aware）确定性求解字号，占高封顶 _SUBTITLE_MAX_H，返回副标题底边
    （英寸）供调用方推导正文起点；绝不与标题、正文卡、页脚互相覆盖。"""
    sub_max_h_in = _SUBTITLE_MAX_H / _EMU_PER_INCH
    image = _try_render_field(renderer, subtitle_text, font_pt=_SUBTITLE_PT,
                              color=_SUBTITLE_COLOR, width_in=sub_w_in) if renderer else None
    if image is not None:
        w, h = _fit_picture(image, sub_w_in, sub_max_h_in)
        _add_field_picture(shapes, image, sub_left_in, subtitle_top_in, w, h, align="left")
        return subtitle_top_in + h

    usable_sub_w_in = _usable_text_width(sub_w_in)
    font = float(_SUBTITLE_PT)
    while (font > 1.0
           and _measure_text_block(subtitle_text, font, usable_sub_w_in) > sub_max_h_in):
        font -= _BODY_FONT_LADDER_STEP
    measured_h_in = _measure_text_block(subtitle_text, font, usable_sub_w_in)
    box_h_in = min(sub_max_h_in, max(measured_h_in, 0.2))
    box = shapes.add_textbox(int(sub_left_in * _EMU_PER_INCH), int(subtitle_top_in * _EMU_PER_INCH),
                             int(sub_w_in * _EMU_PER_INCH), int(box_h_in * _EMU_PER_INCH))
    box.text_frame.word_wrap = True
    _apply_textbox_margins(box)
    para = box.text_frame.paragraphs[0]
    para.text = subtitle_text
    _set_para_font(para, int(font), _SUBTITLE_COLOR)
    return subtitle_top_in + box_h_in


def _add_content_slide(prs, slide_spec: dict, slide_num: int, total: int,
                       renderer: MathRenderer | None = None) -> None:
    """内容页：左侧竖条 + 标题（带青绿 accent）+ 可选副标题 + 白色圆角内容卡 + 有界正文 + 页脚。

    RB01：正文任何 shape（原生文本框或数学 PNG）都由确定性有界排布放入
    [body_top, BODY_CONTENT_BOTTOM]；RB02：subtitle 拥有明确 export 语义且
    不与标题/正文/页脚互相覆盖。
    """
    blank = prs.slide_layouts[6]
    slide = prs.slides.add_slide(blank)
    _slide_background(slide, _BG)
    shapes = slide.shapes

    # 左侧竖条（蓝→青绿渐变，更精致）
    bar = shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, _ACCENT_BAR_W, _SLIDE_H)
    _apply_gradient(bar, _ACCENT, _ACCENT_GRADIENT_END, 90)
    bar.line.fill.background()

    title_text = (slide_spec.get("title") or "").strip()
    subtitle_text = (slide_spec.get("subtitle") or "").strip()
    bullets = slide_spec.get("bullets") or []
    content_w = _SLIDE_W - _CONTENT_LEFT - _MARGIN
    body_w = content_w

    # 标题左侧青绿竖线 + 标题文字（含显式数学时渲染为图片）
    title_left = _CONTENT_LEFT
    accent_w = Pt(4)
    title_accent = shapes.add_shape(MSO_SHAPE.RECTANGLE, title_left, _TITLE_TOP, accent_w, Inches(0.5))
    title_accent.fill.solid()
    title_accent.fill.fore_color.rgb = _ACCENT_TEAL
    title_accent.line.fill.background()
    title_image = _try_render_field(renderer, title_text, font_pt=_CONTENT_TITLE_PT,
                                    color=_ACCENT_SOFT, width_in=(content_w - Inches(0.25)) / _EMU_PER_INCH) if renderer and title_text else None
    if title_image is not None:
        _add_field_picture(shapes, title_image, (title_left + Inches(0.25)) / _EMU_PER_INCH, _TITLE_TOP / _EMU_PER_INCH,
                           (content_w - Inches(0.25)) / _EMU_PER_INCH, _TITLE_BOX_H / _EMU_PER_INCH, align="left")
    else:
        title_box = shapes.add_textbox(title_left + Inches(0.25), _TITLE_TOP, content_w - Inches(0.25), _TITLE_BOX_H)
        tf = title_box.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = title_text or " "
        p.space_after = Pt(12)
        for run in p.runs:
            _set_run_font(run, _CONTENT_TITLE_PT, _ACCENT_SOFT, bold=True)

    # 正文与副标题的纵向起点：有标题时正文基准 _BODY_TOP，无标题时沿用无标题基准。
    base_body_top = _BODY_TOP if title_text else _BODY_TOP_NO_TITLE

    # RB02：副标题位于标题块与内容卡之间的专属条带，占高有界。
    if subtitle_text:
        sub_left_in = (title_left + Inches(0.25)) / _EMU_PER_INCH
        sub_w_in = (content_w - Inches(0.25)) / _EMU_PER_INCH
        subtitle_top_in = (_TITLE_TOP + _TITLE_BOX_H + _SUBTITLE_TOP_PAD) / _EMU_PER_INCH
        subtitle_bottom_in = _add_content_subtitle(shapes, renderer, subtitle_text,
                                                   sub_left_in, sub_w_in, subtitle_top_in)
        body_top = int(max(subtitle_bottom_in + _SUBTITLE_BODY_GAP / _EMU_PER_INCH,
                           base_body_top / _EMU_PER_INCH) * _EMU_PER_INCH)
    else:
        body_top = base_body_top

    # 正文区：阴影层（先画，在底层）+ 白色圆角卡片；卡底边由 _CARD_BOTTOM 权威推导。
    card_left = _CONTENT_LEFT - Inches(0.08)
    card_top = body_top - Inches(0.12)
    card_w = content_w + Inches(0.16)
    card_h = _CARD_BOTTOM - card_top
    shadow_offset = Pt(4)
    shadow = shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE,
        card_left + shadow_offset,
        card_top + shadow_offset,
        card_w,
        card_h,
    )
    shadow.fill.solid()
    shadow.fill.fore_color.rgb = _SHADOW_COLOR
    shadow.line.fill.background()
    content_card = shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, card_left, card_top, card_w, card_h)
    content_card.fill.solid()
    content_card.fill.fore_color.rgb = _BG_CARD
    content_card.line.color.rgb = _LINE_LIGHT
    content_card.line.width = Pt(0.5)

    body_lines = [(bullet if isinstance(bullet, str) else str(bullet)).strip() for bullet in bullets]
    body_lines = [line for line in body_lines if line]
    has_math_bullet = renderer is not None and any(
        _has_math(f"•  {line}") for line in body_lines
    )

    if has_math_bullet:
        # 数学混合版式：量测全部条目 → 三级确定性收缩策略 → 全部失败才 whole-body fallback。
        _add_bounded_flow_body(shapes, renderer, body_lines, body_top, body_w)
    else:
        # 纯文本版式：单文本框，字号确定性求解，预计高度不越出正文可用区。
        _add_plain_body(shapes, body_lines, body_top, body_w)

    # 页脚：左品牌 + 右页码（专业版式）
    footer_line = shapes.add_shape(MSO_SHAPE.RECTANGLE, _CONTENT_LEFT, _FOOTER_TOP - _FOOTER_SEPARATOR_LIFT,
                                   content_w, Pt(0.5))
    footer_line.fill.solid()
    footer_line.fill.fore_color.rgb = _LINE_LIGHT
    footer_line.line.fill.background()
    _add_footer(shapes, slide_num, total, _CONTENT_LEFT)


def _has_math(text: str) -> bool:
    """轻量探测：字段是否含显式定界符数学（与 ppt_math_text 语义一致）。"""
    return has_explicit_math(text)


def create_pptx_file(content: dict[str, Any]) -> BytesIO:
    """
    将讲稿 JSON 转为 .pptx 二进制流。
    - 空白布局 + 自定义版式：统一背景、左侧竖条、页脚
    - 支持 layout: title / content
    - 16:9 宽屏，专业教学风配色与字体层级
    - 含显式数学定界符的字段渲染为透明 PNG；字段级失败回退为源文本
    """
    prs = Presentation()
    prs.slide_width = _SLIDE_W
    prs.slide_height = _SLIDE_H

    slides_data = content.get("slides") or []
    # 不单独做「分节页」：过滤掉 layout 为 section 的幻灯片，只保留 title 与 content
    slides_to_render = [
        s for s in slides_data
        if (s.get("layout") or "content").strip().lower() != "section"
    ]
    presentation_title = content.get("title") or "课堂讲义"
    n = len(slides_to_render)
    renderer = MathRenderer()

    for i, slide_spec in enumerate(slides_to_render):
        layout = (slide_spec.get("layout") or "content").lower()
        slide_num = i + 1
        renderer.start_slide()
        if layout == "title":
            _add_title_slide(prs, slide_spec, presentation_title, n, renderer)
        else:
            _add_content_slide(prs, slide_spec, slide_num, n, renderer)

    buf = BytesIO()
    prs.save(buf)
    buf.seek(0)
    return buf
