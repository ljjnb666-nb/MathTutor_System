"""
学情报告 PDF renderer（PHASE 2D-1B-2）。

核心不变量：PDF 是 StudentReportSnapshot 的纯展示层。
- renderer 不持有 Session、不 query Exam/Mistake、不重算任何统计；
- 所有事实来自 snapshot（assignment/grading 双轴、trend、mistake、current mastery）；
- answered==0 时正确率显示「暂无批改数据」，禁止用 0% 伪装观测；
- 趋势图只使用 accuracy 非 None 的真实 trend point，无数据时不画图；
- 用户可控字符串（姓名/年级/班级/知识点等）进入 Paragraph 前必须经 _esc 转义；
- 不含 TeacherObservation / AI narrative / 任何合成文案。
"""
import io
from urllib.parse import quote
from xml.sax.saxutils import escape
from zoneinfo import ZoneInfo

from fastapi import HTTPException, Response
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

from app.core.config import BASE_DIR
from app.models.student import Student
from app.models.user import User
from app.schemas.report_snapshot_dto import StudentReportSnapshot

FONT_NAME_CN = "ChineseFont"

HEADER_BLUE = colors.HexColor("#1976D2")
ACCENT_BLUE = colors.HexColor("#1976D2")
GREY_LIGHT = colors.HexColor("#f5f5f5")
GREY_GRID = colors.HexColor("#e0e0e0")
GREY_HEADER_BG = colors.HexColor("#eceff1")

CHART_WIDTH = 16 * cm
CHART_HEIGHT = 8 * cm

NO_GRADING_DATA_TEXT = "暂无批改数据"
NO_TREND_DATA_TEXT = "暂无可用于趋势展示的批改数据"
NO_MASTERY_RECORD_TEXT = "暂无记录"

_PERIOD_LABELS = {
    "one_week": "近 1 周",
    "four_weeks": "近 4 周",
    "all_time": "全部历史",
}

REPORT_PDF_FILENAME = "学情报告.pdf"
REPORT_PDF_ASCII_FALLBACK = "report.pdf"


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


def _esc(value: object) -> str:
    """唯一 escape helper：所有进入 Paragraph 的用户可控字符串必须经过这里。"""
    return escape(str(value if value is not None else ""))


def _section_title(text: str, font_name: str) -> Paragraph:
    return Paragraph(
        f"<b>{_esc(text)}</b>",
        ParagraphStyle(
            name=f"SectionTitle-{text}",
            fontName=font_name,
            fontSize=14,
            textColor=ACCENT_BLUE,
            spaceAfter=8,
        ),
    )


def _body_paragraph(text: str, font_name: str, *, alignment: int = 0, font_size: int = 11) -> Paragraph:
    return Paragraph(
        _esc(text),
        ParagraphStyle(
            name=f"Body-{text[:12]}-{alignment}-{font_size}",
            fontName=font_name,
            fontSize=font_size,
            leading=font_size + 3,
            alignment=alignment,
            spaceAfter=6,
        ),
    )


def _facts_table(rows: list[tuple[str, str]], font_name: str, usable_width: float) -> Table:
    """两列事实表：label 列为常量，value 列经 escape 并用 Paragraph 安全换行。"""
    label_width = 4.5 * cm
    value_width = usable_width - label_width - 0.5 * cm
    value_style = ParagraphStyle(
        name="FactValue",
        fontName=font_name,
        fontSize=10,
        leading=14,
    )
    data = [[label, Paragraph(_esc(value), value_style)] for label, value in rows]
    table = Table(data, colWidths=[label_width, value_width])
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), font_name),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("BACKGROUND", (0, 0), (0, -1), GREY_HEADER_BG),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#37474f")),
                ("ALIGN", (0, 0), (0, -1), "RIGHT"),
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
    return table


def _period_display(snapshot: StudentReportSnapshot) -> str:
    label = _PERIOD_LABELS[snapshot.period.kind]
    end = snapshot.period.end_date.isoformat()
    start = snapshot.period.start_date
    if start is None:
        return f"{label}（截至 {end}）"
    return f"{label}（{start.isoformat()} ~ {end}）"


def _generated_at_display(snapshot: StudentReportSnapshot) -> str:
    """snapshot.period.generated_at（aware UTC）→ 报告时区本地时间；禁止 datetime.now()。"""
    local_dt = snapshot.period.generated_at.astimezone(ZoneInfo(snapshot.period.timezone))
    return f"{local_dt.strftime('%Y-%m-%d %H:%M')} {snapshot.period.timezone}"


def _accuracy_display(accuracy: float | None) -> str:
    if accuracy is None:
        return NO_GRADING_DATA_TEXT
    return f"{round(accuracy * 100, 1)}%"


def _trend_chart_points(snapshot: StudentReportSnapshot) -> list[tuple[str, float]]:
    """只有 accuracy 非 None 的真实 trend point 才能进入 chart；label = 报告时区 MM-DD。"""
    tz = ZoneInfo(snapshot.period.timezone)
    points: list[tuple[str, float]] = []
    for point in snapshot.trend_points:
        if point.accuracy is None:
            continue
        label = point.graded_at.astimezone(tz).strftime("%m-%d")
        points.append((label, round(point.accuracy * 100, 1)))
    return points


