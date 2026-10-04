"""
StudentReportSnapshot DTO（PHASE 2D-1B-1 契约锁定）。

不变量：
- Snapshot 是纯 persisted system facts 的确定性投影；不含教师观察 / 排课 / AI 文本 /
  performance_score / 任何周期 mastery 或周期 review 指标。
- 内部 DB DateTime 一律 naive UTC；本 DTO 对外 datetime 一律 aware UTC（offset=0），
  B2 的 API JSON 不产生浏览器时区歧义。
- counts 允许真实为 0；仅 accuracy 在 answered==0（denominator 缺失）时为 None。
"""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

ReportPeriod = Literal["one_week", "four_weeks", "all_time"]


class SnapshotStudent(BaseModel):
    """报告主体的学生档案事实；performance_score 禁入。"""

    id: int
    name: str
    grade: str
    class_name: str


class SnapshotPeriod(BaseModel):
    """服务端解析后的报告周期（不信任前端 date math）。"""

    kind: ReportPeriod
    start_date: date | None = Field(default=None, description="all_time 为 None；否则为报告时区本地日历日（含端点）")
    end_date: date = Field(description="报告时区本地 today（含端点）")
    timezone: str = Field(description="REPORT_TIMEZONE IANA 名称，如 Asia/Shanghai")
    generated_at: datetime = Field(description="快照生成时刻，aware UTC")


class SnapshotCoverage(BaseModel):
    """数据覆盖标志：驱动「暂无数据」合法空态，禁止用 0 伪装观测。"""

    has_assignment_data: bool
    has_grading_data: bool
    has_mistake_data: bool


class SnapshotAssignmentMetrics(BaseModel):
    """Assignment axis：事件日 = assignment_date，否则 created_at 的报告时区本地日历日。"""

    assigned_exam_count: int
    assigned_question_count: int


class SnapshotGradingMetrics(BaseModel):
    """Grading axis：事件时间 = graded_at；grade_summary 永远不作为权威。"""

    graded_exam_count: int
    answered_question_count: int
    correct_count: int
    wrong_count: int
    accuracy: float | None = Field(default=None, description="correct/answered；answered==0 → None")


class SnapshotTrendPoint(BaseModel):
    """趋势点只来自真实 graded exam；accuracy=None 时消费端不得画成 0%。"""

    exam_id: int
    title: str
    graded_at: datetime = Field(description="批改事件时间，aware UTC")
    answered: int
    correct: int
    accuracy: float | None


class SnapshotMistakeMetrics(BaseModel):
    """错题事实计数。review_count 是 system-maintained cumulative review counter
    （含批改中成功纠正已有错题的累计），不是「点击复习按钮次数」。"""

    current_pending_count: int
    current_mastered_count: int
    new_mistake_count_in_period: int
    review_count_all_time: int


class SnapshotCurrentMastery(BaseModel):
    """仅 current-state mastery；周期 mastery 事件在 MASTERY_EVENT_TIME_AUTHORITY_REQUIRED
    解决前禁止存在。weak wins：同一 topic 既 pending 又 mastered 时归入 weak。"""

    scope: Literal["current_state"]
    weak_points: list[str]
    mastered_points: list[str]


class StudentReportSnapshot(BaseModel):
    """报告 SSOT：UI / LLM narrative / PDF 三个消费端共用同一份事实。"""

    student: SnapshotStudent
    period: SnapshotPeriod
    coverage: SnapshotCoverage
    assignment_metrics: SnapshotAssignmentMetrics
    grading_metrics: SnapshotGradingMetrics
    trend_points: list[SnapshotTrendPoint] = Field(default_factory=list)
    mistake_metrics: SnapshotMistakeMetrics
    current_mastery: SnapshotCurrentMastery
