import io
from datetime import datetime

from fastapi import HTTPException
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
from app.models.mistake import MistakeRecord
from app.models.student import Student
from app.models.user import User

FONT_NAME_CN = "ChineseFont"

HEADER_BLUE = colors.HexColor("#1976D2")
ACCENT_BLUE = colors.HexColor("#1976D2")
GREY_LIGHT = colors.HexColor("#f5f5f5")
GREY_GRID = colors.HexColor("#e0e0e0")
GREY_HEADER_BG = colors.HexColor("#eceff1")


def require_own_student(row: Student | None, current_user: User) -> Student:
    if row is None:
        raise HTTPException(status_code=404, detail="学生不存在")
    if row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="学生不存在")
    return row


def get_chinese_font_name() -> str:
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
    def __init__(self, drawing: Drawing, width: float, height: float) -> None:
        self.drawing = drawing
        self.width = width
        self.height = height

    def wrap(self, aW: float, aH: float) -> tuple[float, float]:
        return self.width, self.height

    def draw(self) -> None:
        renderPDF.draw(self.drawing, self.canv, 0, 0)


def build_bar_chart(font_name: str, width: float = 16 * cm, height: float = 8 * cm) -> DrawingFlowable:
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
    chart.bars[0].fillColor = HEADER_BLUE
    chart.bars[0].strokeColor = colors.HexColor("#0d47a1")
    drawing.add(chart)
    return DrawingFlowable(drawing, width, height)


def count_student_mistakes(db: Session, student_id: int) -> tuple[int, int]:
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
    return int(total_mistakes), int(unsolved_mistakes)


def generate_pdf_report(
    student: Student,
    total_mistakes: int,
    unsolved_mistakes: int,
    font_name: str,
    buffer: io.BytesIO,
) -> None:
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
    usable_width = A4[0] - left_margin - right_margin

    header_table = Table([["MathTutor 学情分析报告"]], colWidths=[usable_width])
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

    story.append(
        Paragraph(
            "<b>01. 学生概况</b>",
            ParagraphStyle(
                name="SectionTitle",
                fontName=font_name,
                fontSize=14,
                textColor=ACCENT_BLUE,
                spaceAfter=8,
            ),
        )
    )
    report_date = datetime.now().strftime("%Y-%m-%d %H:%M")
    total_questions = max(total_mistakes * 5, 50)
    error_rate_pct = round((total_mistakes / total_questions * 100), 1) if total_questions else 0
    overview_rows = [
        ["学生姓名", student.name],
        ["年级", student.grade or "-"],
        ["班级", student.class_name or "-"],
        ["做题总数", str(total_questions)],
        ["错题总数", str(total_mistakes)],
        ["待巩固错题", str(unsolved_mistakes)],
        ["错误率", f"{error_rate_pct}%"],
        ["报告生成时间", report_date],
    ]
    overview_table = Table(overview_rows, colWidths=[4 * cm, usable_width - 4 * cm - 0.5 * cm])
    overview_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), font_name),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("BACKGROUND", (0, 0), (0, -1), GREY_HEADER_BG),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#37474f")),
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
    story += [overview_table, Spacer(1, 0.6 * cm)]

    story.append(
        Paragraph(
            "<b>02. 学习趋势</b>",
            ParagraphStyle(
                name="SectionTitle2",
                fontName=font_name,
                fontSize=14,
                textColor=ACCENT_BLUE,
                spaceAfter=8,
            ),
        )
    )
    story.append(
        Paragraph(
            "近期成绩波动图",
            ParagraphStyle(name="ChartTitle", fontName=font_name, fontSize=11, alignment=1, spaceAfter=6),
        )
    )
    story.append(build_bar_chart(font_name))
    story.append(Spacer(1, 0.6 * cm))

    story.append(
        Paragraph(
            "<b>03. 老师寄语</b>",
            ParagraphStyle(
                name="SectionTitle3",
                fontName=font_name,
                fontSize=14,
                textColor=ACCENT_BLUE,
                spaceAfter=8,
            ),
        )
    )
    comment_text = (
        "该生近期在函数部分掌握较好，但在几何辅助线方面需要加强练习。"
        "上课专注度很高，作业完成质量优秀。"
    )
    story.append(
        Paragraph(
            comment_text,
            ParagraphStyle(
                name="Comment",
                fontName=font_name,
                fontSize=11,
                leading=14,
                spaceAfter=12,
            ),
        )
    )

    doc.build(story)


def build_student_report_pdf_buffer(
    db: Session,
    student: Student,
) -> io.BytesIO:
    total_mistakes, unsolved_mistakes = count_student_mistakes(db, student.id)
    font_name = get_chinese_font_name()
    buffer = io.BytesIO()
    generate_pdf_report(student, total_mistakes, unsolved_mistakes, font_name, buffer)
    buffer.seek(0)
    return buffer
