r"""
Magic PPT 规范内容 DTO（唯一校验权威）。

LLM 生成的讲稿与 /api/tools/build-pptx 的构建输入都必须通过同一份
schema 校验，避免「AI 契约宽松、构建契约严格」的双轨定义。

规范状态是源文本：字段值是含显式数学定界符（$...$、$$...$$、\(...\)、
\[...\]）的纯文本。KaTeX HTML、MathML、渲染 PNG、SVG、PowerPoint XML
都不是规范数据，本 DTO 永远不承载它们。
"""
from pydantic import BaseModel, ConfigDict, Field, model_validator

MAX_SLIDES = 30
MAX_BULLETS_PER_SLIDE = 12
MAX_TITLE_LENGTH = 255
MAX_SUBTITLE_LENGTH = 500
MAX_BULLET_LENGTH = 500


class PPTSlide(BaseModel):
    """单页幻灯片（SEC-08：页数、每页要点数与文本长度均有硬上限）。"""

    model_config = ConfigDict(extra="ignore")

    layout: str = Field(default="content", max_length=32, description="title | content")
    title: str = Field(default="", max_length=255)
    subtitle: str = Field(default="", max_length=500)
    bullets: list[str] = Field(default_factory=list, max_length=12)

    @model_validator(mode="after")
    def _bound_bullets(self) -> "PPTSlide":
        for bullet in self.bullets:
            if len(bullet) > MAX_BULLET_LENGTH:
                raise ValueError(f"单条要点不能超过 {MAX_BULLET_LENGTH} 字符")
        return self


class PPTContent(BaseModel):
    """完整讲稿内容：标题 + 幻灯片列表。"""

    model_config = ConfigDict(extra="ignore")

    title: str = Field(default="", max_length=MAX_TITLE_LENGTH)
    slides: list[PPTSlide] = Field(..., min_length=1, max_length=MAX_SLIDES)
