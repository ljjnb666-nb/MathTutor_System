"""
仪表盘统计接口：首页数据汇总。按当前登录用户隔离（仅统计该用户名下学生相关数据 + 公共数据）。
"""
from datetime import date, datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.models.base import get_db
from app.models.exam import Exam
from app.models.mistake import MistakeRecord
from app.models.question import Question
from app.models.student import Student
from app.models.user import User

router = APIRouter()


def _my_student_ids(db: Session, user: User) -> list[int]:
    """当前用户名下的学生 ID 列表，用于数据隔离。"""
    rows = db.query(Student.id).filter(Student.user_id == user.id).all()
    return [r[0] for r in rows]


class RecentExamItem(BaseModel):
    """最近试卷项"""

    id: int
    title: str
    created_at: datetime
    student_name: str | None = None
    graded_at: datetime | None = None
    grade_summary: dict | None = None


class KnowledgeItem(BaseModel):
    """知识点分布项"""

    tag: str = Field(..., description="知识点名称")
    count: int = Field(..., description="题目数量")


class DashboardStatsResponse(BaseModel):
    """仪表盘统计响应"""

    total_questions: int = Field(..., description="题库总题数")
    total_exams: int = Field(..., description="已生成的试卷总数")
    total_students: int = Field(..., description="学生总数")
    today_review_count: int = Field(..., description="今日待复习错题数（pending 且 next_review_date<=今日）")
    recent_exams: list[RecentExamItem] = Field(default_factory=list, description="最近 5 套试卷")
    knowledge_distribution: list[KnowledgeItem] = Field(
        default_factory=list, description="题库各知识点题目数量 Top 5"
    )


def _question_visible_filter(Question_model, my_student_ids: list[int]):
    """题目可见条件：归属当前用户的学生或公共题（student_id 为空）。"""
    if not my_student_ids:
        return Question_model.student_id.is_(None)
    return or_(Question_model.student_id.in_(my_student_ids), Question_model.student_id.is_(None))


def _exam_visible_filter(Exam_model, my_student_ids: list[int]):
    """试卷可见条件：归属当前用户的学生或未关联学生。"""
    if not my_student_ids:
        return Exam_model.student_id.is_(None)
    return or_(Exam_model.student_id.in_(my_student_ids), Exam_model.student_id.is_(None))


@router.get("/stats", response_model=DashboardStatsResponse)
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardStatsResponse:
    """
    获取仪表盘统计数据：总题数、试卷数、学生数、最近试卷、知识点分布 Top 5。
    仅统计当前用户名下学生相关数据及公共数据，空表时返回 0 与空列表。
    """
    try:
        my_ids = _my_student_ids(db, current_user)

        q_filter = _question_visible_filter(Question, my_ids)
        total_questions = db.query(func.count(Question.id)).filter(q_filter).scalar() or 0

        e_filter = _exam_visible_filter(Exam, my_ids)
        total_exams = db.query(func.count(Exam.id)).filter(e_filter).scalar() or 0

        total_students = db.query(func.count(Student.id)).filter(Student.user_id == current_user.id).scalar() or 0

        today = date.today()
        today_review_count = (
            db.query(func.count(MistakeRecord.id))
            .join(Student, MistakeRecord.student_id == Student.id)
            .filter(Student.user_id == current_user.id)
            .filter(MistakeRecord.status == "pending")
            .filter(or_(MistakeRecord.next_review_date <= today, MistakeRecord.next_review_date.is_(None)))
            .scalar()
            or 0
        )

        recent_rows = (
            db.query(Exam.id, Exam.title, Exam.created_at, Student.name, Exam.graded_at, Exam.grade_summary)
            .outerjoin(Student, Exam.student_id == Student.id)
            .filter(e_filter)
            .order_by(Exam.created_at.desc())
            .limit(5)
            .all()
        )
        recent_exams = [
            RecentExamItem(
                id=r.id,
                title=r.title,
                created_at=r.created_at,
                student_name=r.name,
                graded_at=getattr(r, "graded_at", None),
                grade_summary=getattr(r, "grade_summary", None),
            )
            for r in recent_rows
        ]

        knowledge_rows = (
            db.query(Question.knowledge_point, func.count(Question.id).label("cnt"))
            .filter(q_filter)
            .group_by(Question.knowledge_point)
            .order_by(func.count(Question.id).desc())
            .limit(5)
            .all()
        )
        knowledge_distribution = [
            KnowledgeItem(tag=row.knowledge_point or "", count=row.cnt) for row in knowledge_rows
        ]

        return DashboardStatsResponse(
            total_questions=int(total_questions),
            total_exams=int(total_exams),
            total_students=int(total_students),
            today_review_count=int(today_review_count),
            recent_exams=recent_exams,
            knowledge_distribution=knowledge_distribution,
        )
    except Exception:
        import traceback

        traceback.print_exc()
        return DashboardStatsResponse(
            total_questions=0,
            total_exams=0,
            total_students=0,
            today_review_count=0,
            recent_exams=[],
            knowledge_distribution=[],
        )
