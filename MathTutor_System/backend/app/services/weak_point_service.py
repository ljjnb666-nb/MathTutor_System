from sqlalchemy.orm import Session

from app.models.mistake import MistakeRecord
from app.models.student import Student
from app.services.topic_service import split_topics


def get_weak_points_for_student(db: Session, student_id: int, user_id: int) -> list[str]:
    student = db.get(Student, student_id)
    if student is None or student.user_id != user_id:
        return []

    mistakes = (
        db.query(MistakeRecord)
        .filter(
            MistakeRecord.student_id == student_id,
            MistakeRecord.status == "pending",
        )
        .all()
    )
    weak: set[str] = set()
    for mistake in mistakes:
        weak |= split_topics(mistake.topic)
    return sorted(weak)
