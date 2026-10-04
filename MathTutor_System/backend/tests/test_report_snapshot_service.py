"""
PHASE 2D-1B-1 service-level tests: authoritative student report snapshot.

固定时钟基准：NOW_UTC = naive UTC 2026-10-04 12:00
→ REPORT_TIMEZONE(Asia/Shanghai) 本地 2026-10-04 20:00 → report local today = 2026-10-04
边界（UTC+8 固定偏移，无 DST）：
  one_week   : start_date 2026-09-28 → start_utc 2026-09-27 16:00 UTC
               end_utc = 2026-10-04 16:00 UTC（= 本地 10-05 00:00，排他）
  four_weeks : start_date 2026-09-07 → start_utc 2026-09-06 16:00 UTC
"""
import json
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.exam import Exam
from app.models.mistake import MistakeRecord
from app.models.student import Student
from app.models.user import User
from app.services.report_snapshot_service import (
    build_student_report_snapshot,
    extract_report_questions,
    normalize_report_grade_results,
    resolve_report_period,
)

TZ = ZoneInfo("Asia/Shanghai")
NOW_UTC = datetime(2026, 10, 4, 12, 0, 0)
REPORT_TODAY = date(2026, 10, 4)
ONE_WEEK_START = date(2026, 9, 28)
ONE_WEEK_START_UTC = datetime(2026, 9, 27, 16, 0, 0)
ONE_WEEK_END_UTC = datetime(2026, 10, 4, 16, 0, 0)
FOUR_WEEKS_START = date(2026, 9, 7)
FOUR_WEEKS_START_UTC = datetime(2026, 9, 6, 16, 0, 0)

IN_PERIOD_UTC = datetime(2026, 9, 30, 8, 0, 0)  # 本地 09-30 16:00，窗口内


def make_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(
        engine,
        tables=[User.__table__, Student.__table__, Exam.__table__, MistakeRecord.__table__],
    )
    return sessionmaker(bind=engine)()


@pytest.fixture()
def db():
    return make_db()


def add_student(db, student_id=1, user_id=10, name="Alice", **extra):
    row = Student(
        id=student_id,
        user_id=user_id,
        name=name,
        grade="八年级",
        class_name="1班",
        **extra,
    )
    db.add(row)
    db.commit()
    return row


def add_exam(db, **params):
    base = dict(
        owner_user_id=10,
        student_id=1,
        title="试卷",
        questions=[{"content": "q1"}, {"content": "q2"}],
        created_at=IN_PERIOD_UTC,
        assignment_date=None,
        graded_at=None,
        grade_results=None,
        grade_summary=None,
    )
    base.update(params)
    row = Exam(**base)
    db.add(row)
    db.commit()
    return row


def add_mistake(
    db,
    *,
    topic="函数",
    status="pending",
    created_at=IN_PERIOD_UTC,
    mastered_at=None,
    review_count=0,
    content="q",
):
    row = MistakeRecord(
        student_id=1,
        topic=topic,
        source="试卷批改",
        content=content,
        status=status,
        review_count=review_count,
        created_at=created_at,
        mastered_at=mastered_at,
    )
    db.add(row)
    db.commit()
    return row


def build_snapshot(db, period="one_week", student_id=1, now=NOW_UTC):
    return build_student_report_snapshot(db, db.get(Student, student_id), period, now_utc=now)


# ---------------------------------------------------------------- period / tz


def test_resolve_period_boundaries():
    one = resolve_report_period("one_week", report_now_utc=NOW_UTC, tz=TZ)
    assert one.kind == "one_week"
    assert one.start_date == ONE_WEEK_START and one.end_date == REPORT_TODAY
    assert one.start_utc == ONE_WEEK_START_UTC and one.end_utc == ONE_WEEK_END_UTC

    four = resolve_report_period("four_weeks", report_now_utc=NOW_UTC, tz=TZ)
    assert four.start_date == FOUR_WEEKS_START
    assert four.start_utc == FOUR_WEEKS_START_UTC and four.end_utc == ONE_WEEK_END_UTC

    alt = resolve_report_period("all_time", report_now_utc=NOW_UTC, tz=TZ)
    assert alt.start_date is None and alt.start_utc is None
    assert alt.end_date == REPORT_TODAY and alt.end_utc == ONE_WEEK_END_UTC


