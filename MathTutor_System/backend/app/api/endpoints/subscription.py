"""
当前用户订阅：GET /api/subscription/me（需登录）
"""
from sqlalchemy.orm import Session

from fastapi import APIRouter, Depends

from app.api.endpoints.auth import get_current_user
from app.core.subscription import count_students_for_user, get_current_subscription
from app.models.base import get_db
from app.models.user import User
from app.schemas.plan_dto import PlanResponse, SubscriptionMeResponse

router = APIRouter()


def _admin_plan_response() -> PlanResponse:
    """管理员虚拟套餐：仅用于展示，不落库。"""
    return PlanResponse(
        id=0,
        code="admin",
        name="管理员",
        max_students=99999,
        features={"magic_ppt": True, "rag": True},
        sort_order=99,
        price_monthly=None,
        price_yearly=None,
    )


@router.get("/me", response_model=SubscriptionMeResponse)
def get_my_subscription(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SubscriptionMeResponse:
    """当前用户的套餐与已用学生数，供侧栏展示「基础版 · 5/15 学生」。管理员固定返回「管理员」套餐展示。"""
    if current_user.role == "admin":
        student_count = count_students_for_user(current_user.id, db)
        return SubscriptionMeResponse(
            plan=_admin_plan_response(),
            status="active",
            period_end=None,
            student_count=student_count,
            max_students=99999,
        )
    sub = get_current_subscription(current_user, db)
    plan = sub.plan
    if plan is None:
        db.refresh(sub)
        plan = sub.plan
    student_count = count_students_for_user(current_user.id, db)
    max_students = plan.max_students if plan else 0
    return SubscriptionMeResponse(
        plan=PlanResponse.model_validate(plan) if plan else None,
        status=sub.status,
        period_end=sub.period_end,
        student_count=student_count,
        max_students=max_students,
    )