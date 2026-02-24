"""
学习报告接口：按学生生成学情分析报告 PDF（专业版设计）；
课后报告生成器：根据今日状态与关键词生成发给家长的评语；
可视化学习报告：从描述中解析已掌握/待攻克/预计课时。
"""
import io
import json
import logging
import re
import traceback
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.api.endpoints.auth import get_current_user
from app.core.deps import LLMConfig, get_llm_config
from app.core.prompts import (
    AFTER_CLASS_COMMENT_PROMPT,
    LEARNING_REPORT_PARSE_PROMPT,
    POLISH_DRAFT_PROMPT,
    POLISH_DRAFT_WITH_TEMPLATE_PROMPT,
)
from app.schemas.report_dto import (
    AfterClassCommentRequest,
    AfterClassCommentResponse,
    LearningReportParseRequest,
    LearningReportParseResponse,
    WeakPointItem,
)
from app.services.llm_service import chat_completion_async
from reportlab.graphics import renderPDF
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Flowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import BASE_DIR
from app.models.base import get_db
from app.models.mistake import MistakeRecord
from app.models.student import Student
from app.models.user import User

router = APIRouter()

# 中文字体注册名；支持 font.ttf / zhouzisongti.otf，未找到则回退 Helvetica
FONT_NAME_CN = "ChineseFont"

# 品牌蓝 #1976D2
HEADER_BLUE = colors.HexColor("#1976D2")
# 分区标题左边框/下划线
ACCENT_BLUE = colors.HexColor("#1976D2")
GREY_LIGHT = colors.HexColor("#f5f5f5")
GREY_GRID = colors.HexColor("#e0e0e0")
GREY_HEADER_BG = colors.HexColor("#eceff1")

logger = logging.getLogger(__name__)


@router.post("/after-class", response_model=AfterClassCommentResponse)
async def generate_after_class_comment(
    body: AfterClassCommentRequest,
    llm_config: LLMConfig = Depends(get_llm_config),
    current_user: User = Depends(get_current_user),
) -> AfterClassCommentResponse:
    """
    课后报告生成器：根据今日专注度、掌握度与关键词生成评语；
    若提供 draft 则改为将老师草稿修饰成可发给家长的评语。
    """
    if not (llm_config.api_key or "").strip():
        raise HTTPException(
            status_code=400,
            detail="未配置 API Key。请在前端「设置」中填写，或在 .env 中设置 LLM_API_KEY。",
        )
    draft = (body.draft or "").strip()
    template = (body.template or "").strip()
    if draft:
        if template:
            prompt = POLISH_DRAFT_WITH_TEMPLATE_PROMPT.format(template=template, draft=draft)
        else:
            prompt = POLISH_DRAFT_PROMPT.format(draft=draft)
        if (body.student_name or "").strip():
            prompt += f'\n\n**学生姓名**：{body.student_name.strip()}。请在评语中自然称呼。'
    else:
        focus_stars = "⭐" * body.focus_level + "☆" * (5 - body.focus_level)
        mastery_stars = "⭐" * body.mastery_level + "☆" * (5 - body.mastery_level)
        keywords_text = "、".join((k or "").strip() for k in (body.keywords or []) if (k or "").strip()) or "（无）"
        prompt = AFTER_CLASS_COMMENT_PROMPT.format(
            focus_stars=focus_stars,
            mastery_stars=mastery_stars,
            keywords_text=keywords_text,
        )
        if (body.student_name or "").strip():
            prompt += f'\n\n**学生姓名**：{body.student_name.strip()}。请在评语中自然称呼。'
    messages = [{"role": "user", "content": prompt}]
    try:
        content = await chat_completion_async(
            messages,
            None,
            llm_config,
            temperature=0.6,
            max_tokens=512,
        )
        comment = (content or "").strip()
        if not comment:
            raise ValueError("AI 未返回有效评语")
        # 若模型返回了前缀，尝试去掉常见前缀
        for prefix in ("评语：", "评语:", "家长您好，", "家长您好，"):
            if comment.startswith(prefix):
                comment = comment[len(prefix) :].strip()
                break
        return AfterClassCommentResponse(comment=comment)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        logger.exception("课后评语生成失败")
        detail = str(e).strip() or "生成评语失败，请检查 API 配置与网络后重试。"
        raise HTTPException(status_code=500, detail=detail[:500])


def _strip_json_markdown(text: str) -> str:
    """去掉 Markdown 的 ```json 标记。"""
    if not text:
        return ""
    text = text.strip().lstrip("\ufeff")
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if match:
        return match.group(1).strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*\n?", "", text, count=1).strip()
    return text


