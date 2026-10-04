from datetime import datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.endpoints.reports import _parse_learning_report_payload, _strip_json_markdown
from app.models.base import Base
from app.models.exam import Exam
from app.models.mistake import MistakeRecord
from app.models.student import Student
from app.models.user import User
from app.services.report_pdf_service import build_student_report_pdf_buffer
from app.services.report_snapshot_service import build_student_report_snapshot


def make_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(
        engine,
        tables=[User.__table__, Student.__table__, Exam.__table__, MistakeRecord.__table__],
    )
    SessionLocal = sessionmaker(bind=engine)
    return SessionLocal()


def test_strip_json_markdown_and_parse_learning_report_payload():
    raw = """```json
{"mastered":["一次函数"],"weak_points":[{"point":"几何","description":"辅助线"},"方程"],"estimated_hours":"6"}
```"""

    parsed = _parse_learning_report_payload(raw)

    assert _strip_json_markdown(raw).startswith("{")
    assert parsed.mastered == ["一次函数"]
    assert [item.point for item in parsed.weak_points] == ["几何", "方程"]
    assert parsed.weak_points[0].description == "辅助线"
    assert parsed.estimated_hours == 6


def test_report_pdf_buffer_is_pure_snapshot_projection():
    """PDF 入口只接受 StudentReportSnapshot；%PDF 产物可正常生成。"""
    db = make_db()
    student = Student(id=1, user_id=10, name="Alice", grade="八年级", class_name="1班")
    db.add(student)
    db.add(
        Exam(
            owner_user_id=10,
            student_id=1,
            title="期中卷",
            questions=[{"content": "q1"}, {"content": "q2"}],
            created_at=datetime(2026, 10, 1, 8, 0, 0),
            graded_at=datetime(2026, 10, 2, 8, 0, 0),
            grade_results=[
                {"question_index": 0, "is_correct": True},
                {"question_index": 1, "is_correct": False},
            ],
        )
    )
    db.add(MistakeRecord(student_id=1, topic="几何", source="试卷批改", content="q2", status="pending"))
    db.commit()

    snapshot = build_student_report_snapshot(db, student, "all_time")
    assert snapshot.grading_metrics.answered_question_count == 2

    buffer = build_student_report_pdf_buffer(snapshot)
    assert buffer.getvalue().startswith(b"%PDF")


def test_report_pdf_buffer_zero_data_snapshot_still_renders():
    db = make_db()
    student = Student(id=1, user_id=10, name="Alice", grade="八年级", class_name="1班")
    db.add(student)
    db.commit()

    snapshot = build_student_report_snapshot(db, student, "all_time")
    assert snapshot.grading_metrics.accuracy is None

    buffer = build_student_report_pdf_buffer(snapshot)
    assert buffer.getvalue().startswith(b"%PDF")
