"""
题库收藏接口：收藏题目、列表（筛选）、移出。按当前登录用户隔离：仅可操作本用户学生相关及公共题库。
"""
import hashlib
import json
import logging
import traceback

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.models.base import get_db
from app.models.question_bank import QuestionBank
from app.models.student import Student
from app.models.user import User
from app.schemas.question_bank_dto import BankCollectRequest, BankCollectResponse, BankItemRead
from app.services.question_bank_service import item_from_collect_request, save_questions_to_bank

logger = logging.getLogger(__name__)

router = APIRouter()


def _my_student_ids(db: Session, user: User) -> list[int]:
    """当前用户名下的学生 ID 列表。"""
    rows = db.query(Student.id).filter(Student.user_id == user.id).all()
    return [r[0] for r in rows]


def _bank_visible_filter(my_student_ids: list[int]):
    """题库可见条件：归属当前用户的学生或公共题库。"""
    if not my_student_ids:
        return QuestionBank.student_id.is_(None)
    return or_(QuestionBank.student_id.in_(my_student_ids), QuestionBank.student_id.is_(None))


def _normalize_images(raw: object) -> list:
    """确保 images 为 list[str]：ORM 可能返回 list 或 SQLite 存成的 str。"""
    if isinstance(raw, list):
        return [x for x in raw if isinstance(x, str)]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return _normalize_images(parsed)
        except (TypeError, ValueError):
            return []
    return []


def _content_hash(content: str, answer: str) -> str:
    """简单查重：对题干+答案做归一化后取 SHA256，避免重复收藏。"""
    normalized = (content or "").strip().replace("\r\n", "\n").replace("\r", "\n")
    normalized += "|" + (answer or "").strip()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


@router.post("/collect", response_model=BankCollectResponse, status_code=201)
def collect_question(
    body: BankCollectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    将题目存入题库（来自 Gen 或 Mistake）。
    查重：按 content_hash 判断，若已存在则返回已存在记录且 created=False，否则新建且 created=True。
    student_id 若提供则必须属于当前用户。
    """
    if body.student_id is not None:
        student = db.get(Student, body.student_id)
        if student is None or student.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="学生不存在")
    try:
        ch = _content_hash(body.content, body.answer)
        existing = (
            db.query(QuestionBank)
            .filter(
                QuestionBank.content_hash == ch,
                (QuestionBank.student_id == body.student_id) if body.student_id is not None else QuestionBank.student_id.is_(None),
            )
            .first()
        )
        if existing is not None:
            item = BankItemRead(
                id=existing.id,
                student_id=existing.student_id,
                content=existing.content,
                options=existing.options if isinstance(existing.options, list) else [],
                answer=existing.answer,
                analysis=existing.analysis or "",
                question_type=existing.question_type,
                difficulty=existing.difficulty,
                knowledge_point=existing.knowledge_point,
                source=existing.source,
                tags=existing.tags if isinstance(existing.tags, list) else [],
                images=_normalize_images(getattr(existing, "images", None)),
                created_at=existing.created_at,
            )
            return BankCollectResponse(data=item, created=False)

        row = save_questions_to_bank(db, current_user, [item_from_collect_request(body)], dedupe=False)[0]
        db.commit()
        db.refresh(row)
        item = BankItemRead(
            id=row.id,
            student_id=row.student_id,
            content=row.content,
            options=row.options if isinstance(row.options, list) else [],
            answer=row.answer,
            analysis=row.analysis or "",
            question_type=row.question_type,
            difficulty=row.difficulty,
            knowledge_point=row.knowledge_point,
            source=row.source,
            tags=row.tags if isinstance(row.tags, list) else [],
            images=_normalize_images(getattr(row, "images", None)),
            created_at=row.created_at,
        )
        return BankCollectResponse(data=item, created=True)
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"收藏题目失败: {str(e)}")


@router.get("/", response_model=list[BankItemRead])
def list_bank(
    knowledge_point: str | None = Query(None, description="知识点模糊搜索"),
    question_type: str | None = Query(None, description="题型筛选：选择/填空/解答 等"),
    student_id: int | None = Query(None, description="学生 ID：传入则只返回该学生私有 + 通用题库；不传则返回当前用户可见全部"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取题库列表，仅返回当前用户可见题目（本用户学生的题 + 公共题库）；若传 student_id 则必须属于当前用户。"""
    my_ids = _my_student_ids(db, current_user)
    q = db.query(QuestionBank).filter(_bank_visible_filter(my_ids))
    if student_id is not None:
        if student_id not in my_ids:
            raise HTTPException(status_code=404, detail="学生不存在")
        q = q.filter((QuestionBank.student_id == student_id) | (QuestionBank.student_id.is_(None)))
    if knowledge_point is not None and knowledge_point.strip():
        q = q.filter(QuestionBank.knowledge_point.ilike(f"%{knowledge_point.strip()}%"))
    if question_type is not None and question_type.strip():
        q = q.filter(QuestionBank.question_type == question_type.strip())
    rows = q.order_by(QuestionBank.created_at.desc()).all()
    return [
        BankItemRead(
            id=r.id,
            student_id=r.student_id,
            content=r.content,
            options=r.options if isinstance(r.options, list) else [],
            answer=r.answer,
            analysis=r.analysis or "",
            question_type=r.question_type,
            difficulty=r.difficulty,
            knowledge_point=r.knowledge_point,
            source=r.source,
            tags=r.tags if isinstance(r.tags, list) else [],
            images=_normalize_images(getattr(r, "images", None)),
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.delete("/{bank_id}", status_code=204)
def delete_from_bank(
    bank_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """从题库移出指定题目。仅可移出当前用户可见的题目（本用户学生的题或公共题）。"""
    row = db.get(QuestionBank, bank_id)
    if row is None:
        raise HTTPException(status_code=404, detail="题库中无该题目")
    my_ids = _my_student_ids(db, current_user)
    if row.student_id is not None and row.student_id not in my_ids:
        raise HTTPException(status_code=404, detail="题库中无该题目")
    db.delete(row)
    db.commit()
    return None
