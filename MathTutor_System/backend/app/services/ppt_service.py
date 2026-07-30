"""
Magic PPT 生成服务：用 DeepSeek 生成讲稿 JSON，再用 python-pptx 生成 .pptx 文件。
采用空白布局 + 自定义版式，统一配色与字体层级，呈现更美观、专业的教学风格。
"""
from io import BytesIO
from typing import Any

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.util import Inches, Pt

from app.services.ppt_content_service import (
    clean_json_string as _clean_json_string,
    generate_lecture_content,
)

# 版式常量（16:9 宽屏）
_SLIDE_W = Inches(13.333)
_SLIDE_H = Inches(7.5)
_MARGIN = Inches(0.85)
_CONTENT_LEFT = Inches(1.15)   # 内容区左边界（留出竖条后）
_ACCENT_BAR_W = Inches(0.18)   # 左侧竖条略宽，更醒目
_TITLE_TOP = Inches(0.55)
_BODY_TOP = Inches(1.45)
_FOOTER_TOP = Inches(6.85)
_FONT_NAME = "Microsoft YaHei"

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


def _add_title_slide(prs, slide_spec: dict, presentation_title: str, total: int = 1) -> None:
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

    # 标题（居中）
    tx_w = Inches(10)
    tx_left = (_SLIDE_W - tx_w) / 2
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
        sub_box = shapes.add_textbox(tx_left, Inches(3.6), tx_w, Inches(0.9))
        sub_tf = sub_box.text_frame
        sub_tf.word_wrap = True
        sp = sub_tf.paragraphs[0]
        sp.text = subtitle_text
        sp.alignment = 1
        for run in sp.runs:
            _set_run_font(run, _TITLE_SLIDE_SUBTITLE_PT, _SUBTITLE_COLOR)

    # 页脚：左品牌 + 右页码（与内容页一致）
    footer_left = shapes.add_textbox(_MARGIN, _FOOTER_TOP - Pt(2), Inches(2.5), Inches(0.35))
    footer_left.text_frame.paragraphs[0].text = "初中数学"
    _set_para_font(footer_left.text_frame.paragraphs[0], _FOOTER_PT, _FOOTER_COLOR)
    footer_right = shapes.add_textbox(_SLIDE_W - _MARGIN - Inches(1.1), _FOOTER_TOP - Pt(2), Inches(1.1), Inches(0.35))
    footer_right.text_frame.paragraphs[0].text = f"01 / {total:02d}"
    footer_right.text_frame.paragraphs[0].alignment = 2
    for run in footer_right.text_frame.paragraphs[0].runs:
        _set_run_font(run, 13, _ACCENT_SOFT, bold=True)


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
    footer_left = shapes.add_textbox(_MARGIN, _FOOTER_TOP - Pt(2), Inches(2.5), Inches(0.35))
    footer_left.text_frame.paragraphs[0].text = "初中数学"
    _set_para_font(footer_left.text_frame.paragraphs[0], _FOOTER_PT, _FOOTER_COLOR)
    footer_right = shapes.add_textbox(_SLIDE_W - _MARGIN - Inches(1.1), _FOOTER_TOP - Pt(2), Inches(1.1), Inches(0.35))
    footer_right.text_frame.paragraphs[0].text = f"{slide_num:02d} / {total:02d}"
    footer_right.text_frame.paragraphs[0].alignment = 2
    for run in footer_right.text_frame.paragraphs[0].runs:
        _set_run_font(run, 13, _ACCENT_SOFT, bold=True)


