"""Reference-data seeding for application bootstrap and maintenance scripts."""

from sqlalchemy.orm import Session

from app.models.base import SessionLocal
from app.models.plan import Plan
from app.models.subscription import Subscription
from app.models.user import User


DEFAULT_PLANS = [
    {
        "code": "free",
        "name": "免费版",
        "max_students": 3,
        "features": {"magic_ppt": False, "rag": False},
        "sort_order": 0,
        "price_monthly": 0,
        "price_yearly": 0,
    },
    {
        "code": "basic",
        "name": "基础版",
        "max_students": 15,
        "features": {"magic_ppt": False, "rag": True},
        "sort_order": 1,
        "price_monthly": 19.9,
        "price_yearly": 199,
    },
    {
        "code": "pro",
        "name": "专业版",
        "max_students": 50,
        "features": {"magic_ppt": True, "rag": True},
        "sort_order": 2,
        "price_monthly": 29.9,
        "price_yearly": 299,
    },
]


def _upsert_default_plans(db: Session) -> Plan | None:
    free_plan: Plan | None = None
    for payload in DEFAULT_PLANS:
        plan = db.query(Plan).filter(Plan.code == payload["code"]).first()
        if plan is None:
            plan = Plan(**payload)
            db.add(plan)
        else:
            for field, value in payload.items():
                setattr(plan, field, value)
        if payload["code"] == "free":
            free_plan = plan

    db.commit()
    if free_plan is None:
        free_plan = db.query(Plan).filter(Plan.code == "free").first()
    return free_plan


def _ensure_user_subscriptions(db: Session, free_plan: Plan | None) -> None:
    if free_plan is None:
        return

    for user in db.query(User).all():
        sub = db.query(Subscription).filter(Subscription.user_id == user.id).first()
        if sub is None:
            db.add(
                Subscription(
                    user_id=user.id,
                    plan_id=free_plan.id,
                    status="active",
                )
            )

    db.commit()


def seed_default_data() -> None:
    """Ensure reference plans and required subscriptions exist."""
    db = SessionLocal()
    try:
        free_plan = _upsert_default_plans(db)
        _ensure_user_subscriptions(db, free_plan)
    finally:
        db.close()
