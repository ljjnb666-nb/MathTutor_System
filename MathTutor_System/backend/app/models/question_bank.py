"""
Question bank item model for shared or student-scoped content.
"""
from sqlalchemy import Column, ForeignKey, Integer, String, Text

from app.models.base import Base, created_at_column, json_list_column, pk_column


class QuestionBank(Base):
    __tablename__ = "question_bank"

    id = pk_column()
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=True, index=True)
    content = Column(Text, nullable=False)
    options = json_list_column()
    answer = Column(Text, nullable=False)
    analysis = Column(Text, default="", nullable=False)
    question_type = Column(String(64), nullable=False)
    difficulty = Column(String(16), nullable=False)
    knowledge_point = Column(String(255), nullable=False, index=True)
    source = Column(String(64), nullable=False)
    tags = json_list_column()
    images = json_list_column()
    content_hash = Column(String(64), nullable=False, index=True)
    created_at = created_at_column()
