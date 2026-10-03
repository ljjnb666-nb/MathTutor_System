"""Magic PPT 数学渲染器：显式定界符字段 → 透明 PNG。

架构决策（PHASE 2C-5 锁定）：
- 含显式数学定界符（$...$、$$...$$、\\(...\\)、\\[...\\]）的字段经
  matplotlib MathText（非 usetex、无 LaTeX 可执行、无网络、无子进程）
  渲染为透明 PNG，再由 python-pptx add_picture 放入原生文本框位置；
- 不含显式定界符的字段返回 None，保持原生可编辑 PowerPoint 文本；
- 任何字段级渲染失败（畸形/不受支持命令/超预算）抛出
  MathFieldFallbackError，由调用方回退为规范源文本的纯文本展示，
  绝不让单字段失败拖垮整个 deck，也绝不静默丢弃内容。

安全 / 资源预算：
- 所有尺寸、DPI、字体均来自本模块常量或服务端注入，客户端不可控；
- 输入永远是纯文本：不解析 HTML/XML/SVG，不执行公式，不建超链接；
- 渲染前先按度量预算校验，超限即回退，绝不分配无界画布；
- 日志只记录回退原因代号，绝不记录公式内容。
"""
from __future__ import annotations

import io
import logging
import threading
from pathlib import Path
from typing import NamedTuple

import matplotlib
matplotlib.use("Agg")  # 纯离线渲染；本模块不得引入 pyplot 交互态
from matplotlib import font_manager
from matplotlib.backends.backend_agg import FigureCanvasAgg
from matplotlib.figure import Figure
from matplotlib.font_manager import FontProperties
from PIL import Image

from app.services.ppt_math_text import parse_math_text

logger = logging.getLogger(__name__)

# ---- 渲染资源预算（服务端常量；实例允许测试注入更紧的值，客户端不可控）----
MAX_MATH_SEGMENTS_PER_FIELD = 8
MAX_MATH_SEGMENTS_PER_SLIDE = 16
MAX_MATH_SEGMENTS_PER_DECK = 120
MAX_MATH_SOURCE_CHARS_PER_SEGMENT = 200
RENDER_DPI = 200
MAX_RENDER_WIDTH_PX = 2400
MAX_RENDER_HEIGHT_PX = 1400
MAX_RENDER_PIXELS_PER_IMAGE = 2_500_000
MAX_RENDER_PIXELS_PER_DECK = 24_000_000
MAX_PNG_BYTES_PER_IMAGE = 1_500_000
MAX_PNG_BYTES_PER_DECK = 16_000_000

FONT_PATH = Path(__file__).resolve().parent.parent / "font.ttf"
_FALLBACK_FAMILY = "DejaVu Sans"

_FONT_LOCK = threading.Lock()
_RENDER_LOCK = threading.Lock()
_FONT_FAMILY: str | None = None


def _ensure_font() -> str:
    """注册内置 CJK 字体并返回其 family 名；失败即抛出，不静默降级。"""
    global _FONT_FAMILY
    with _FONT_LOCK:
        if _FONT_FAMILY is None:
            font_manager.fontManager.addfont(str(FONT_PATH))
            _FONT_FAMILY = FontProperties(fname=str(FONT_PATH)).get_name()
        return _FONT_FAMILY


def _font_properties(font_pt: float) -> FontProperties:
    family = _ensure_font()
    # 多字体回退：CJK 用内置字体，内置字体缺字形（如项目符号 •）时回退 DejaVu。
    return FontProperties(family=[family, _FALLBACK_FAMILY], size=font_pt)


class MathFieldImage(NamedTuple):
    png: bytes
    width_px: int
    height_px: int


class MathFieldFallbackError(Exception):
    """单字段渲染回退；reason 为稳定的代号，供日志与测试使用。"""

    def __init__(self, reason: str) -> None:
        self.reason = reason
        super().__init__(reason)


