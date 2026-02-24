"""
排课 SQLAlchemy Model：教师为学生安排的上课时间，按 user_id 隔离。
支持单次排课与每周重复（recurrence_type='weekly' + recurrence_weekdays）。
"""
from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import relationship

from app.models.base import Base


class Schedule(Base):
    __tablename__ = "schedules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, index=True)
    schedule_date = Column(Date, nullable=False)  # 单次：上课日期；重复：生效起始日期
    start_time = Column(String(8), nullable=False)  # 开始时间 "HH:MM"
    end_time = Column(String(8), nullable=False)  # 结束时间 "HH:MM"
    subject = Column(String(128), nullable=True)  # 主题/科目
    note = Column(String(512), nullable=True)  # 备注
    recurrence_type = Column(String(16), nullable=True)  # 'weekly' 表示每周重复，NULL 表示单次
    recurrence_weekdays = Column(JSON, nullable=True)  # [0,1,2,3,4,5,6] 周一=0 周日=6（与 Python weekday 一致）
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    owner = relationship("User", backref="schedules", foreign_keys=[user_id])
    student = relationship("Student", backref="schedules", foreign_keys=[student_id])
