"""
仪表盘统计接口：首页数据汇总。owner_user_id 是租户归属事实来源：
仅统计本人创建的题目/试卷；student_id 仅表示布置/业务上下文。
"""
from datetime import date, datetime
import logging

from fastapi import APIRouter, Depends, HTTPException
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

logger = logging.getLogger(__name__)
router = APIRouter()


class RecentExamItem(BaseModel):
    """最近试卷项

    student_id / graded_at 是 Dashboard 判定试卷状态的事实 authority
    （graded_at 非空=已批改；仅 student_id=已布置待批改；两者皆空=未布置归档）。
    student_name 仅为展示字段，不得用于推断布置状态。
    grade_summary 仅为向后兼容保留，NOT canonical grading authority：
    逐题批改权威仍是 grade_results，禁止用 correct/total 判定批改事实。
    """

    id: int
    title: str
    created_at: datetime
    student_name: str | None = None
    student_id: int | None = None
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


def _question_visible_filter(Question_model, current_user: User):
    """题目统计条件：仅本人创建；未认领（owner 为空）与他人题目一律不计入。"""
    return Question_model.owner_user_id == current_user.id


def _exam_visible_filter(Exam_model, current_user: User):
    """试卷统计条件：仅本人创建；未认领（owner 为空）与他人试卷一律不计入。"""
    return Exam_model.owner_user_id == current_user.id


@router.get("/stats", response_model=DashboardStatsResponse)
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardStatsResponse:
    """
    获取仪表盘统计数据：总题数、试卷数、学生数、最近试卷、知识点分布 Top 5。
    仅统计本人创建的数据，空表时返回 0 与空列表（AUTHORITATIVE ZERO）。
    内部查询失败时 fail-closed：返回 500 + DASHBOARD_STATS_FAILED，
    绝不降级为全零 200（避免把真实空数据与故障折叠成同一 contract）。
    """
    try:
        q_filter = _question_visible_filter(Question, current_user)
        total_questions = db.query(func.count(Question.id)).filter(q_filter).scalar() or 0

        e_filter = _exam_visible_filter(Exam, current_user)
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
            db.query(
                Exam.id,
                Exam.title,
                Exam.created_at,
                Exam.student_id,
                Student.name,
                Exam.graded_at,
                Exam.grade_summary,
            )
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
                # student_id 来自 Exam 行本身，是布置事实 authority；
                # 不通过 Student.name 反推是否已布置。
                student_id=r.student_id,
                graded_at=r.graded_at,
                grade_summary=r.grade_summary,
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
    except HTTPException:
        raise
    except Exception as e:
        # fail-closed：内部故障必须 non-2xx；只记录异常类名，不泄露
        # SQL / 数据库错误 / 学生姓名 / 试卷标题 / 原始异常文本。
        logger.error("dashboard_stats_failed error_type=%s", type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail="DASHBOARD_STATS_FAILED: 工作台统计数据加载失败，请稍后重试。",
        ) from None
