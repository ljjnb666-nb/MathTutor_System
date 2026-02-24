"""
题库管理接口 - CRUD、批量保存。按当前登录用户隔离：仅可操作本用户学生相关题目及公共题。
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.models.base import get_db
from app.models.question import Question
from app.models.student import Student
from app.models.user import User
from app.schemas.question_dto import QuestionBatchCreate, QuestionCreate, QuestionRead

router = APIRouter()


def _my_student_ids(db: Session, user: User) -> list[int]:
    """当前用户名下的学生 ID 列表。"""
    rows = db.query(Student.id).filter(Student.user_id == user.id).all()
    return [r[0] for r in rows]


def _question_visible_filter(my_student_ids: list[int]):
    """题目可见条件：归属当前用户的学生或公共题。"""
    if not my_student_ids:
        return Question.student_id.is_(None)
    return or_(Question.student_id.in_(my_student_ids), Question.student_id.is_(None))


@router.get("/", response_model=list[QuestionRead])
def list_questions(
    knowledge_point: str | None = Query(None, description="按知识点筛选"),
    student_id: int | None = Query(None, description="学生 ID：传入则只返回该学生题目 + 公共题；不传则返回当前用户可见全部"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取题目列表。仅返回当前用户可见题目（本用户学生的题 + 公共题）；若传 student_id 则必须属于当前用户。"""
    my_ids = _my_student_ids(db, current_user)
    if student_id is not None:
        if student_id not in my_ids:
            raise HTTPException(status_code=404, detail="学生不存在")
        q = db.query(Question).filter(
            (Question.student_id == student_id) | (Question.student_id.is_(None))
        )
    else:
        q = db.query(Question).filter(_question_visible_filter(my_ids))
    if knowledge_point is not None and knowledge_point.strip():
        q = q.filter(Question.knowledge_point.ilike(f"%{knowledge_point.strip()}%"))
    return q.order_by(Question.created_at.desc()).all()


def _require_student_owned_if_set(db: Session, student_id: int | None, current_user: User) -> None:
    """若提供了 student_id，则必须属于当前用户。"""
    if student_id is None:
        return
    student = db.get(Student, student_id)
    if student is None or student.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="学生不存在")


@router.post("/", response_model=QuestionRead, status_code=201)
def create_question(
    body: QuestionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """保存单个题目。student_id 若提供则必须属于当前用户。"""
    _require_student_owned_if_set(db, body.student_id, current_user)
    row = Question(
        content=body.content,
        options=body.options,
        answer=body.answer,
        analysis=body.analysis,
        knowledge_point=body.knowledge_point,
        difficulty=body.difficulty,
        question_type=body.question_type,
        source=body.source,
        student_id=body.student_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.post("/batch", response_model=list[QuestionRead])
def batch_create_questions(
    body: QuestionBatchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """批量保存题目（如 AI 生成后一键保存）。每条 student_id 若提供则必须属于当前用户。"""
    my_ids = _my_student_ids(db, current_user)
    for item in body.questions:
        if item.student_id is not None and item.student_id not in my_ids:
            raise HTTPException(status_code=404, detail="学生不存在")
    created = []
    for item in body.questions:
        row = Question(
            content=item.content,
            options=item.options,
            answer=item.answer,
            analysis=item.analysis,
            knowledge_point=item.knowledge_point,
            difficulty=item.difficulty,
            question_type=item.question_type,
            source=item.source,
            student_id=item.student_id,
        )
        db.add(row)
        created.append(row)
    db.commit()
    for row in created:
        db.refresh(row)
    return created


@router.delete("/{question_id}", status_code=204)
def delete_question(
    question_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除题目。仅可删除当前用户可见的题目（本用户学生的题或公共题）。"""
    row = db.get(Question, question_id)
    if row is None:
        raise HTTPException(status_code=404, detail="题目不存在")
    my_ids = _my_student_ids(db, current_user)
    if row.student_id is not None and row.student_id not in my_ids:
        raise HTTPException(status_code=404, detail="题目不存在")
    db.delete(row)
    db.commit()
    return None
