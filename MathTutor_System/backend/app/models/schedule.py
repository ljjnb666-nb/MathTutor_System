"""
Schedule model for single or weekly recurring lessons.
"""
from sqlalchemy import Column, Date, ForeignKey, Integer, String
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import relationship

from app.models.base import Base, created_at_column, pk_column


class Schedule(Base):
    __tablename__ = "schedules"

    id = pk_column()
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, index=True)
    schedule_date = Column(Date, nullable=False)
    start_time = Column(String(8), nullable=False)
    end_time = Column(String(8), nullable=False)
    subject = Column(String(128), nullable=True)
    note = Column(String(512), nullable=True)
    recurrence_type = Column(String(16), nullable=True)
    recurrence_weekdays = Column(JSON, nullable=True)
    created_at = created_at_column()

    owner = relationship("User", backref="schedules", foreign_keys=[user_id])
    student = relationship("Student", backref="schedules", foreign_keys=[student_id])
