"""
Authoritative student report snapshot aggregation（PHASE 2D-1B-1）。

核心不变量：StudentReportSnapshot 中每个值都必须可追溯到 authoritative persisted state，
或其上的一项有文档的确定性计算。禁止 synthetic fallback / 任意系数 / 推断。

时区合同（REPORT_TIMEZONE，default Asia/Shanghai）：
- DB DateTime 一律 naive UTC（models.base.utc_now）。
- 读取：naive UTC → attach UTC → convert REPORT_TIMEZONE。
- SQL/内存比较边界：本地日历边界 → aware local → aware UTC → strip tzinfo → naive UTC。
- 禁止 host timezone、date.today()、SQLite/PG timezone casting 作为周期权威。

双轴合同：
- Assignment axis 事件日 = Exam.assignment_date，缺省回退 created_at 的报告时区本地日历日。
- Grading axis 事件时间 = Exam.graded_at。两轴独立过滤，严禁合并为 generic exam period。
- all_time 仍受 end_utc 上界约束（future/corrupt 时间戳不进 today 报告）。
"""
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.config import get_report_timezone
from app.models.exam import Exam
from app.models.mistake import MistakeRecord
from app.models.student import Student
from app.schemas.report_snapshot_dto import (
    ReportPeriod,
    SnapshotAssignmentMetrics,
    SnapshotCoverage,
    SnapshotCurrentMastery,
    SnapshotGradingMetrics,
    SnapshotMistakeMetrics,
    SnapshotPeriod,
    SnapshotStudent,
    SnapshotTrendPoint,
    StudentReportSnapshot,
)
from app.services.topic_service import split_topics

UTC = timezone.utc

VALID_REPORT_PERIODS: tuple[ReportPeriod, ...] = ("one_week", "four_weeks", "all_time")

ONE_WEEK_START_OFFSET_DAYS = 6  # 含端点 7 天窗口
FOUR_WEEKS_START_OFFSET_DAYS = 27  # 含端点 28 天窗口

TREND_POINT_LIMIT = 10


def to_aware_utc(naive_utc: datetime) -> datetime:
    """DB naive UTC → DTO aware UTC（offset=0）。"""
    return naive_utc.replace(tzinfo=UTC)


def to_report_local_date(naive_utc: datetime, tz) -> date:
    """DB naive UTC → attach UTC → convert REPORT_TIMEZONE → 本地日历日。"""
    return naive_utc.replace(tzinfo=UTC).astimezone(tz).date()


def naive_utc_boundary(day: date, tz) -> datetime:
    """本地日历日 00:00 → aware local → aware UTC → naive UTC（DB 比较边界）。"""
    local_midnight = datetime.combine(day, time.min).replace(tzinfo=tz)
    return local_midnight.astimezone(UTC).replace(tzinfo=None)


@dataclass(frozen=True)
class ResolvedReportPeriod:
    kind: ReportPeriod
    start_date: date | None
    end_date: date
    timezone_name: str
    start_utc: datetime | None  # naive UTC，含端（下界）
    end_utc: datetime  # naive UTC，排他上界 = end_date+1d 的本地 00:00


def resolve_report_period(
    period: ReportPeriod,
    *,
    report_now_utc: datetime,
    tz,
) -> ResolvedReportPeriod:
    """服务端权威周期解析：窗口 = [start_date 00:00 local, end_date+1d 00:00 local)。"""
    if period not in VALID_REPORT_PERIODS:
        raise ValueError(f"unsupported report period: {period!r}")
    end_date = to_report_local_date(report_now_utc, tz)
    if period == "one_week":
        start_date: date | None = end_date - timedelta(days=ONE_WEEK_START_OFFSET_DAYS)
    elif period == "four_weeks":
        start_date = end_date - timedelta(days=FOUR_WEEKS_START_OFFSET_DAYS)
    else:
        start_date = None
    end_utc = naive_utc_boundary(end_date + timedelta(days=1), tz)
    start_utc = naive_utc_boundary(start_date, tz) if start_date is not None else None
    return ResolvedReportPeriod(
        kind=period,
        start_date=start_date,
        end_date=end_date,
        timezone_name=tz.key,
        start_utc=start_utc,
        end_utc=end_utc,
    )