@router.post("/learning-visual", response_model=LearningReportParseResponse)
async def parse_learning_report(
    body: LearningReportParseRequest,
    llm_config: LLMConfig = Depends(get_llm_config),
    current_user: User = Depends(get_current_user),
) -> LearningReportParseResponse:
    """
    可视化学习报告：从一段学情描述中解析出「已掌握」「待攻克」「预计课时」，
    供前端以卡片等形式可视化展示。
    """
    if not (llm_config.api_key or "").strip():
        raise HTTPException(
            status_code=400,
            detail="未配置 API Key。请在前端「设置」中填写，或在 .env 中设置 LLM_API_KEY。",
        )
    draft = (body.draft or "").strip()
    if not draft:
        raise HTTPException(status_code=400, detail="请提供学情描述内容。")
    prompt = LEARNING_REPORT_PARSE_PROMPT.format(draft=draft)
    messages = [{"role": "user", "content": prompt}]
    try:
        content = await chat_completion_async(
            messages,
            None,
            llm_config,
            temperature=0.2,
            max_tokens=1024,
        )
        raw = (content or "").strip()
        cleaned = _strip_json_markdown(raw)
        if not cleaned:
            cleaned = raw
        data = json.loads(cleaned)
        mastered = data.get("mastered")
        weak_points = data.get("weak_points")
        estimated_hours = data.get("estimated_hours", 0)
        if not isinstance(mastered, list):
            mastered = []
        if not isinstance(weak_points, list):
            weak_points = []
        weak_items = []
        for w in weak_points:
            if isinstance(w, dict) and w.get("point"):
                weak_items.append(
                    WeakPointItem(
                        point=str(w.get("point", "")).strip(),
                        description=str(w.get("description", "")).strip() or None,
                    )
                )
            elif isinstance(w, str):
                weak_items.append(WeakPointItem(point=w.strip(), description=None))
        try:
            estimated_hours = max(0, min(99, int(estimated_hours)))
        except (TypeError, ValueError):
            estimated_hours = 0
        return LearningReportParseResponse(
            mastered=[str(x).strip() for x in mastered if str(x).strip()],
            weak_points=weak_items,
            estimated_hours=estimated_hours,
        )
    except json.JSONDecodeError as e:
        logger.warning("学习报告解析 JSON 失败: %s", e)
        raise HTTPException(status_code=400, detail="AI 返回格式无法解析，请简化描述后重试。")
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        logger.exception("学习报告解析失败")
        raise HTTPException(status_code=500, detail=str(e).strip()[:500])


def _get_chinese_font_name() -> str:
    """
    尝试注册中文字体，若找不到则回退到 Helvetica。
    查找顺序：zhouzisongti.otf、font.ttf（backend/、backend/app/）。
    """
    candidates = [
        BASE_DIR / "zhouzisongti.otf",
        BASE_DIR / "font.ttf",
        BASE_DIR / "app" / "zhouzisongti.otf",
        BASE_DIR / "app" / "font.ttf",
    ]
    for path in candidates:
        if path.is_file():
            try:
                pdfmetrics.registerFont(TTFont(FONT_NAME_CN, str(path)))
                return FONT_NAME_CN
            except Exception:
                pass
    return "Helvetica"


class DrawingFlowable(Flowable):
    """将 reportlab.graphics Drawing 嵌入 Platypus 的 Flowable。"""

    def __init__(self, drawing: Drawing, width: float, height: float) -> None:
        self.drawing = drawing
        self.width = width
        self.height = height

    def wrap(self, aW: float, aH: float) -> tuple[float, float]:
        return self.width, self.height

    def draw(self) -> None:
        renderPDF.draw(self.drawing, self.canv, 0, 0)


def _build_bar_chart(font_name: str, width: float = 16 * cm, height: float = 8 * cm) -> DrawingFlowable:
    """近期成绩波动图：测验1–5，分数 [85, 88, 82, 91, 95]。"""
    drawing = Drawing(width, height)
    chart = VerticalBarChart()
    chart.x = 1.5 * cm
    chart.y = 1.2 * cm
    chart.width = width - 2.5 * cm
    chart.height = height - 2.5 * cm
    chart.data = [[85, 88, 82, 91, 95]]
    chart.categoryAxis.categoryNames = ["测验1", "测验2", "测验3", "测验4", "测验5"]
    chart.categoryAxis.labels.fontName = font_name
    chart.categoryAxis.labels.fontSize = 9
    chart.valueAxis.valueMin = 0
    chart.valueAxis.valueMax = 100
    chart.valueAxis.valueStep = 20
    chart.valueAxis.labels.fontName = font_name
    chart.valueAxis.labels.fontSize = 9
    chart.bars[0].fillColor = colors.HexColor("#1976D2")
    chart.bars[0].strokeColor = colors.HexColor("#0d47a1")
    drawing.add(chart)
    return DrawingFlowable(drawing, width, height)


def _require_own_student(row: Student | None, current_user: User) -> Student:
    """若学生不存在或不属于当前用户，则 404。"""
    if row is None:
        raise HTTPException(status_code=404, detail="学生不存在")
    if row.user_id is not None and row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="学生不存在")
    return row


