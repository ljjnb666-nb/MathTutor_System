"""
题目 SQLAlchemy Model
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.sqlite import JSON

from app.models.base import Base


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=True, index=True)
    content = Column(Text, nullable=False)
    options = Column(JSON, default=list, nullable=False)
    answer = Column(Text, nullable=False)
    analysis = Column(Text, default="", nullable=False)
    knowledge_point = Column(String(255), nullable=False)
    difficulty = Column(String(10), nullable=False)
    question_type = Column(String(64), nullable=False)
    source = Column(String(64), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
