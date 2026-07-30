"""
管理员管理接口：创建、列表、删除、套餐与批量续期（仅 role=admin 可调用）
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user, get_current_user_optional
from app.models.base import get_db
from app.models.user import User
from app.schemas.plan_dto import SubscriptionHistoryItem
from app.schemas.user_dto import BatchSubscriptionUpdate, UserCreate, UserResponse, UserSubscriptionUpdate
from app.services.user_admin_service import (
    UserAdminServiceError,
    batch_set_or_extend_subscriptions,
    create_user_with_default_subscription,
    delete_user_and_related,
    get_subscription_history,
    list_users_with_subscription,
    set_user_subscription as set_user_subscription_service,
)


router = APIRouter()


def _raise_http_error(exc: UserAdminServiceError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.detail)


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
    try:
        return create_user_with_default_subscription(db, body)
    except UserAdminServiceError as exc:
        _raise_http_error(exc)


@router.get("/", response_model=list[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_active_superuser),
) -> list[UserResponse]:
    """获取用户列表（仅 admin 可调用），含当前套餐 plan_code。"""
    return list_users_with_subscription(db)


@router.put("/{user_id}/subscription", response_model=UserResponse)
def set_user_subscription(
    user_id: int,
    body: UserSubscriptionUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_active_superuser),
) -> UserResponse:
    """管理员为指定用户设置套餐（仅 admin 可调用）。付费套餐默认有效 30 天，免费版无到期日。"""
    try:
        return set_user_subscription_service(db, user_id, body.plan_code, body.period_days)
    except UserAdminServiceError as exc:
        _raise_http_error(exc)


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
    try:
        result = batch_set_or_extend_subscriptions(db, body.user_ids, body.plan_code, body.period_days)
        return BatchSubscriptionResult(**result)
    except UserAdminServiceError as exc:
        _raise_http_error(exc)


@router.get("/{user_id}/subscription-history", response_model=list[SubscriptionHistoryItem])
def get_user_subscription_history(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_active_superuser),
) -> list[SubscriptionHistoryItem]:
    """获取指定用户的订阅变更历史（仅 admin），按时间倒序。"""
    try:
        return get_subscription_history(db, user_id)
    except UserAdminServiceError as exc:
        _raise_http_error(exc)


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
) -> None:
    """删除指定管理员（仅 admin 可调用）。不允许删除自己。"""
    try:
        delete_user_and_related(db, user_id, current_user.id)
    except UserAdminServiceError as exc:
        _raise_http_error(exc)
