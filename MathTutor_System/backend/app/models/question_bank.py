"""
题库收藏 SQLAlchemy Model：保存 AI 生成或错题录入的题目，支持通用题库（student_id 为空）或私有题库。
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.sqlite import JSON

from app.models.base import Base


class QuestionBank(Base):
    __tablename__ = "question_bank"

    id = Column(Integer, primary_key=True, autoincrement=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=True, index=True)
    content = Column(Text, nullable=False)
    options = Column(JSON, default=list, nullable=False)
    answer = Column(Text, nullable=False)
    analysis = Column(Text, default="", nullable=False)
    question_type = Column(String(64), nullable=False)
    difficulty = Column(String(16), nullable=False)
    knowledge_point = Column(String(255), nullable=False, index=True)
    source = Column(String(64), nullable=False)
    tags = Column(JSON, default=list, nullable=False)
    images = Column(JSON, default=list, nullable=False)  # 题目附图 data URL 列表（如 Word 导入按题裁剪的参考图）
    content_hash = Column(String(64), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