def test_period_one_week_exact_boundaries(db):
    add_student(db)
    # 含端点：start_date 当天布置 → 计入；前一天 → 排除
    add_exam(db, assignment_date=ONE_WEEK_START)
    add_exam(db, assignment_date=date(2026, 9, 27))
    snap = build_snapshot(db, "one_week")
    assert snap.period.kind == "one_week"
    assert snap.period.start_date == ONE_WEEK_START
    assert snap.period.end_date == REPORT_TODAY
    assert snap.period.timezone == "Asia/Shanghai"
    assert snap.assignment_metrics.assigned_exam_count == 1


def test_period_four_weeks_exact_boundaries(db):
    add_student(db)
    add_exam(db, assignment_date=FOUR_WEEKS_START)
    add_exam(db, assignment_date=date(2026, 9, 6))
    snap = build_snapshot(db, "four_weeks")
    assert snap.period.start_date == FOUR_WEEKS_START
    assert snap.assignment_metrics.assigned_exam_count == 1


def test_period_all_time_future_excluded(db):
    add_student(db)
    add_exam(db, assignment_date=date(2026, 9, 1))  # 过去 → in
    add_exam(db, assignment_date=date(2026, 10, 10))  # future → out
    add_exam(
        db,
        graded_at=datetime(2026, 10, 4, 15, 0, 0),  # end_utc 之前 → in
        grade_results=[{"question_index": 0, "is_correct": True}],
    )
    add_exam(
        db,
        graded_at=datetime(2026, 10, 4, 17, 0, 0),  # >= end_utc（future/corrupt）→ out
        grade_results=[{"question_index": 0, "is_correct": True}],
    )
    add_mistake(db, created_at=datetime(2026, 10, 4, 17, 0, 0))  # future created → 周期不计
    snap = build_snapshot(db, "all_time")
    assert snap.period.start_date is None
    # 1 卷显式过去日期 + 2 卷 graded（无 assignment_date → created_at 09-30 回退）计入；
    # 仅 future(10-10) 卷被排除。
    assert snap.assignment_metrics.assigned_exam_count == 3
    assert snap.assignment_metrics.assigned_question_count == 6
    assert snap.grading_metrics.graded_exam_count == 1
    assert snap.mistake_metrics.new_mistake_count_in_period == 0
    assert snap.mistake_metrics.current_pending_count == 1  # current state 不受 period 过滤


def test_tz_midnight_boundary(db):
    add_student(db)
    add_mistake(db, content="a", created_at=datetime(2026, 10, 4, 15, 59, 59))  # 本地 23:59:59 → in
    add_mistake(db, content="b", created_at=datetime(2026, 10, 4, 16, 0, 0))  # 本地 10-05 00:00 → out
    add_mistake(db, content="c", created_at=datetime(2026, 9, 27, 16, 0, 0))  # 本地 09-28 00:00 → in
    add_mistake(db, content="d", created_at=datetime(2026, 9, 27, 15, 59, 59))  # → out
    snap = build_snapshot(db, "one_week")
    assert snap.mistake_metrics.new_mistake_count_in_period == 2


def test_period_invalid_rejected(db):
    add_student(db)
    with pytest.raises(ValueError):
        build_snapshot(db, "term")


def test_report_timezone_invalid_fails_fast():
    from app.core.config import AppSettings

    with pytest.raises(ValueError):
        AppSettings(REPORT_TIMEZONE="Not/ARealZone")


# ---------------------------------------------------------------- wire contract


def test_tz_wire_snapshot_datetimes_aware_utc(db):
    add_student(db)
    add_exam(
        db,
        graded_at=datetime(2026, 10, 1, 8, 0, 0),
        grade_results=[{"question_index": 0, "is_correct": True}],
    )
    snap = build_snapshot(db, "one_week")
    assert snap.period.generated_at.tzinfo is not None
    assert snap.period.generated_at.utcoffset() == timedelta(0)
    point = snap.trend_points[0]
    assert point.graded_at.tzinfo is not None
    assert point.graded_at.utcoffset() == timedelta(0)
    data = json.loads(snap.model_dump_json())
    assert data["period"]["generated_at"].endswith(("Z", "+00:00"))
    assert data["trend_points"][0]["graded_at"].endswith(("Z", "+00:00"))


