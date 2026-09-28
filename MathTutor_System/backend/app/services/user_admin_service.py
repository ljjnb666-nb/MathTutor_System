"""Business logic for admin user and subscription management."""
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.models.chat_session import ChatMessage, ChatSession
from app.models.order import Order
from app.models.plan import Plan
from app.models.schedule import Schedule
from app.models.student import Student
from app.models.subscription import Subscription
from app.models.subscription_history import SubscriptionHistory
from app.models.user import User
from app.schemas.plan_dto import SubscriptionHistoryItem
from app.schemas.user_dto import UserCreate, UserResponse

DEFAULT_PAID_DAYS = 30


class UserAdminServiceError(Exception):
    """Domain error that endpoints map to HTTP responses."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _response_from_user(user: User, plan_code: str | None = None, period_end: datetime | None = None) -> UserResponse:
    return UserResponse(
        id=user.id,
        username=user.username,
        is_active=user.is_active,
        role=user.role,
        created_at=user.created_at,
        plan_code=plan_code,
        period_end=period_end,
    )


def _append_subscription_history(
    db: Session,
    user_id: int,
    plan_id: int,
    period_start: datetime | None,
    period_end: datetime | None,
) -> None:
    db.add(
        SubscriptionHistory(
            user_id=user_id,
            plan_id=plan_id,
            period_start=period_start,
            period_end=period_end,
        )
    )


def _get_user_or_error(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user:
        raise UserAdminServiceError(404, "用户不存在")
    return user


def _get_plan_or_error(db: Session, plan_code: str) -> Plan:
    plan = db.query(Plan).filter(Plan.code == plan_code).first()
    if not plan:
        raise UserAdminServiceError(400, f"套餐 {plan_code!r} 不存在")
    return plan


def _subscription_days(plan: Plan, period_days: int | None) -> int:
    if plan.code == "free":
        return DEFAULT_PAID_DAYS
    return period_days if period_days is not None and period_days >= 1 else DEFAULT_PAID_DAYS


def _apply_plan_to_user(
    db: Session,
    user_id: int,
    plan: Plan,
    period_days: int | None,
    now: datetime,
) -> Subscription:
    is_free = plan.code == "free"
    days = _subscription_days(plan, period_days)
    sub = db.query(Subscription).filter(Subscription.user_id == user_id).first()
    if not sub:
        sub = Subscription(user_id=user_id, plan_id=plan.id, status="active")
        db.add(sub)

    sub.plan_id = plan.id
    sub.status = "active"
    if is_free:
        sub.period_start = None
        sub.period_end = None
    else:
        sub.period_start = now
        sub.period_end = now + timedelta(days=days)

    _append_subscription_history(db, user_id, sub.plan_id, sub.period_start, sub.period_end)
    db.commit()
    db.refresh(sub)
    return sub


def create_user_with_default_subscription(db: Session, body: UserCreate) -> User:
    existing = db.query(User).filter(User.username == body.username).first()
    if existing:
        raise UserAdminServiceError(400, "用户名已存在")

    user = User(
        username=body.username,
        hashed_password=get_password_hash(body.password),
        role=body.role or "teacher",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    free_plan = db.query(Plan).filter(Plan.code == "free").first()
    if free_plan:
        db.add(Subscription(user_id=user.id, plan_id=free_plan.id, status="active"))
        db.commit()
    return user


def list_users_with_subscription(db: Session) -> list[UserResponse]:
    users = db.query(User).order_by(User.created_at.desc()).all()
    if not users:
        return []

    user_ids = [user.id for user in users]
    subs = db.query(Subscription).filter(Subscription.user_id.in_(user_ids)).all()
    sub_by_user = {sub.user_id: sub for sub in subs}
    plan_ids = list({sub.plan_id for sub in subs})
    plans = {plan.id: plan for plan in db.query(Plan).filter(Plan.id.in_(plan_ids)).all()} if plan_ids else {}

    result: list[UserResponse] = []
    for user in users:
        sub = sub_by_user.get(user.id)
        plan_code = plans[sub.plan_id].code if sub and sub.plan_id in plans else None
        period_end = sub.period_end if sub else None
        result.append(_response_from_user(user, plan_code, period_end))
    return result


def set_user_subscription(
    db: Session,
    user_id: int,
    plan_code: str,
    period_days: int | None,
) -> UserResponse:
    user = _get_user_or_error(db, user_id)
    plan = _get_plan_or_error(db, plan_code)
    sub = _apply_plan_to_user(db, user_id, plan, period_days, utc_now())
    return _response_from_user(user, plan.code, sub.period_end)


def batch_set_or_extend_subscriptions(
    db: Session,
    user_ids: list[int],
    plan_code: str | None,
    period_days: int | None,
) -> dict:
    updated = 0
    failed: list[dict] = []
    now = utc_now()

    if plan_code is not None:
        plan = _get_plan_or_error(db, plan_code)
        for user_id in user_ids:
            user = db.get(User, user_id)
            if not user:
                failed.append({"user_id": user_id, "reason": "用户不存在"})
                continue
            try:
                _apply_plan_to_user(db, user_id, plan, period_days, now)
                updated += 1
            except Exception as exc:
                db.rollback()
                failed.append({"user_id": user_id, "reason": str(exc)})
        return {"updated": updated, "failed": failed}

    if not period_days:
        raise UserAdminServiceError(400, "仅续期时需传 period_days")

    for user_id in user_ids:
        user = db.get(User, user_id)
        if not user:
            failed.append({"user_id": user_id, "reason": "用户不存在"})
            continue
        sub = db.query(Subscription).filter(Subscription.user_id == user_id).first()
        if not sub:
            failed.append({"user_id": user_id, "reason": "无订阅记录"})
            continue
        if sub.period_end is None:
            failed.append({"user_id": user_id, "reason": "免费版无到期日，无法续期"})
            continue
        try:
            base = sub.period_end if sub.period_end >= now else now
            sub.period_end = base + timedelta(days=period_days)
            _append_subscription_history(db, user_id, sub.plan_id, sub.period_start, sub.period_end)
            db.commit()
            db.refresh(sub)
            updated += 1
        except Exception as exc:
            db.rollback()
            failed.append({"user_id": user_id, "reason": str(exc)})

    return {"updated": updated, "failed": failed}


def get_subscription_history(db: Session, user_id: int) -> list[SubscriptionHistoryItem]:
    _get_user_or_error(db, user_id)
    rows = (
        db.query(SubscriptionHistory)
        .filter(SubscriptionHistory.user_id == user_id)
        .order_by(SubscriptionHistory.created_at.desc())
        .all()
    )
    plan_ids = list({row.plan_id for row in rows})
    plans = {plan.id: plan for plan in db.query(Plan).filter(Plan.id.in_(plan_ids)).all()} if plan_ids else {}
    return [
        SubscriptionHistoryItem(
            id=row.id,
            user_id=row.user_id,
            plan_code=plans[row.plan_id].code if row.plan_id in plans else "",
            plan_name=plans[row.plan_id].name if row.plan_id in plans else "",
            period_start=row.period_start,
            period_end=row.period_end,
            created_at=row.created_at,
        )
        for row in rows
    ]


def delete_user_and_related(db: Session, user_id: int, current_user_id: int) -> None:
    if current_user_id == user_id:
        raise UserAdminServiceError(400, "不能删除当前登录账号")
    user = _get_user_or_error(db, user_id)

    session_ids = [row.id for row in db.query(ChatSession.id).filter(ChatSession.user_id == user_id).all()]
    if session_ids:
        db.query(ChatMessage).filter(ChatMessage.session_id.in_(session_ids)).delete(synchronize_session=False)
    db.query(ChatSession).filter(ChatSession.user_id == user_id).delete(synchronize_session=False)
    db.query(SubscriptionHistory).filter(SubscriptionHistory.user_id == user_id).delete(synchronize_session=False)
    db.query(Subscription).filter(Subscription.user_id == user_id).delete(synchronize_session=False)
    db.query(Order).filter(Order.user_id == user_id).delete(synchronize_session=False)
    db.query(Schedule).filter(Schedule.user_id == user_id).delete(synchronize_session=False)
    db.query(Student).filter(Student.user_id == user_id).update({Student.user_id: None}, synchronize_session=False)
    db.delete(user)
    db.commit()
