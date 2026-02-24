"""
错题本 SQLAlchemy Model：Active Learning 错题记录。
字段：topic、source、content、solution、status（pending/mastered）、review_count、next_review_date（复习计划）。
"""
from datetime import date, datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import relationship

from app.models.base import Base


class MistakeRecord(Base):
    __tablename__ = "mistake_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, index=True)
    topic = Column(String(255), nullable=False)  # e.g. "Function", "Geometry"
    source = Column(String(255), nullable=False)  # e.g. "Midterm Exam"
    content = Column(Text, nullable=False)  # 题目文本
    options = Column(JSON, nullable=True)  # 选择题选项列表，如 ["A. xxx", "B. xxx"]
    solution = Column(Text, nullable=True)  # 正确答案或关键步骤（可选）
    status = Column(String(32), nullable=False, default="pending")  # "pending" | "mastered"
    review_count = Column(Integer, nullable=False, default=0)
    next_review_date = Column(Date, nullable=True, index=True)  # 下次复习日，用于「今日待复习」
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    mastered_at = Column(DateTime, nullable=True)  # 标记为已掌握的时间，用于学情趋势统计

    student = relationship("Student", backref="mistake_records")