# ---------------------------------------------------------------- question extraction


def test_exam_shape_classic_list(db):
    add_student(db)
    add_exam(db, questions=[{"content": "a"}, {"content": "b"}, {"content": "c"}])
    snap = build_snapshot(db, "one_week")
    assert snap.assignment_metrics.assigned_exam_count == 1
    assert snap.assignment_metrics.assigned_question_count == 3


def test_exam_shape_guidance_bundle_nested_list(db):
    add_student(db)
    add_exam(
        db,
        questions={
            "knowledge_card": {"title": "card"},
            "examples": [{"content": "e1"}],
            "questions": [{"content": "q1"}, {"content": "q2"}],
        },
    )
    snap = build_snapshot(db, "one_week")
    assert snap.assignment_metrics.assigned_question_count == 2


def test_question_shape_malformed_never_becomes_questions(db):
    assert extract_report_questions({"questions": {"a": 1}}) == []  # dict keys 不算题
    assert extract_report_questions("some string") == []
    assert extract_report_questions(None) == []
    assert extract_report_questions({"other": [1, 2]}) == []
    assert extract_report_questions({"questions": "not a list"}) == []

    add_student(db)
    for broken in ({"questions": {"a": 1}}, "s", None, {"questions": 3}):
        add_exam(db, questions=broken)
    snap = build_snapshot(db, "one_week")
    assert snap.assignment_metrics.assigned_exam_count == 4
    assert snap.assignment_metrics.assigned_question_count == 0


def test_question_shape_non_dict_items(db):
    add_student(db)
    add_exam(db, questions=["junk", None, {"content": "q3"}])
    add_exam(
        db,
        graded_at=datetime(2026, 10, 1, 8, 0, 0),
        questions=["junk", None, {"content": "q3"}],
        grade_results=[
            {"question_index": 0, "is_correct": True},  # 题目非 dict → index 无效
            {"question_index": 2, "is_correct": False},
        ],
    )
    snap = build_snapshot(db, "one_week")
    # question_count 只计 list 长度（含非 dict 元素）；两卷各 3 元素
    assert snap.assignment_metrics.assigned_question_count == 6
    # 非 dict 题目上的批改行被确定性排除
    assert snap.grading_metrics.answered_question_count == 1
    assert snap.grading_metrics.correct_count == 0
    assert snap.grading_metrics.wrong_count == 1
    assert snap.grading_metrics.accuracy == 0.0


# ---------------------------------------------------------------- grade normalization


def test_normalize_grade_results_pure_helpers():
    flat = [{"content": "a"}, {"content": "b"}, {"content": "c"}]
    assert normalize_report_grade_results(
        [{"question_index": 1, "is_correct": False}, {"question_index": 1, "is_correct": True}], flat
    ) == {1: True}  # LAST OCCURRENCE WINS
    assert normalize_report_grade_results("junk", flat) == {}
    assert normalize_report_grade_results({"question_index": 0}, flat) == {}
    assert normalize_report_grade_results(
        [
            42,
            None,
            "row",
            {"question_index": True, "is_correct": True},  # bool 不算 int
            {"question_index": -1, "is_correct": True},
            {"question_index": 99, "is_correct": True},  # 越界
            {"question_index": 0, "is_correct": "yes"},  # 非 bool
            {"question_index": 0, "is_correct": 1},  # 非 bool
            {"question_index": 0, "is_correct": None},
            {"question_index": 0},  # 缺 is_correct
            {"is_correct": True},  # 缺 index
        ],
        flat,
    ) == {}
    assert normalize_report_grade_results(None, flat) == {}
    # 空 flat：任何 index 都越界
    assert normalize_report_grade_results([{"question_index": 0, "is_correct": True}], []) == {}