def extract_report_questions(questions) -> list:
    """Safe question extraction：绝不把 str / dict keys 误当成题目。

    questions is list → 该 list
    questions is dict 且 questions["questions"] is list → 嵌套 list
    otherwise → []
    """
    if isinstance(questions, list):
        return list(questions)
    if isinstance(questions, dict):
        nested = questions.get("questions")
        if isinstance(nested, list):
            return list(nested)
    return []


def normalize_report_grade_results(grade_results, flattened_questions: list) -> dict[int, bool]:
    """Defensive grade_results 归一化 → {question_index: is_correct}。

    - grade_results 必须 list；row 必须 dict。
    - question_index 必须 type(idx) is int（bool 不算 int）且 0 <= idx < len(flattened)。
    - 对应 flattened 题目元素必须是 dict，否则该 index 不构成 valid answerable question。
    - is_correct 必须 type(x) is bool。
    - 不满足者确定性丢弃，绝不 crash、不改库。
    - duplicate question_index → LAST OCCURRENCE WINS。
    - grade_summary 永远不作为权威（本函数不读它）。
    """
    if not isinstance(grade_results, list):
        return {}
    normalized: dict[int, bool] = {}
    total = len(flattened_questions)
    for row in grade_results:
        if not isinstance(row, dict):
            continue
        index = row.get("question_index")
        if type(index) is not int or index < 0 or index >= total:
            continue
        if not isinstance(flattened_questions[index], dict):
            continue
        is_correct = row.get("is_correct")
        if type(is_correct) is not bool:
            continue
        normalized[index] = is_correct
    return normalized


def _effective_assignment_date(exam: Exam, tz) -> date | None:
    """Assignment axis 事件日；无法确定事件日（两处均缺失/损坏）时返回 None 并被排除。"""
    assignment_date = exam.assignment_date
    if isinstance(assignment_date, datetime):
        assignment_date = assignment_date.date()
    if isinstance(assignment_date, date):
        return assignment_date
    created_at = exam.created_at
    if isinstance(created_at, datetime):
        return to_report_local_date(created_at, tz)
    return None


def _in_period_utc(moment: datetime | None, resolved: ResolvedReportPeriod) -> bool:
    if not isinstance(moment, datetime):
        return False
    if resolved.start_utc is not None and moment < resolved.start_utc:
        return False
    return moment < resolved.end_utc


