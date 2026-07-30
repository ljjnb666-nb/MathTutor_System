from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.endpoints.reports import _parse_learning_report_payload, _strip_json_markdown
from app.models.base import Base
from app.models.mistake import MistakeRecord
from app.models.student import Student
from app.models.user import User
from app.services.report_pdf_service import build_student_report_pdf_buffer, count_student_mistakes


def make_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(
        engine,
        tables=[User.__table__, Student.__table__, MistakeRecord.__table__],
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


def test_report_pdf_buffer_uses_student_mistake_counts():
    db = make_db()
    student = Student(id=1, user_id=10, name="Alice", grade="8", class_name="1")
    db.add(student)
    db.add_all(
        [
            MistakeRecord(student_id=1, topic="几何", source="exam", content="q1", status="pending"),
            MistakeRecord(student_id=1, topic="函数", source="quiz", content="q2", status="mastered"),
        ]
    )
    db.commit()

    assert count_student_mistakes(db, student.id) == (2, 1)

    buffer = build_student_report_pdf_buffer(db, student)
    assert buffer.getvalue().startswith(b"%PDF")