def _add_content_slide(prs, slide_spec: dict, slide_num: int, total: int) -> None:
    """内容页：左侧竖条 + 标题（带青绿 accent）+ 白色圆角内容卡 + 正文 + 页脚。"""
    blank = prs.slide_layouts[6]
    slide = prs.slides.add_slide(blank)
    _slide_background(slide, _BG)
    shapes = slide.shapes

    # 左侧竖条（蓝→青绿渐变，更精致）
    bar = shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, _ACCENT_BAR_W, _SLIDE_H)
    _apply_gradient(bar, _ACCENT, _ACCENT_GRADIENT_END, 90)
    bar.line.fill.background()

    title_text = (slide_spec.get("title") or "").strip()
    bullets = slide_spec.get("bullets") or []
    content_w = _SLIDE_W - _CONTENT_LEFT - _MARGIN
    body_w = content_w

    # 标题左侧青绿竖线 + 标题文字
    title_left = _CONTENT_LEFT
    accent_w = Pt(4)
    title_accent = shapes.add_shape(MSO_SHAPE.RECTANGLE, title_left, _TITLE_TOP, accent_w, Inches(0.5))
    title_accent.fill.solid()
    title_accent.fill.fore_color.rgb = _ACCENT_TEAL
    title_accent.line.fill.background()
    title_box = shapes.add_textbox(title_left + Inches(0.25), _TITLE_TOP, content_w - Inches(0.25), Inches(0.75))
    tf = title_box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = title_text or " "
    p.space_after = Pt(12)
    for run in p.runs:
        _set_run_font(run, _CONTENT_TITLE_PT, _ACCENT_SOFT, bold=True)

    # 正文区：阴影层（先画，在底层）+ 白色圆角卡片
    body_top = _BODY_TOP if title_text else Inches(1.0)
    card_left = _CONTENT_LEFT - Inches(0.08)
    card_top = body_top - Inches(0.12)
    card_w = content_w + Inches(0.16)
    card_h = _FOOTER_TOP - card_top - Inches(0.15)
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

    body_box = shapes.add_textbox(_CONTENT_LEFT, body_top, body_w, Inches(4.8))
    body_tf = body_box.text_frame
    body_tf.word_wrap = True
    for j, bullet in enumerate(bullets):
        line = (bullet if isinstance(bullet, str) else str(bullet)).strip()
        if not line:
            continue
        if j == 0:
            para = body_tf.paragraphs[0]
        else:
            para = body_tf.add_paragraph()
        para.text = f"•  {line}"
        para.space_after = Pt(16)
        para.level = 0
        _set_para_font(para, _BODY_PT, _BODY_COLOR)

    # 页脚：左品牌 + 右页码（专业版式）
    footer_line = shapes.add_shape(MSO_SHAPE.RECTANGLE, _CONTENT_LEFT, _FOOTER_TOP - Pt(10), content_w, Pt(0.5))
    footer_line.fill.solid()
    footer_line.fill.fore_color.rgb = _LINE_LIGHT
    footer_line.line.fill.background()
    footer_left = shapes.add_textbox(_CONTENT_LEFT, _FOOTER_TOP - Pt(2), Inches(2.5), Inches(0.35))
    footer_left.text_frame.paragraphs[0].text = "初中数学"
    _set_para_font(footer_left.text_frame.paragraphs[0], _FOOTER_PT, _FOOTER_COLOR)
    footer_right = shapes.add_textbox(_SLIDE_W - _MARGIN - Inches(1.1), _FOOTER_TOP - Pt(2), Inches(1.1), Inches(0.35))
    footer_right.text_frame.paragraphs[0].text = f"{slide_num:02d} / {total:02d}"
    footer_right.text_frame.paragraphs[0].alignment = 2
    for run in footer_right.text_frame.paragraphs[0].runs:
        _set_run_font(run, 13, _ACCENT_SOFT, bold=True)


def create_pptx_file(content: dict[str, Any]) -> BytesIO:
    """
    将讲稿 JSON 转为 .pptx 二进制流。
    - 空白布局 + 自定义版式：统一背景、左侧竖条、页脚
    - 支持 layout: title / section / content
    - 16:9 宽屏，专业教学风配色与字体层级
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

    for i, slide_spec in enumerate(slides_to_render):
        layout = (slide_spec.get("layout") or "content").lower()
        slide_num = i + 1
        if layout == "title":
            _add_title_slide(prs, slide_spec, presentation_title, n)
        else:
            _add_content_slide(prs, slide_spec, slide_num, n)

    buf = BytesIO()
    prs.save(buf)
    buf.seek(0)
    return buf
