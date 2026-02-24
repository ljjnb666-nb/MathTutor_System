"""
套餐列表：GET /api/plans（可未登录，供定价页展示）
"""
from sqlalchemy.orm import Session

from fastapi import APIRouter, Depends

from app.models.base import get_db
from app.models.plan import Plan
from app.schemas.plan_dto import PlanResponse

router = APIRouter()


@router.get("/", response_model=list[PlanResponse])
def list_plans(db: Session = Depends(get_db)) -> list[Plan]:
    """获取所有套餐，按 sort_order 排序，供定价页使用。"""
    return db.query(Plan).order_by(Plan.sort_order).all()