def test_grade_partial_results(db):
    add_student(db)
    add_exam(
        db,
        questions=[{"content": "q1"}, {"content": "q2"}, {"content": "q3"}, {"content": "q4"}],
        graded_at=datetime(2026, 10, 1, 8, 0, 0),
        grade_results=[
            {"question_index": 1, "is_correct": True},
            {"question_index": 3, "is_correct": False},
        ],
    )
    snap = build_snapshot(db, "one_week")
    assert snap.grading_metrics.graded_exam_count == 1
    assert snap.grading_metrics.answered_question_count == 2
    assert snap.grading_metrics.correct_count == 1
    assert snap.grading_metrics.wrong_count == 1
    assert snap.grading_metrics.accuracy == pytest.approx(0.5)
    assert snap.assignment_metrics.assigned_question_count == 4


def test_grade_dup_last_wins(db):
    add_student(db)
    add_exam(
        db,
        graded_at=datetime(2026, 10, 1, 8, 0, 0),
        grade_results=[
            {"question_index": 1, "is_correct": False},
            {"question_index": 1, "is_correct": True},
        ],
    )
    snap = build_snapshot(db, "one_week")
    assert snap.grading_metrics.answered_question_count == 1  # duplicate 折叠为一行
    assert snap.grading_metrics.correct_count == 1  # last occurrence wins
    assert snap.grading_metrics.wrong_count == 0
    assert snap.grading_metrics.accuracy == 1.0


def test_grade_malformed_rows_ignored_deterministically(db):
    add_student(db)
    add_exam(
        db,
        graded_at=datetime(2026, 10, 1, 8, 0, 0),
        grade_results=[
            42,
            "row",
            None,
            {"question_index": True, "is_correct": True},
            {"question_index": -1, "is_correct": True},
            {"question_index": 99, "is_correct": True},
            {"question_index": 0, "is_correct": "yes"},
            {"question_index": 1, "is_correct": True},  # 唯一有效行
        ],
    )
    snap = build_snapshot(db, "one_week")
    assert snap.grading_metrics.answered_question_count == 1
    assert snap.grading_metrics.correct_count == 1
    assert snap.grading_metrics.accuracy == 1.0


def test_grade_summary_never_authoritative(db):
    add_student(db)
    add_exam(
        db,
        graded_at=datetime(2026, 10, 1, 8, 0, 0),
        grade_summary={"correct": 99, "total": 99},  # 与事实冲突的缓存
        grade_results=[
            {"question_index": 0, "is_correct": True},
            {"question_index": 1, "is_correct": False},
        ],
    )
    snap = build_snapshot(db, "one_week")
    assert snap.grading_metrics.answered_question_count == 2
    assert snap.grading_metrics.correct_count == 1
    assert snap.grading_metrics.wrong_count == 1
    assert snap.grading_metrics.accuracy == pytest.approx(0.5)


# ---------------------------------------------------------------- dual axis


def test_period_grade_axis_assigned_outside_graded_inside(db):
    add_student(db)
    add_exam(
        db,
        assignment_date=date(2026, 9, 1),  # assignment 在窗外
        graded_at=datetime(2026, 10, 1, 8, 0, 0),  # grading 在窗内
        grade_results=[
            {"question_index": 0, "is_correct": True},
            {"question_index": 1, "is_correct": True},
        ],
    )
    snap = build_snapshot(db, "one_week")
    assert snap.assignment_metrics.assigned_exam_count == 0
    assert snap.assignment_metrics.assigned_question_count == 0
    assert snap.coverage.has_assignment_data is False
    assert snap.grading_metrics.graded_exam_count == 1
    assert snap.grading_metrics.answered_question_count == 2
    assert snap.grading_metrics.accuracy == 1.0
    assert snap.coverage.has_grading_data is True
    assert len(snap.trend_points) == 1


def test_period_assign_axis_assigned_inside_graded_outside(db):
    add_student(db)
    add_exam(
        db,
        assignment_date=date(2026, 9, 30),  # assignment 在窗内
        graded_at=datetime(2026, 9, 1, 8, 0, 0),  # grading 在窗外
        grade_results=[
            {"question_index": 0, "is_correct": True},
            {"question_index": 1, "is_correct": True},
        ],
    )
    snap = build_snapshot(db, "one_week")
    assert snap.assignment_metrics.assigned_exam_count == 1
    assert snap.assignment_metrics.assigned_question_count == 2
    assert snap.coverage.has_assignment_data is True
    assert snap.grading_metrics.graded_exam_count == 0
    assert snap.grading_metrics.answered_question_count == 0
    assert snap.grading_metrics.accuracy is None
    assert snap.coverage.has_grading_data is False
    assert snap.trend_points == []


