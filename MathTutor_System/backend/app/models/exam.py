"""
Exam snapshot model.

`questions` supports two persisted shapes:
- list for classic exam snapshots
- dict for guidance bundles with `knowledge_card`, `examples`, and `questions`
"""
from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.sqlite import JSON

from app.models.base import Base, created_at_column, json_list_column, pk_column


class Exam(Base):
    __tablename__ = "exams"

    id = pk_column()
    # 约束名与 b7e2c94f6a15 迁移一致：fresh 建库 stamp head 后 downgrade 才能按名删该 FK。
    owner_user_id = Column(
        Integer,
        ForeignKey("users.id", name="fk_exams_owner_user_id_users"),
        nullable=True,
        index=True,
    )
    title = Column(String(256), nullable=False)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=True, index=True)
    questions = json_list_column()
    created_at = created_at_column()
    assignment_date = Column(Date, nullable=True, index=True)
    graded_at = Column(DateTime, nullable=True)
    grade_summary = Column(JSON, nullable=True)
    grade_results = Column(JSON, nullable=True)