def _build_trend_chart(points: list[tuple[str, float]], font_name: str) -> DrawingFlowable:
    drawing = Drawing(CHART_WIDTH, CHART_HEIGHT)
    chart = VerticalBarChart()
    chart.x = 1.5 * cm
    chart.y = 1.2 * cm
    chart.width = CHART_WIDTH - 2.5 * cm
    chart.height = CHART_HEIGHT - 2.5 * cm
    chart.data = [[value for _, value in points]]
    chart.categoryAxis.categoryNames = [label for label, _ in points]
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
    return DrawingFlowable(drawing, CHART_WIDTH, CHART_HEIGHT)


def _header_table(font_name: str, usable_width: float) -> Table:
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
    return header_table


def _build_report_story(snapshot: StudentReportSnapshot, font_name: str) -> list[Flowable]:
    left_margin = 1.5 * cm
    right_margin = 1.5 * cm
    usable_width = A4[0] - left_margin - right_margin
    story: list[Flowable] = [_header_table(font_name, usable_width), Spacer(1, 0.8 * cm)]

    # 01. 学生概况 —— 仅 snapshot.student / snapshot.period 事实
    story.append(_section_title("01. 学生概况", font_name))
    story.append(
        _facts_table(
            [
                ("学生姓名", snapshot.student.name),
                ("年级", snapshot.student.grade),
                ("班级", snapshot.student.class_name),
                ("报告周期", _period_display(snapshot)),
                ("报告生成时间", _generated_at_display(snapshot)),
            ],
            font_name,
            usable_width,
        )
    )
    story.append(Spacer(1, 0.6 * cm))

    # 02. 数据覆盖与批改事实 —— 仅 assignment_metrics / grading_metrics
    grading = snapshot.grading_metrics
    story.append(_section_title("02. 数据覆盖与批改事实", font_name))
    story.append(
        _facts_table(
            [
                ("本期布置试卷数", str(snapshot.assignment_metrics.assigned_exam_count)),
                ("本期布置题目数", str(snapshot.assignment_metrics.assigned_question_count)),
                ("本期批改试卷数", str(grading.graded_exam_count)),
                ("本期已批改题数", str(grading.answered_question_count)),
                ("答对题数", str(grading.correct_count)),
                ("答错题数", str(grading.wrong_count)),
                ("批改正确率", _accuracy_display(grading.accuracy)),
            ],
            font_name,
            usable_width,
        )
    )
    story.append(Spacer(1, 0.6 * cm))

    # 03. 学习趋势 —— 仅 snapshot.trend_points；无有效 accuracy 点时不画图
    story.append(_section_title("03. 学习趋势", font_name))
    chart_points = _trend_chart_points(snapshot)
    if chart_points:
        story.append(
            _body_paragraph("批改正确率趋势", font_name, alignment=1, font_size=11)
        )
        story.append(_build_trend_chart(chart_points, font_name))
    else:
        story.append(_body_paragraph(NO_TREND_DATA_TEXT, font_name))
    story.append(Spacer(1, 0.6 * cm))

    # 04. 错题概况 —— 仅 snapshot.mistake_metrics
    mistakes = snapshot.mistake_metrics
    story.append(_section_title("04. 错题概况", font_name))
    story.append(
        _facts_table(
            [
                ("当前待巩固错题", str(mistakes.current_pending_count)),
                ("当前已掌握错题", str(mistakes.current_mastered_count)),
                ("本期新增错题", str(mistakes.new_mistake_count_in_period)),
                ("累计复习计数", str(mistakes.review_count_all_time)),
            ],
            font_name,
            usable_width,
        )
    )
    story.append(Spacer(1, 0.6 * cm))

    # 05. 知识点掌握现状 —— 仅 snapshot.current_mastery；empty → 暂无记录
    story.append(_section_title("05. 知识点掌握现状", font_name))
    mastery = snapshot.current_mastery
    weak_text = "、".join(mastery.weak_points) if mastery.weak_points else NO_MASTERY_RECORD_TEXT
    mastered_text = (
        "、".join(mastery.mastered_points) if mastery.mastered_points else NO_MASTERY_RECORD_TEXT
    )
    story.append(
        _facts_table(
            [
                ("待巩固知识点", weak_text),
                ("已掌握知识点", mastered_text),
            ],
            font_name,
            usable_width,
        )
    )

    return story


def build_student_report_pdf_buffer(snapshot: StudentReportSnapshot) -> io.BytesIO:
    """唯一 PDF 入口：StudentReportSnapshot → PDF BytesIO。"""
    font_name = get_chinese_font_name()
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=1.5 * cm,
        leftMargin=1.5 * cm,
        topMargin=1 * cm,
        bottomMargin=1.5 * cm,
    )
    doc.build(_build_report_story(snapshot, font_name))
    buffer.seek(0)
    return buffer


def report_pdf_response(buffer: io.BytesIO) -> Response:
    """报告下载统一 header：RFC 5987 中文文件名 + ASCII 兜底 + private/no-store。

    filename 固定，不含学生姓名（减少 header injection surface 与 PII 暴露）。
    """
    ascii_fallback = (
        REPORT_PDF_FILENAME if REPORT_PDF_FILENAME.isascii() else REPORT_PDF_ASCII_FALLBACK
    )
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f"attachment; filename=\"{ascii_fallback}\"; "
                f"filename*=UTF-8''{quote(REPORT_PDF_FILENAME)}"
            ),
            "Cache-Control": "private, no-store",
        },
    )