# ---------------------------------------------------------------- no data / coverage


def test_no_data_counts_are_zero_and_accuracy_null(db):
    add_student(db)
    snap = build_snapshot(db, "one_week")
    assert snap.assignment_metrics.assigned_exam_count == 0
    assert snap.assignment_metrics.assigned_question_count == 0
    assert snap.grading_metrics.graded_exam_count == 0
    assert snap.grading_metrics.answered_question_count == 0
    assert snap.grading_metrics.correct_count == 0
    assert snap.grading_metrics.wrong_count == 0
    assert snap.grading_metrics.accuracy is None  # denominator 缺失 → None，不是 0
    assert snap.mistake_metrics.current_pending_count == 0
    assert snap.mistake_metrics.new_mistake_count_in_period == 0
    assert snap.mistake_metrics.review_count_all_time == 0
    assert snap.coverage.has_assignment_data is False
    assert snap.coverage.has_grading_data is False
    assert snap.coverage.has_mistake_data is False
    assert snap.trend_points == []
    assert snap.current_mastery.weak_points == []
    assert snap.current_mastery.mastered_points == []


# ---------------------------------------------------------------- trend


def test_trend_real_graded_exams_only_ascending(db):
    add_student(db)
    add_exam(db, title="未批改卷", graded_at=None)  # 无 trend point
    add_exam(
        db,
        title="卷B",
        graded_at=datetime(2026, 10, 2, 8, 0, 0),
        grade_results=[{"question_index": 0, "is_correct": True}, {"question_index": 1, "is_correct": False}],
    )
    add_exam(
        db,
        title="卷A",
        graded_at=datetime(2026, 9, 29, 8, 0, 0),
        grade_results=[{"question_index": 0, "is_correct": True}],
    )
    snap = build_snapshot(db, "one_week")
    assert [p.title for p in snap.trend_points] == ["卷A", "卷B"]  # graded_at 升序
    first = snap.trend_points[0]
    assert first.answered == 1 and first.correct == 1 and first.accuracy == 1.0
    second = snap.trend_points[1]
    assert second.answered == 2 and second.correct == 1
    assert second.accuracy == pytest.approx(0.5)


def test_trend_limit_keeps_newest_ten_ascending(db):
    add_student(db)
    for i in range(11):
        add_exam(
            db,
            title=f"卷{i + 1}",
            graded_at=datetime(2026, 9, 28, 0, 0) + timedelta(hours=i),  # 全部在窗内
            grade_results=[{"question_index": 0, "is_correct": True}],
        )
    snap = build_snapshot(db, "one_week")
    assert len(snap.trend_points) == 10
    assert [p.exam_id for p in snap.trend_points] == list(range(2, 12))  # 丢弃最旧，输出升序


def test_trend_answered_zero_keeps_point_accuracy_null(db):
    add_student(db)
    add_exam(
        db,
        graded_at=datetime(2026, 10, 1, 8, 0, 0),
        grade_results=[{"question_index": 0, "is_correct": "junk"}],  # 全部无效 → answered 0
    )
    snap = build_snapshot(db, "one_week")
    assert snap.grading_metrics.graded_exam_count == 1
    assert snap.grading_metrics.accuracy is None
    assert len(snap.trend_points) == 1  # grading event 保留
    assert snap.trend_points[0].accuracy is None  # 消费端不得画成 0%


# ---------------------------------------------------------------- mistakes


def test_mistake_metrics_period_counts(db):
    add_student(db)
    add_mistake(db, content="a", created_at=datetime(2026, 9, 30, 8, 0, 0), status="pending")
    add_mistake(db, content="b", created_at=datetime(2026, 10, 1, 8, 0, 0), status="pending")
    add_mistake(db, content="c", created_at=datetime(2026, 9, 1, 8, 0, 0), status="pending")  # 窗外
    add_mistake(db, content="d", created_at=datetime(2026, 10, 2, 8, 0, 0), status="mastered")
    snap = build_snapshot(db, "one_week")
    assert snap.mistake_metrics.current_pending_count == 3
    assert snap.mistake_metrics.current_mastered_count == 1
    assert snap.mistake_metrics.new_mistake_count_in_period == 3
    assert snap.coverage.has_mistake_data is True


