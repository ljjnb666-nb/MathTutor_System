"""
学情分析接口：知识点掌握情况（弱项/已掌握）、多学生总览、学情趋势。按当前用户隔离。
"""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.models.base import get_db
from app.models.mistake import MistakeRecord
from app.models.student import Student
from app.models.user import User

router = APIRouter()


def _normalize_topic(s: str) -> str:
    """去除首尾空白，将全角空格替换为半角。"""
    if not s or not isinstance(s, str):
        return ""
    s = s.strip().replace("\u3000", " ").replace("\uff0c", ",")
    return " ".join(s.split())  # 合并连续空白


def _split_topics(topic_str: str | None) -> set[str]:
    """将可能为组合知识点的字符串拆分为集合。支持分隔符：+、＋、、。每段去空并规范化。"""
    if not topic_str or not str(topic_str).strip():
        return set()
    raw = str(topic_str).strip()
    out: set[str] = set()
    # 统一用 + 分割：先替换全角顿号、加号为 +
    for sep in ["＋", "、", "+"]:
        raw = raw.replace(sep, "+")
    for part in raw.split("+"):
        t = _normalize_topic(part)
        if t:
            out.add(t)
    return out


@router.get("/mastery/{student_id}")
async def get_student_mastery(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    获取指定学生的知识点掌握情况。
    weak_points：status=pending 错题对应的 topic（需加强）；
    mastered_points：status=mastered 错题对应的 topic（已掌握）。
    仅可查询当前用户名下的学生。
    """
    try:
        student = db.get(Student, student_id)
        if student is None or (student.user_id is not None and student.user_id != current_user.id):
            raise HTTPException(status_code=404, detail="学生不存在")

        pending_mistakes = (
            db.query(MistakeRecord)
            .filter(
                MistakeRecord.student_id == student_id,
                MistakeRecord.status == "pending",
            )
            .all()
        )
        mastered_mistakes = (
            db.query(MistakeRecord)
            .filter(
                MistakeRecord.student_id == student_id,
                MistakeRecord.status == "mastered",
            )
            .all()
        )

        weak_points: set[str] = set()
        for m in pending_mistakes:
            weak_points |= _split_topics(m.topic)
        mastered_points: set[str] = set()
        for m in mastered_mistakes:
            mastered_points |= _split_topics(m.topic)
        # 若某知识点既在弱项又在已掌握（数据可能不同步），以弱项为准，从已掌握中剔除
        mastered_points -= weak_points

        return {
            "weak_points": sorted(weak_points),
            "mastered_points": sorted(mastered_points),
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback

        traceback.print_exc()
        detail = str(e).strip() or "获取学情分析失败"
        raise HTTPException(status_code=500, detail=f"获取学情分析失败: {detail}")


@router.get("/students-overview")
async def get_students_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    多学生总览：返回当前用户下每个学生的简要学情（待攻克错题数、今日待复习数、弱项数）。
    供前端「多学生总览」页展示卡片。
    """
    try:
        students = (
            db.query(Student)
            .filter(Student.user_id == current_user.id)
            .order_by(Student.name)
            .all()
        )
        today = date.today()
        out = []
        for s in students:
            pending_count = (
                db.query(func.count(MistakeRecord.id))
                .filter(MistakeRecord.student_id == s.id, MistakeRecord.status == "pending")
                .scalar()
                or 0
            )
            today_review_count = (
                db.query(func.count(MistakeRecord.id))
                .filter(
                    MistakeRecord.student_id == s.id,
                    MistakeRecord.status == "pending",
                    or_(
                        MistakeRecord.next_review_date <= today,
                        MistakeRecord.next_review_date.is_(None),
                    ),
                )
                .scalar()
                or 0
            )
            weak_set: set[str] = set()
            for m in (
                db.query(MistakeRecord)
                .filter(
                    MistakeRecord.student_id == s.id,
                    MistakeRecord.status == "pending",
                )
                .all()
            ):
                weak_set |= _split_topics(m.topic)
            out.append({
                "student_id": s.id,
                "student_name": (s.name or "").strip() or f"学生{s.id}",
                "pending_mistake_count": pending_count,
                "today_review_count": today_review_count,
                "weak_point_count": len(weak_set),
            })
        return {"students": out}
    except HTTPException:
        raise
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail="获取学生总览失败")


def _week_start(d: date) -> date:
    """返回 d 所在周的周一（ISO 周一为一周开始）。"""
    # weekday(): Monday=0, Sunday=6
    return d - timedelta(days=d.weekday())


@router.get("/trend/{student_id}")
async def get_student_trend(
    student_id: int,
    weeks: int = Query(8, ge=1, le=26, description="统计最近几周"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    学情趋势：按周统计该学生「新增错题数」与「新掌握数」。
    新增错题：该周内 created_at 的错题数；新掌握：该周内 mastered_at 的错题数。
    仅可查询当前用户名下的学生。
    """
    try:
        student = db.get(Student, student_id)
        if student is None or (student.user_id is not None and student.user_id != current_user.id):
            raise HTTPException(status_code=404, detail="学生不存在")

        today = date.today()
        # 最近 N 周的周一（含本周）
        week_starts = [_week_start(today) - timedelta(weeks=i) for i in range(weeks)]
        week_starts.reverse()  # 从旧到新

        out = []
        for ws in week_starts:
            week_end = ws + timedelta(days=7)
            ws_dt = datetime.combine(ws, datetime.min.time())
            we_dt = datetime.combine(week_end, datetime.min.time())

            new_mistakes = (
                db.query(func.count(MistakeRecord.id))
                .filter(
                    MistakeRecord.student_id == student_id,
                    MistakeRecord.created_at >= ws_dt,
                    MistakeRecord.created_at < we_dt,
                )
                .scalar()
                or 0
            )
            new_mastered = (
                db.query(func.count(MistakeRecord.id))
                .filter(
                    MistakeRecord.student_id == student_id,
                    MistakeRecord.mastered_at.isnot(None),
                    MistakeRecord.mastered_at >= ws_dt,
                    MistakeRecord.mastered_at < we_dt,
                )
                .scalar()
                or 0
            )
            out.append({
                "week_start": ws.isoformat(),
                "label": f"{ws.month}/{ws.day}",
                "new_mistakes": new_mistakes,
                "new_mastered": new_mastered,
            })
        return {"weeks": out}
    except HTTPException:
        raise
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail="获取学情趋势失败")