class MathRenderer:
    """按 deck 实例化：持有 slide/deck 级累计预算。"""

    def __init__(
        self,
        *,
        dpi: int = RENDER_DPI,
        max_math_segments_per_field: int = MAX_MATH_SEGMENTS_PER_FIELD,
        max_math_segments_per_slide: int = MAX_MATH_SEGMENTS_PER_SLIDE,
        max_math_segments_per_deck: int = MAX_MATH_SEGMENTS_PER_DECK,
        max_math_source_chars_per_segment: int = MAX_MATH_SOURCE_CHARS_PER_SEGMENT,
        max_render_width_px: int = MAX_RENDER_WIDTH_PX,
        max_render_height_px: int = MAX_RENDER_HEIGHT_PX,
        max_render_pixels_per_image: int = MAX_RENDER_PIXELS_PER_IMAGE,
        max_render_pixels_per_deck: int = MAX_RENDER_PIXELS_PER_DECK,
        max_png_bytes_per_image: int = MAX_PNG_BYTES_PER_IMAGE,
        max_png_bytes_per_deck: int = MAX_PNG_BYTES_PER_DECK,
    ) -> None:
        self._dpi = dpi
        self._max_segments_field = max_math_segments_per_field
        self._max_segments_slide = max_math_segments_per_slide
        self._max_segments_deck = max_math_segments_per_deck
        self._max_chars_segment = max_math_source_chars_per_segment
        self._max_width_px = max_render_width_px
        self._max_height_px = max_render_height_px
        self._max_pixels_image = max_render_pixels_per_image
        self._max_pixels_deck = max_render_pixels_per_deck
        self._max_png_bytes_image = max_png_bytes_per_image
        self._max_png_bytes_deck = max_png_bytes_per_deck
        self._slide_segments = 0
        self._deck_segments = 0
        self._deck_pixels = 0
        self._deck_bytes = 0

    def start_slide(self) -> None:
        """每个待渲染幻灯片开始时调用，重置 slide 级计数。"""
        self._slide_segments = 0

    @property
    def deck_bytes(self) -> int:
        return self._deck_bytes

    def field_image(
        self,
        text: str,
        *,
        font_pt: float,
        color: tuple[float, float, float],
        width_in: float,
    ) -> MathFieldImage | None:
        """渲染一个字段（title / subtitle / 单条 bullet）。

        返回 None 表示无显式数学（保持原生文本路径）；
        抛出 MathFieldFallbackError 表示需要回退为规范源文本。
        """
        if not isinstance(text, str) or not text.strip():
            return None
        parts = parse_math_text(text)
        math_parts = [part for part in parts if part["type"] != "text"]
        if not math_parts:
            return None

        if len(math_parts) > self._max_segments_field:
            raise MathFieldFallbackError("segment-limit-field")
        if self._slide_segments + len(math_parts) > self._max_segments_slide:
            raise MathFieldFallbackError("segment-limit-slide")
        if self._deck_segments + len(math_parts) > self._max_segments_deck:
            raise MathFieldFallbackError("segment-limit-deck")
        for part in math_parts:
            value = part["value"]
            if not value.strip():
                raise MathFieldFallbackError("empty-math")
            if "\n" in value:
                raise MathFieldFallbackError("newline-in-math")
            if len(value) > self._max_chars_segment:
                raise MathFieldFallbackError("segment-chars")
        for part in parts:
            if part["type"] == "text" and "\\" in part["value"]:
                # 混合行内裸反斜杠无法安全通过 mathtext 文本区；整字段回退为源文本。
                raise MathFieldFallbackError("backslash-in-text")

        lines = self._build_lines(parts)
        png, width_px, height_px = self._render_lines(lines, font_pt=font_pt, color=color, width_in=width_in)

        # 提交各级预算（仅在成功后累计）。
        self._slide_segments += len(math_parts)
        self._deck_segments += len(math_parts)
        self._deck_pixels += width_px * height_px
        self._deck_bytes += len(png)
        return MathFieldImage(png=png, width_px=width_px, height_px=height_px)

    @staticmethod
    def _build_lines(parts: list[dict]) -> list[str]:
        """把解析片段拼成多行字符串：text 段转义 $；display 段独立成行。"""
        lines: list[str] = []
        current: list[str] = []

        def flush() -> None:
            lines.append("".join(current).strip())
            current.clear()

        for part in parts:
            if part["type"] == "text":
                for i, piece in enumerate(part["value"].split("\n")):
                    if i > 0:
                        flush()
                    current.append(piece.replace("$", r"\$"))
            else:
                if part["type"] == "display" and current:
                    flush()
                current.append("$" + part["value"] + "$")
        flush()
        # matplotlib 按行独立判断是否为 mathtext；空行保留为间隔。
        return lines if any(line for line in lines) else [" "]

    def _render_lines(
        self, lines: list[str], *, font_pt: float, color: tuple[float, float, float], width_in: float
    ) -> tuple[bytes, int, int]:
        fig_w = max(0.5, min(width_in, self._max_width_px / self._dpi))
        fig_h = max(0.25, min(2.0, self._max_height_px / self._dpi))
        with _RENDER_LOCK:
            fig = Figure(figsize=(fig_w, fig_h), dpi=self._dpi)
            FigureCanvasAgg(fig)
            text = fig.text(
                0,
                1,
                "\n".join(lines),
                fontproperties=_font_properties(font_pt),
                color=color,
                va="top",
                ha="left",
                linespacing=1.5,
            )
            try:
                fig.canvas.draw()
            except ValueError:
                raise MathFieldFallbackError("malformed-math") from None
            extent = text.get_window_extent(fig.canvas.get_renderer())
            width_px = int(round(extent.width))
            height_px = int(round(extent.height))
            if (
                width_px > self._max_width_px
                or height_px > self._max_height_px
                or width_px * height_px > self._max_pixels_image
            ):
                raise MathFieldFallbackError("canvas-bounds")
            if self._deck_pixels + width_px * height_px > self._max_pixels_deck:
                raise MathFieldFallbackError("deck-pixels")

            buf = io.BytesIO()
            try:
                fig.savefig(buf, format="png", dpi=self._dpi, transparent=True, bbox_inches="tight", pad_inches=0.05)
            except ValueError:
                raise MathFieldFallbackError("malformed-math") from None
        png = buf.getvalue()
        if len(png) > self._max_png_bytes_image:
            raise MathFieldFallbackError("png-bytes")
        if self._deck_bytes + len(png) > self._max_png_bytes_deck:
            raise MathFieldFallbackError("deck-bytes")

        with Image.open(io.BytesIO(png)) as image:
            fmt = image.format
            width_px, height_px = image.size
        if fmt != "PNG":
            raise MathFieldFallbackError("png-format")
        if (
            width_px > self._max_width_px
            or height_px > self._max_height_px
            or width_px * height_px > self._max_pixels_image
            or self._deck_pixels + width_px * height_px > self._max_pixels_deck
        ):
            raise MathFieldFallbackError("canvas-bounds")
        logger.debug("ppt_math_field_rendered width_px=%d height_px=%d bytes=%d", width_px, height_px, len(png))
        return png, width_px, height_px


def field_fallback_log(reason: str) -> None:
    """只记录稳定代号，不记录公式内容。"""
    logger.info("ppt_math_field_fallback reason=%s", reason)
