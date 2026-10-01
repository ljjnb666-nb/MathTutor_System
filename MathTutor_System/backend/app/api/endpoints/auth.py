"""
认证接口：登录（JWT）、当前用户信息
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from uuid import UUID

from app.core.security import create_access_token, decode_access_token, verify_password
from app.models.base import get_db
from app.models.user import User
from app.schemas.user_dto import Token, UserResponse

router = APIRouter()
security_bearer = HTTPBearer(auto_error=False)


def _resolve_teacher_user(payload: dict, db: Session) -> User | None:
    """Bind a teacher credential to its account instance before resolving identity."""
    # Admin authorization comes from User.role, never from the credential type.
    if payload.get("type") != "teacher":
        return None
    subject = payload.get("sub")
    if not isinstance(subject, str):
        return None
    try:
        if str(UUID(subject)) != subject:
            return None
    except ValueError:
        return None
    uid = payload.get("uid")
    username = payload.get("username")
    # Require a positive JSON integer in the database ID range; bool is not an ID.
    if type(uid) is not int or not 0 < uid <= 2**63 - 1:
        return None
    if not isinstance(username, str) or not username:
        return None
    user = db.query(User).filter(User.auth_subject == subject).first()
    if not user or user.id != uid or user.username != username or not user.is_active:
        return None
    return user


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_bearer),
    db: Session = Depends(get_db),
) -> User | None:
    """从 Authorization: Bearer <token> 解析 JWT，返回当前 User；无 Token 或无效时返回 None。"""
    if not credentials or credentials.credentials is None:
        return None
    payload = decode_access_token(credentials.credentials)
    if not payload:
        return None
    return _resolve_teacher_user(payload, db)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_bearer),
    db: Session = Depends(get_db),
) -> User:
    """从 Authorization: Bearer <token> 解析 JWT，并返回当前 User；失败 401。"""
    try:
        if not credentials or credentials.credentials is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="未提供认证信息",
                headers={"WWW-Authenticate": "Bearer"},
            )
        payload = decode_access_token(credentials.credentials)
        if not payload:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="无效或过期的 Token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        user = _resolve_teacher_user(payload, db)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="无效的认证信息",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return user
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception("get_current_user 异常: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="认证失败，请重新登录",
            headers={"WWW-Authenticate": "Bearer"},
        )


@router.post("/token", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> Token:
    """登录：验证用户名密码，返回 JWT access_token。"""
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户已禁用",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(data={
        "sub": user.auth_subject, "uid": user.id, "username": user.username, "type": "teacher",
    })
    return Token(access_token=access_token, token_type="bearer")


@router.get("/users/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """获取当前登录用户信息（需携带 Bearer Token）。"""
    try:
        return UserResponse(
            id=current_user.id,
            username=current_user.username,
            is_active=bool(current_user.is_active),
            role=current_user.role or "teacher",
            created_at=current_user.created_at,
            plan_code=None,
            period_end=None,
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception("get_me 异常: %s", e)
        raise HTTPException(status_code=500, detail="获取用户信息失败")