def _generate_pdf_report(
    student: Student,
    total_mistakes: int,
    unsolved_mistakes: int,
    font_name: str,
    buffer: io.BytesIO,
) -> None:
    """生成专业版学情分析报告 PDF 到 buffer。"""
    left_margin = 1.5 * cm
    right_margin = 1.5 * cm
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=right_margin,
        leftMargin=left_margin,
        topMargin=1 * cm,
        bottomMargin=1.5 * cm,
    )
    # 可用宽度（build 前 doc.width 未设置，用 A4 与边距计算）
    usable_width = A4[0] - left_margin - right_margin

    # ---------- 1. 全幅蓝色顶栏标题 ----------
    header_table = Table(
        [["MathTutor 学情分析报告"]],
        colWidths=[usable_width],
    )
    header_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), HEADER_BLUE),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
                ("FONTNAME", (0, 0), (-1, -1), font_name),
                ("FONTSIZE", (0, 0), (-1, -1), 24),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 16),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 16),
            ]
        )
    )
    story = [header_table, Spacer(1, 0.8 * cm)]

    # ---------- 2. Section 01 学生概况（斑马纹表格） ----------
    section1_title = Paragraph(
        "<b>01. 学生概况</b>",
        ParagraphStyle(
            name="SectionTitle",
            fontName=font_name,
            fontSize=14,
            textColor=ACCENT_BLUE,
            spaceAfter=8,
            borderPadding=0,
            leftIndent=0,
            borderWidth=0,
            borderColor=ACCENT_BLUE,
        ),
    )
    story.append(section1_title)
    # 左侧色条效果用表格第一列背景模拟
    report_date = datetime.now().strftime("%Y-%m-%d %H:%M")
    total_questions = max(total_mistakes * 5, 50)  # 模拟做题总数
    error_rate_pct = round((total_mistakes / total_questions * 100), 1) if total_questions else 0
    data1 = [
        ["学生姓名", student.name],
        ["年级", student.grade or "—"],
        ["班级", student.class_name or "—"],
        ["做题总数", str(total_questions)],
        ["错题总数", str(total_mistakes)],
        ["待巩固错题", str(unsolved_mistakes)],
        ["错误率", f"{error_rate_pct}%"],
        ["报告生成时间", report_date],
    ]
    t1 = Table(data1, colWidths=[4 * cm, usable_width - 4 * cm - 0.5 * cm])
    t1.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), font_name),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("BACKGROUND", (0, 0), (0, -1), GREY_HEADER_BG),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#37474f")),
                ("FONTNAME", (0, 0), (0, -1), font_name),
                ("ALIGN", (0, 0), (0, -1), "RIGHT"),
                ("ALIGN", (1, 0), (1, -1), "LEFT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("GRID", (0, 0), (-1, -1), 0.5, GREY_GRID),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("ROWBACKGROUNDS", (1, 0), (1, -1), [colors.white, GREY_LIGHT]),
            ]
        )
    )
    story += [t1, Spacer(1, 0.6 * cm)]

    # ---------- 3. Section 02 学习趋势（柱状图） ----------
    section2_title = Paragraph(
        "<b>02. 学习趋势</b>",
        ParagraphStyle(
            name="SectionTitle2",
            fontName=font_name,
            fontSize=14,
            textColor=ACCENT_BLUE,
            spaceAfter=8,
        ),
    )
    story.append(section2_title)
    chart_title = Paragraph(
        "近期成绩波动图",
        ParagraphStyle(
            name="ChartTitle",
            fontName=font_name,
            fontSize=11,
            alignment=1,
            spaceAfter=6,
        ),
    )
    story.append(chart_title)
    story.append(_build_bar_chart(font_name))
    story.append(Spacer(1, 0.6 * cm))

    # ---------- 4. Section 03 老师寄语 ----------
    section3_title = Paragraph(
        "<b>03. 老师寄语</b>",
        ParagraphStyle(
            name="SectionTitle3",
            fontName=font_name,
            fontSize=14,
            textColor=ACCENT_BLUE,
            spaceAfter=8,
        ),
    )
    story.append(section3_title)
    comment_text = (
        "该生近期在函数部分掌握较好，但在几何辅助线方面需要加强练习。"
        "上课专注度很高，作业完成质量优秀。"
    )
    comment_para = Paragraph(
        comment_text,
        ParagraphStyle(
            name="Comment",
            fontName=font_name,
            fontSize=11,
            leading=14,
            spaceAfter=12,
            leftIndent=0,
            rightIndent=0,
        ),
    )
    story.append(comment_para)

    doc.build(story)


@router.get("/{student_id}")
def get_student_report_pdf(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """
    生成指定学生的学情分析报告 PDF（专业版）。
    仅限本人名下学生；若未配置中文字体，报告中的中文可能显示为方框。
    """
    try:
        student = db.get(Student, student_id)
        _require_own_student(student, current_user)

        total_mistakes = (
            db.query(func.count(MistakeRecord.id))
            .filter(MistakeRecord.student_id == student_id)
            .scalar()
            or 0
        )
        unsolved_mistakes = (
            db.query(func.count(MistakeRecord.id))
            .filter(
                MistakeRecord.student_id == student_id,
                MistakeRecord.status == "pending",
            )
            .scalar()
            or 0
        )

        font_name = _get_chinese_font_name()
        buffer = io.BytesIO()
        _generate_pdf_report(student, total_mistakes, unsolved_mistakes, font_name, buffer)
        buffer.seek(0)

        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={
                "Content-Disposition": 'attachment; filename="report.pdf"',
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"生成报告失败: {str(e)}")