def test_review_count_all_time_is_cumulative_counter(db):
    add_student(db)
    add_mistake(db, content="a", review_count=0)
    add_mistake(db, content="b", review_count=2)
    add_mistake(db, content="c", review_count=5)
    snap = build_snapshot(db, "one_week")
    # system-maintained cumulative review counter（含批改中成功纠正已有错题的累计）
    assert snap.mistake_metrics.review_count_all_time == 7


# ---------------------------------------------------------------- mastery


def test_mastery_current_state_weak_wins(db):
    add_student(db)
    add_mistake(db, topic="函数+几何", status="pending")
    add_mistake(db, topic="函数", status="mastered")
    add_mistake(db, topic="方程", status="mastered")
    snap = build_snapshot(db, "one_week")
    assert snap.current_mastery.scope == "current_state"
    assert snap.current_mastery.weak_points == ["几何", "函数"]  # split_topics 展开；codepoint 排序
    assert snap.current_mastery.mastered_points == ["方程"]  # weak wins：函数被剔除


def test_mastery_mastered_at_has_zero_effect(db):
    add_student(db)
    add_mistake(db, topic="函数", status="mastered", mastered_at=None)
    add_mistake(db, topic="代数", status="mastered", mastered_at=datetime(2025, 1, 1, 0, 0, 0))
    add_mistake(db, topic="几何", status="mastered", mastered_at=datetime(2027, 1, 1, 0, 0, 0))
    snap_one = build_snapshot(db, "one_week")
    snap_all = build_snapshot(db, "all_time")
    # 现状口径与 mastered_at 取值、period 选择完全无关
    assert snap_one.mistake_metrics.current_mastered_count == 3
    assert snap_all.mistake_metrics.current_mastered_count == 3
    assert snap_one.current_mastery.mastered_points == ["代数", "几何", "函数"]
    assert snap_all.current_mastery.mastered_points == snap_one.current_mastery.mastered_points
    data = json.loads(snap_one.model_dump_json())
    assert "mastered_in_period" not in data["mistake_metrics"]
    assert "review_count_in_period" not in data["mistake_metrics"]


# ---------------------------------------------------------------- owner / tenant


def test_ownerless_student_fail_closed(db):
    row = add_student(db, user_id=None)
    with pytest.raises(ValueError):
        build_student_report_snapshot(db, row, "one_week", now_utc=NOW_UTC)


def test_owner_mismatch_exam_not_trusted(db):
    add_student(db)  # user_id=10
    add_exam(db, owner_user_id=99, student_id=1)  # student_id 匹配但 owner 不同
    add_exam(db, owner_user_id=None, student_id=1)  # ownerless exam 不可信
    snap = build_snapshot(db, "all_time")
    assert snap.assignment_metrics.assigned_exam_count == 0
    assert snap.grading_metrics.graded_exam_count == 0
    assert snap.coverage.has_assignment_data is False


# ---------------------------------------------------------------- forbidden fields


def test_performance_score_never_in_snapshot(db):
    add_student(db, performance_score=60)  # 显式设置，若泄漏必然序列化
    add_exam(db, graded_at=datetime(2026, 10, 1, 8, 0, 0))
    snap = build_snapshot(db, "one_week")
    assert "performance_score" not in snap.model_dump_json()
    assert "teacher_observation" not in snap.model_dump_json()
    assert "scheduled_lesson_count" not in snap.model_dump_json()
    assert "exam_submission_rate" not in snap.model_dump_json()


def test_snapshot_deterministic(db):
    add_student(db)
    add_exam(db, graded_at=datetime(2026, 10, 1, 8, 0, 0))
    add_mistake(db)
    first = build_snapshot(db, "one_week").model_dump()
    second = build_snapshot(db, "one_week").model_dump()
    assert first == second
