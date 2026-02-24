"""
管理员管理接口：创建、列表、删除、套餐与批量续期（仅 role=admin 可调用）
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user, get_current_user_optional
from app.core.security import get_password_hash
from app.models.base import get_db
from app.models.chat_session import ChatMessage, ChatSession
from app.models.plan import Plan
from app.models.order import Order
from app.models.schedule import Schedule
from app.models.student import Student
from app.models.subscription import Subscription
from app.models.subscription_history import SubscriptionHistory
from app.models.user import User
from app.schemas.plan_dto import SubscriptionHistoryItem
from app.schemas.user_dto import BatchSubscriptionUpdate, UserCreate, UserResponse, UserSubscriptionUpdate

# 管理员授予付费套餐时的默认有效天数
DEFAULT_PAID_DAYS = 30


def _utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _append_subscription_history(
    db: Session,
    user_id: int,
    plan_id: int,
    period_start: datetime | None,
    period_end: datetime | None,
) -> None:
    db.add(SubscriptionHistory(
        user_id=user_id,
        plan_id=plan_id,
        period_start=period_start,
        period_end=period_end,
    ))
    db.commit()


router = APIRouter()


def get_current_active_superuser(current_user: User = Depends(get_current_user)) -> User:
    """仅允许 role=admin 的用户，用于用户管理 API。"""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough privileges",
        )
    return current_user


@router.post("/", response_model=UserResponse, status_code=201)
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
) -> User:
    """创建新管理员（密码会 Hash 后存储）。无任何用户时允许未登录创建首个管理员；否则仅 admin 可创建。"""
    user_count = db.query(User).count()
    if user_count > 0:
        if not current_user or current_user.role != "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough privileges")
    # 否则允许创建（首个用户或已认证 admin）
    existing = db.query(User).filter(User.username == body.username).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="用户名已存在")
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


@router.get("/", response_model=list[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_active_superuser),
) -> list[UserResponse]:
    """获取用户列表（仅 admin 可调用），含当前套餐 plan_code。"""
    users = db.query(User).order_by(User.created_at.desc()).all()
    if not users:
        return []
    user_ids = [u.id for u in users]
    subs = db.query(Subscription).filter(Subscription.user_id.in_(user_ids)).all()
    sub_by_user = {s.user_id: s for s in subs}
    plan_ids = list({s.plan_id for s in subs})
    plans = {p.id: p for p in db.query(Plan).filter(Plan.id.in_(plan_ids)).all()} if plan_ids else {}
    result = []
    for u in users:
        plan_code = None
        period_end = None
        if u.id in sub_by_user:
            sub = sub_by_user[u.id]
            pid = sub.plan_id
            if pid in plans:
                plan_code = plans[pid].code
            period_end = sub.period_end
        result.append(UserResponse(
            id=u.id,
            username=u.username,
            is_active=u.is_active,
            role=u.role,
            created_at=u.created_at,
            plan_code=plan_code,
            period_end=period_end,
        ))
    return result


@router.put("/{user_id}/subscription", response_model=UserResponse)
def set_user_subscription(
    user_id: int,
    body: UserSubscriptionUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_active_superuser),
) -> UserResponse:
    """管理员为指定用户设置套餐（仅 admin 可调用）。付费套餐默认有效 30 天，免费版无到期日。"""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    plan = db.query(Plan).filter(Plan.code == body.plan_code).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"套餐 {body.plan_code!r} 不存在")
    now = _utc_now()
    is_free = (plan.code == "free")
    days = DEFAULT_PAID_DAYS if is_free else (body.period_days if body.period_days is not None and body.period_days >= 1 else DEFAULT_PAID_DAYS)
    sub = db.query(Subscription).filter(Subscription.user_id == user_id).first()
    if sub:
        sub.plan_id = plan.id
        sub.status = "active"
        if is_free:
            sub.period_start = None
            sub.period_end = None
        else:
            sub.period_start = now
            sub.period_end = now + timedelta(days=days)
        db.commit()
        db.refresh(sub)
        _append_subscription_history(db, user_id, sub.plan_id, sub.period_start, sub.period_end)
    else:
        if is_free:
            db.add(Subscription(user_id=user_id, plan_id=plan.id, status="active"))
        else:
            sub = Subscription(
                user_id=user_id,
                plan_id=plan.id,
                status="active",
                period_start=now if not is_free else None,
                period_end=now + timedelta(days=days) if not is_free else None,
            )
            db.add(sub)
        db.commit()
    sub_after = db.query(Subscription).filter(Subscription.user_id == user_id).first()
    if sub_after:
        _append_subscription_history(
            db, user_id, sub_after.plan_id, sub_after.period_start, sub_after.period_end
        )
    plan_code = plan.code
    period_end = sub_after.period_end if sub_after else None
    return UserResponse(
        id=user.id,
        username=user.username,
        is_active=user.is_active,
        role=user.role,
        created_at=user.created_at,
        plan_code=plan_code,
        period_end=period_end,
    )


class BatchSubscriptionResult(BaseModel):
    updated: int = 0
    failed: list[dict] = []


@router.post("/batch-subscription", response_model=BatchSubscriptionResult)
def batch_subscription(
    body: BatchSubscriptionUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_active_superuser),
) -> BatchSubscriptionResult:
    """批量设置套餐或批量续期（仅 admin）。传 plan_code 则设为该套餐+周期；仅传 period_days 则对当前有到期日的用户延长 N 天。"""
    now = _utc_now()
    updated = 0
    failed: list[dict] = []

    if body.plan_code is not None:
        plan = db.query(Plan).filter(Plan.code == body.plan_code).first()
        if not plan:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"套餐 {body.plan_code!r} 不存在")
        is_free = plan.code == "free"
        days = DEFAULT_PAID_DAYS if is_free else (body.period_days or DEFAULT_PAID_DAYS)
        for uid in body.user_ids:
            user = db.get(User, uid)
            if not user:
                failed.append({"user_id": uid, "reason": "用户不存在"})
                continue
            sub = db.query(Subscription).filter(Subscription.user_id == uid).first()
            try:
                if sub:
                    sub.plan_id = plan.id
                    sub.status = "active"
                    if is_free:
                        sub.period_start = None
                        sub.period_end = None
                    else:
                        sub.period_start = now
                        sub.period_end = now + timedelta(days=days)
                    db.commit()
                    db.refresh(sub)
                else:
                    if is_free:
                        db.add(Subscription(user_id=uid, plan_id=plan.id, status="active"))
                    else:
                        db.add(Subscription(
                            user_id=uid, plan_id=plan.id, status="active",
                            period_start=now, period_end=now + timedelta(days=days),
                        ))
                    db.commit()
                    sub = db.query(Subscription).filter(Subscription.user_id == uid).first()
                if sub:
                    _append_subscription_history(db, uid, sub.plan_id, sub.period_start, sub.period_end)
                updated += 1
            except Exception as e:
                db.rollback()
                failed.append({"user_id": uid, "reason": str(e)})
    else:
        if not body.period_days:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="仅续期时需传 period_days")
        for uid in body.user_ids:
            user = db.get(User, uid)
            if not user:
                failed.append({"user_id": uid, "reason": "用户不存在"})
                continue
            sub = db.query(Subscription).filter(Subscription.user_id == uid).first()
            if not sub:
                failed.append({"user_id": uid, "reason": "无订阅记录"})
                continue
            if sub.period_end is None:
                failed.append({"user_id": uid, "reason": "免费版无到期日，无法续期"})
                continue
            try:
                base = sub.period_end if sub.period_end >= now else now
                sub.period_end = base + timedelta(days=body.period_days)
                db.commit()
                db.refresh(sub)
                _append_subscription_history(db, uid, sub.plan_id, sub.period_start, sub.period_end)
                updated += 1
            except Exception as e:
                db.rollback()
                failed.append({"user_id": uid, "reason": str(e)})

    return BatchSubscriptionResult(updated=updated, failed=failed)


@router.get("/{user_id}/subscription-history", response_model=list[SubscriptionHistoryItem])
def get_user_subscription_history(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_active_superuser),
) -> list[SubscriptionHistoryItem]:
    """获取指定用户的订阅变更历史（仅 admin），按时间倒序。"""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    rows = db.query(SubscriptionHistory).filter(SubscriptionHistory.user_id == user_id).order_by(
        SubscriptionHistory.created_at.desc()
    ).all()
    plan_ids = list({r.plan_id for r in rows})
    plans = {p.id: p for p in db.query(Plan).filter(Plan.id.in_(plan_ids)).all()} if plan_ids else {}
    return [
        SubscriptionHistoryItem(
            id=r.id,
            user_id=r.user_id,
            plan_code=plans[r.plan_id].code if r.plan_id in plans else "",
            plan_name=plans[r.plan_id].name if r.plan_id in plans else "",
            period_start=r.period_start,
            period_end=r.period_end,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
) -> None:
    """删除指定管理员（仅 admin 可调用）。不允许删除自己。"""
    if current_user.id == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能删除当前登录账号")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    # 先删除/解绑所有关联（user_id 为 NOT NULL 的表在删 user 时 ORM 会尝试置空 FK 导致违反约束）
    session_ids = [r.id for r in db.query(ChatSession.id).filter(ChatSession.user_id == user_id).all()]
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
    return None
