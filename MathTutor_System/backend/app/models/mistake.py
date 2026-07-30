"""
Active-learning mistake record model.
"""
from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import relationship

from app.models.base import Base, created_at_column, pk_column


class MistakeRecord(Base):
    __tablename__ = "mistake_records"

    id = pk_column()
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, index=True)
    topic = Column(String(255), nullable=False)
    source = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    options = Column(JSON, nullable=True)
    solution = Column(Text, nullable=True)
    status = Column(String(32), nullable=False, default="pending")
    review_count = Column(Integer, nullable=False, default=0)
    next_review_date = Column(Date, nullable=True, index=True)
    created_at = created_at_column()
    mastered_at = Column(DateTime, nullable=True)

    student = relationship("Student", backref="mistake_records")
