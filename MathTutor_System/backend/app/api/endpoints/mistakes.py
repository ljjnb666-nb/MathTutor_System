"""
错题本接口：Active Learning 版 CRUD + review / master；支持复习计划与「今日待复习」。
"""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.models.base import get_db
from app.models.mistake import MistakeRecord
from app.models.student import Student
from app.models.user import User
from app.schemas.mistake_dto import MistakeCreate, MistakeResponse

router = APIRouter()

# 复习间隔：首次复习 1 天后，之后每次复习后延 3 天
REVIEW_INTERVAL_DAYS_FIRST = 1
REVIEW_INTERVAL_DAYS_NEXT = 3


def _require_own_student(row: Student | None, current_user: User) -> Student:
    """若学生不存在或不属于当前用户，则 404。"""
    if row is None:
        raise HTTPException(status_code=404, detail="学生不存在")
    if row.user_id is not None and row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="学生不存在")
    return row


def _require_own_mistake(record: MistakeRecord | None, current_user: User) -> MistakeRecord:
    """若错题不存在或不属于当前用户的学生，则 404。"""
    if record is None:
        raise HTTPException(status_code=404, detail="错题记录不存在")
    if record.student is None:
        raise HTTPException(status_code=404, detail="错题记录不存在")
    if record.student.user_id is not None and record.student.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="错题记录不存在")
    return record


@router.post("/", response_model=MistakeResponse, status_code=201)
def create_mistake(
    body: MistakeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MistakeRecord:
    """创建一条错题记录。学生必须属于当前用户。"""
    try:
        student = db.get(Student, body.student_id)
        _require_own_student(student, current_user)
        today = date.today()
        next_review = today + timedelta(days=REVIEW_INTERVAL_DAYS_FIRST)
        options = body.options if body.options is not None else None
        row = MistakeRecord(
            student_id=body.student_id,
            topic=body.topic.strip(),
            source=body.source.strip(),
            content=body.content.strip(),
            options=options,
            solution=body.solution.strip() if body.solution else None,
            status="pending",
            review_count=0,
            next_review_date=next_review,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row
    except HTTPException:
        raise
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"创建错题失败: {str(e)}")


@router.get("/", response_model=list[MistakeResponse])
def list_mistakes(
    student_id: int | None = Query(None, description="按学生 ID 筛选"),
    status: str | None = Query(None, description="按状态筛选：pending | mastered"),
    review_due: bool = Query(False, description="为 true 时仅返回「今日待复习」：pending 且 next_review_date<=今日"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[MistakeRecord]:
    """获取错题列表，支持按 student_id、status、review_due（今日待复习）筛选。仅返回当前用户名下学生的记录。"""
    try:
        q = db.query(MistakeRecord).join(Student).filter(Student.user_id == current_user.id)
        if student_id is not None:
            q = q.filter(MistakeRecord.student_id == student_id)
        if status is not None and status.strip().lower() in ("pending", "mastered"):
            q = q.filter(MistakeRecord.status == status.strip().lower())
        if review_due:
            today = date.today()
            q = q.filter(MistakeRecord.status == "pending").filter(
                or_(MistakeRecord.next_review_date <= today, MistakeRecord.next_review_date.is_(None))
            )
        rows = q.order_by(MistakeRecord.created_at.desc()).all()
        return rows
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"获取错题列表失败: {str(e)}")


@router.put("/{mistake_id}/review", response_model=MistakeResponse)
def increment_review(
    mistake_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MistakeRecord:
    """复习一次：review_count +1，并更新下次复习日为今日起 3 天后。"""
    try:
        row = db.query(MistakeRecord).filter(MistakeRecord.id == mistake_id).first()
        _require_own_mistake(row, current_user)
        row.review_count = (row.review_count or 0) + 1
        row.next_review_date = date.today() + timedelta(days=REVIEW_INTERVAL_DAYS_NEXT)
        db.commit()
        db.refresh(row)
        return row
    except HTTPException:
        raise
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"更新失败: {str(e)}")


@router.put("/{mistake_id}/master", response_model=MistakeResponse)
def mark_mastered(
    mistake_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MistakeRecord:
    """标记为已掌握：status = mastered，并记录 mastered_at（学情趋势用）。"""
    try:
        row = db.query(MistakeRecord).filter(MistakeRecord.id == mistake_id).first()
        _require_own_mistake(row, current_user)
        row.status = "mastered"
        if getattr(row, "mastered_at", None) is None:
            row.mastered_at = datetime.utcnow()
        db.commit()
        db.refresh(row)
        return row
    except HTTPException:
        raise
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"更新失败: {str(e)}")


@router.delete("/{mistake_id}", status_code=204)
def delete_mistake(
    mistake_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """删除一条错题记录。"""
    try:
        row = db.query(MistakeRecord).filter(MistakeRecord.id == mistake_id).first()
        _require_own_mistake(row, current_user)
        db.delete(row)
        db.commit()
    except HTTPException:
        raise
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"删除失败: {str(e)}")
