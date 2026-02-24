"""
试卷 SQLAlchemy Model：保存生成的整套试卷快照。

questions 字段（JSON）支持两种存储模式，无需改表结构：
- Mode A (传统试卷): List — [ Question1, Question2, ... ]
- Mode B (辅导讲义): Dict — { "knowledge_card": {...}, "examples": [...], "questions": [...] }

学生提交批改后：graded_at 记录提交时间，grade_summary 记录 { "correct", "total" } 便于教师端查看做题情况。
"""
from datetime import date, datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.sqlite import JSON

from app.models.base import Base


class Exam(Base):
    __tablename__ = "exams"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(256), nullable=False)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=True, index=True)
    questions = Column(JSON, default=list, nullable=False)  # Mode A: list; Mode B: dict with knowledge_card, examples, questions
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    assignment_date = Column(Date, nullable=True, index=True)  # 作业日期；student_id 空时为当日作业草稿
    # 学生端做题提交后由批改接口写入，供教师端按题目查看做题情况
    graded_at = Column(DateTime, nullable=True)
    grade_summary = Column(JSON, nullable=True)  # {"correct": int, "total": int}
    grade_results = Column(JSON, nullable=True)  # [{"question_index": int, "is_correct": bool}, ...] 每道题对错
