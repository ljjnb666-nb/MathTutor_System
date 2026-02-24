"""
订阅与套餐校验：get_current_subscription、require_plan_capacity、require_feature
"""
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from fastapi import HTTPException, status

from app.models.plan import Plan
from app.models.student import Student
from app.models.subscription import Subscription
from app.models.user import User


def _utc_now():
    """当前 UTC 时间（naive），用于与数据库 DateTime 比较。"""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def get_current_subscription(current_user: User, db: Session) -> Subscription:
    """
    获取当前用户的有效订阅；若无则绑定免费版并创建一条 subscription。
    若订阅已到期（period_end 已过），自动降级为免费版并清除周期。
    管理员可跳过（返回的订阅仍会查库，但后续 require_* 会对 admin 放行）。
    """
    sub = db.query(Subscription).filter(Subscription.user_id == current_user.id).first()
    free_plan = db.query(Plan).filter(Plan.code == "free").first()
    if not free_plan:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="系统未配置套餐，请联系管理员",
        )

    if sub is None:
        sub = Subscription(user_id=current_user.id, plan_id=free_plan.id, status="active")
        db.add(sub)
        db.commit()
        db.refresh(sub)
    else:
        # 到期检测：period_end 已过则自动降级为免费版
        now = _utc_now()
        if sub.period_end is not None and sub.period_end < now:
            sub.plan_id = free_plan.id
            sub.status = "active"
            sub.period_start = None
            sub.period_end = None
            db.commit()
            db.refresh(sub)

    if sub.plan is None:
        db.refresh(sub)
    return sub


def count_students_for_user(user_id: int, db: Session) -> int:
    """当前用户已创建的学生数量。"""
    return db.query(Student).filter(Student.user_id == user_id).count()


def require_plan_capacity(
    current_user: User,
    subscription: Subscription,
    db: Session,
) -> None:
    """
    校验当前学生数 < plan.max_students；超出则 403。
    管理员（role=admin）跳过限制。
    """
    if current_user.role == "admin":
        return
    plan = subscription.plan
    if plan is None:
        db.refresh(subscription)
        plan = subscription.plan
    if plan is None:
        return
    current_count = count_students_for_user(current_user.id, db)
    if current_count >= plan.max_students:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"当前套餐最多 {plan.max_students} 名学生，请升级。",
        )


def require_feature(subscription: Subscription, feature_key: str, current_user: User) -> None:
    """
    校验套餐是否开通某功能（如 magic_ppt、rag）；未开通则 403。
    管理员跳过。
    """
    if current_user.role == "admin":
        return
    plan = subscription.plan
    if plan is None:
        return
    raw = getattr(plan, "features", None)
    features = raw if isinstance(raw, dict) else {}
    if not features.get(feature_key):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"该功能需升级至更高套餐（当前套餐：{plan.name}）。",
        )
