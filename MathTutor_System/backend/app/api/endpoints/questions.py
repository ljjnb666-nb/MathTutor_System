"""
题库管理接口 - CRUD、批量保存。owner_user_id 是租户归属事实来源：
仅可操作本人创建的题目；student_id 仅表示布置/业务上下文。
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.models.base import get_db
from app.models.question import Question
from app.models.student import Student
from app.models.user import User
from app.schemas.question_dto import QuestionBatchCreate, QuestionCreate, QuestionRead

router = APIRouter()


@router.get("/", response_model=list[QuestionRead])
def list_questions(
    knowledge_point: str | None = Query(None, description="按知识点筛选"),
    student_id: int | None = Query(None, description="学生 ID：传入则只返回该学生题目 + 本人的通用题；不传则返回本人全部题目"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取题目列表。仅返回本人创建的题目；若传 student_id 则必须属于当前用户。"""
    if student_id is not None:
        student = db.get(Student, student_id)
        if student is None or student.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="学生不存在")
    q = db.query(Question).filter(Question.owner_user_id == current_user.id)
    if student_id is not None:
        q = q.filter((Question.student_id == student_id) | (Question.student_id.is_(None)))
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
        owner_user_id=current_user.id,
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
    for item in body.questions:
        if item.student_id is not None:
            student = db.get(Student, item.student_id)
            if student is None or student.user_id != current_user.id:
                raise HTTPException(status_code=404, detail="学生不存在")
    created = []
    for item in body.questions:
        row = Question(
            owner_user_id=current_user.id,
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
    """删除题目。仅可删除本人创建的题目；他人或未认领（owner 为空）的题目一律 404。"""
    row = db.get(Question, question_id)
    if row is None or row.owner_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="题目不存在")
    db.delete(row)
    db.commit()
    return None
