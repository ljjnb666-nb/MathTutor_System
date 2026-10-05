"""
DASHBOARD-CONTRACT-RF01：Dashboard 统计与试卷状态 authority 契约测试。

- 真实空库必须返回 AUTHORITATIVE ZERO（HTTP 200 + 0/[]）；
- 内部查询失败必须 fail-closed（non-2xx + 稳定机器码），不得降级为全零 200，
  也不得泄露原始异常文本；
- RecentExamItem.student_id（来自 Exam 行本身）/ graded_at 是试卷状态事实
  authority；grade_summary 不是 canonical grading authority。
"""
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.endpoints.auth import get_current_user
from app.main import app
from app.models.base import Base, get_db
from app.models.exam import Exam
from app.models.mistake import MistakeRecord
from app.models.question import Question
from app.models.student import Student
from app.models.user import User

AUTHORITATIVE_ZERO = {
    "total_questions": 0,
    "total_exams": 0,
    "total_students": 0,
    "today_review_count": 0,
    "recent_exams": [],
    "knowledge_distribution": [],
}


def _make_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            Student.__table__,
            Question.__table__,
            Exam.__table__,
            MistakeRecord.__table__,
        ],
    )
    return sessionmaker(bind=engine)()


class _ExplodingQuerySession:
    """query() 一律确定性抛错的 Session 代理：驱动 DASHBOARD-STATS-FAIL-01。"""

    def __init__(self, real_session):
        self._real = real_session

    def query(self, *args, **kwargs):
        raise RuntimeError("deterministic dashboard query failure")

    def __getattr__(self, name):
        return getattr(self._real, name)


@pytest.fixture
def dashboard_world():
    """仅含两名教师：保证 ZERO 用例跑在真实空库上；学生由用例按需创建。"""
    db = _make_db()
    teacher = User(username="teacher-a", hashed_password="x", role="teacher")
    teacher_b = User(username="teacher-b", hashed_password="x", role="teacher")
    db.add_all([teacher, teacher_b])
    db.commit()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: teacher
    bundle = {
        "db": db,
        "teacher": teacher,
        "teacher_b": teacher_b,
        "client": TestClient(app),
    }
    yield bundle
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)


def _student(world):
    row = Student(user_id=world["teacher"].id, name="学生A", grade="高一", class_name="1班")
    world["db"].add(row)
    world["db"].commit()
    world["db"].refresh(row)
    return row.id


def _exam(world, *, owner, student, graded_at=None, title="试卷"):
    row = Exam(
        owner_user_id=owner,
        title=title,
        student_id=student,
        graded_at=graded_at,
        grade_summary={"correct": 18, "total": 20} if graded_at else None,
    )
    world["db"].add(row)
    world["db"].commit()
    world["db"].refresh(row)
    return row


def test_dashboard_stats_zero_01_empty_database_returns_authoritative_zero(dashboard_world):
    """DASHBOARD-STATS-ZERO-01：真实空库 = HTTP 200 + 全零/空列表。"""
    response = dashboard_world["client"].get("/api/dashboard/stats")
    assert response.status_code == 200
    assert response.json() == AUTHORITATIVE_ZERO


def test_dashboard_stats_fail_01_internal_failure_is_fail_closed(dashboard_world):
    """DASHBOARD-STATS-FAIL-01：内部查询失败必须 non-2xx，且绝不返回全零 payload。"""
    # 预置真实数据：故障绝不允许被折叠成"看起来像空库"的 200。
    student_id = _student(dashboard_world)
    _exam(
        dashboard_world,
        owner=dashboard_world["teacher"].id,
        student=student_id,
        title="已布置未批改试卷",
    )

    db = dashboard_world["db"]
    app.dependency_overrides[get_db] = lambda: _ExplodingQuerySession(db)

    response = dashboard_world["client"].get("/api/dashboard/stats")

    assert response.status_code >= 500
    body = response.json()
    assert body != AUTHORITATIVE_ZERO
    assert "total_questions" not in body
    # 稳定机器码 + 不泄露原始异常 / SQL / 数据细节
    assert body["detail"].startswith("DASHBOARD_STATS_FAILED")
    assert "deterministic dashboard query failure" not in response.text
    assert "RuntimeError" not in response.text
    assert "已布置未批改试卷" not in response.text


def test_dashboard_recent_exam_01_assigned_ungraded_keeps_student_id(dashboard_world):
    """DASHBOARD-RECENT-EXAM-01：student_id 非空 + graded_at 空 → 两事实字段原样返回。"""
    student_id = _student(dashboard_world)
    exam = _exam(
        dashboard_world,
        owner=dashboard_world["teacher"].id,
        student=student_id,
        graded_at=None,
        title="已布置未批改试卷",
    )
    _exam(
        dashboard_world,
        owner=dashboard_world["teacher_b"].id,
        student=None,
        title="他人试卷不可见",
    )

    response = dashboard_world["client"].get("/api/dashboard/stats")
    assert response.status_code == 200
    rows = {row["id"]: row for row in response.json()["recent_exams"]}
    assert exam.id in rows
    # owner_user_id 仍是租户归属 authority：join Student 不得破坏试卷隔离
    assert dashboard_world["teacher_b"] and all(
        row["title"] != "他人试卷不可见" for row in rows.values()
    )
    assert rows[exam.id]["student_id"] == student_id
    assert rows[exam.id]["graded_at"] is None


def test_dashboard_recent_exam_02_unassigned_archive_has_null_authorities(dashboard_world):
    """DASHBOARD-RECENT-EXAM-02：student_id 与 graded_at 皆空 → 均为 null。"""
    exam = _exam(
        dashboard_world,
        owner=dashboard_world["teacher"].id,
        student=None,
        graded_at=None,
        title="未布置归档试卷",
    )

    response = dashboard_world["client"].get("/api/dashboard/stats")
    assert response.status_code == 200
    rows = {row["id"]: row for row in response.json()["recent_exams"]}
    assert rows[exam.id]["student_id"] is None
    assert rows[exam.id]["graded_at"] is None


def test_dashboard_recent_exam_03_graded_exam_keeps_both_authorities(dashboard_world):
    """DASHBOARD-RECENT-EXAM-03：已批改试卷必须同时保留 student_id 与 graded_at。"""
    student_id = _student(dashboard_world)
    graded_at = datetime(2026, 10, 5, 12, 0, 0)
    exam = _exam(
        dashboard_world,
        owner=dashboard_world["teacher"].id,
        student=student_id,
        graded_at=graded_at,
        title="已批改试卷",
    )

    response = dashboard_world["client"].get("/api/dashboard/stats")
    assert response.status_code == 200
    rows = {row["id"]: row for row in response.json()["recent_exams"]}
    assert rows[exam.id]["student_id"] == student_id
    assert rows[exam.id]["graded_at"] is not None
