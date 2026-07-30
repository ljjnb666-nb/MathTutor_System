"""
Generated question snapshot model.
"""
from sqlalchemy import Column, ForeignKey, Integer, String, Text

from app.models.base import Base, created_at_column, json_list_column, pk_column


class Question(Base):
    __tablename__ = "questions"

    id = pk_column()
    student_id = Column(Integer, ForeignKey("students.id"), nullable=True, index=True)
    content = Column(Text, nullable=False)
    options = json_list_column()
    answer = Column(Text, nullable=False)
    analysis = Column(Text, default="", nullable=False)
    knowledge_point = Column(String(255), nullable=False)
    difficulty = Column(String(10), nullable=False)
    question_type = Column(String(64), nullable=False)
    source = Column(String(64), nullable=False)
    created_at = created_at_column()