def build_student_report_snapshot(
    db: Session,
    student: Student,
    period: ReportPeriod,
    *,
    now_utc: datetime | None = None,
) -> StudentReportSnapshot:
    """构建学生报告快照。调用方必须先完成 student 的 authorization；service 内部
    仍显式按 owner 过滤 Exam，且 ownerless 学生 fail closed。"""
    if student.user_id is None:
        # OWNERLESS-01：学生无归属教师 → 不存在合法租户视角，绝不从 student_id 推断 ownership。
        raise ValueError("student has no owning user; report snapshot is fail-closed")
    if period not in VALID_REPORT_PERIODS:
        raise ValueError(f"unsupported report period: {period!r}")

    tz = get_report_timezone()
    now = now_utc if now_utc is not None else datetime.now(UTC).replace(tzinfo=None)
    resolved = resolve_report_period(period, report_now_utc=now, tz=tz)

    # 2 个 bounded query；JSON snapshot 字段全部在内存做归一化，无 N+1。
    exams = (
        db.query(Exam)
        .filter(
            Exam.student_id == student.id,
            Exam.owner_user_id == student.user_id,
        )
        .all()
    )
    mistakes = db.query(MistakeRecord).filter(MistakeRecord.student_id == student.id).all()

    assigned_exam_count = 0
    assigned_question_count = 0
    graded_exam_count = 0
    answered_total = 0
    correct_total = 0
    trend_candidates: list[tuple[datetime, int, str, int, int]] = []

    for exam in exams:
        event_date = _effective_assignment_date(exam, tz)
        if (
            event_date is not None
            and event_date <= resolved.end_date
            and (resolved.start_date is None or event_date >= resolved.start_date)
        ):
            # question_count 只计 list 长度；与 grade_results 数量无关。
            assigned_exam_count += 1
            assigned_question_count += len(extract_report_questions(exam.questions))

        if not _in_period_utc(exam.graded_at if isinstance(exam.graded_at, datetime) else None, resolved):
            continue
        flat = extract_report_questions(exam.questions)
        grade_map = normalize_report_grade_results(exam.grade_results, flat)
        answered = len(grade_map)
        correct = sum(1 for flag in grade_map.values() if flag)
        graded_exam_count += 1
        answered_total += answered
        correct_total += correct
        trend_candidates.append((exam.graded_at, exam.id, exam.title or "", answered, correct))

    accuracy = (correct_total / answered_total) if answered_total > 0 else None

    # 保留最新 10 个（graded_at, exam_id 降序），再按时间升序输出。
    trend_candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    trend_candidates = trend_candidates[:TREND_POINT_LIMIT]
    trend_candidates.sort(key=lambda item: (item[0], item[1]))
    trend_points = [
        SnapshotTrendPoint(
            exam_id=exam_id,
            title=title,
            graded_at=to_aware_utc(graded_at),
            answered=answered,
            correct=correct,
            accuracy=(correct / answered) if answered > 0 else None,
        )
        for graded_at, exam_id, title, answered, correct in trend_candidates
    ]

    current_pending_count = 0
    current_mastered_count = 0
    new_mistake_count_in_period = 0
    review_count_all_time = 0
    weak_topics: set[str] = set()
    mastered_topics: set[str] = set()
    for row in mistakes:
        if row.status == "pending":
            current_pending_count += 1
            weak_topics |= split_topics(row.topic)
        elif row.status == "mastered":
            current_mastered_count += 1
            mastered_topics |= split_topics(row.topic)
        if _in_period_utc(row.created_at, resolved):
            new_mistake_count_in_period += 1
        review_count = row.review_count
        # review_count_all_time = system-maintained cumulative review counter（含批改纠错累计）。
        if type(review_count) is int and review_count > 0:
            review_count_all_time += review_count

    return StudentReportSnapshot(
        student=SnapshotStudent(
            id=student.id,
            name=student.name,
            grade=student.grade,
            class_name=student.class_name,
        ),
        period=SnapshotPeriod(
            kind=period,
            start_date=resolved.start_date,
            end_date=resolved.end_date,
            timezone=resolved.timezone_name,
            generated_at=to_aware_utc(now),
        ),
        coverage=SnapshotCoverage(
            has_assignment_data=assigned_exam_count > 0,
            has_grading_data=graded_exam_count > 0,
            has_mistake_data=(
                current_pending_count > 0
                or current_mastered_count > 0
                or new_mistake_count_in_period > 0
                or review_count_all_time > 0
            ),
        ),
        assignment_metrics=SnapshotAssignmentMetrics(
            assigned_exam_count=assigned_exam_count,
            assigned_question_count=assigned_question_count,
        ),
        grading_metrics=SnapshotGradingMetrics(
            graded_exam_count=graded_exam_count,
            answered_question_count=answered_total,
            correct_count=correct_total,
            wrong_count=answered_total - correct_total,
            accuracy=accuracy,
        ),
        trend_points=trend_points,
        mistake_metrics=SnapshotMistakeMetrics(
            current_pending_count=current_pending_count,
            current_mastered_count=current_mastered_count,
            new_mistake_count_in_period=new_mistake_count_in_period,
            review_count_all_time=review_count_all_time,
        ),
        current_mastery=SnapshotCurrentMastery(
            scope="current_state",
            weak_points=sorted(weak_topics),
            mastered_points=sorted(mastered_topics - weak_topics),
        ),
    )
