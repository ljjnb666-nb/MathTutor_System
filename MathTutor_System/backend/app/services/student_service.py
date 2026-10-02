"""Business logic for teacher-side student management."""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.core.subscription import get_current_subscription, require_plan_capacity
from app.models.student import Student
from app.models.user import User
from app.schemas.student_dto import StudentCreate, StudentTagsUpdate, StudentUpdate


def get_student_or_404(db: Session, student_id: int, current_user: User) -> Student:
    """Return a student owned by the current user or raise 404."""
    row = db.get(Student, student_id)
    if row is None or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="学生不存在")
    return row


def list_students_for_user(
    db: Session,
    current_user: User,
    *,
    name: str | None = None,
    class_name: str | None = None,
) -> list[Student]:
    q = db.query(Student).filter(Student.user_id == current_user.id)
    if name is not None and name.strip():
        q = q.filter(Student.name.ilike(f"%{name.strip()}%"))
    if class_name is not None and class_name.strip():
        q = q.filter(Student.class_name.ilike(f"%{class_name.strip()}%"))
    return q.order_by(Student.created_at.desc()).all()


def ensure_login_code_unique(
    db: Session,
    login_code: str | None,
    *,
    exclude_student_id: int | None = None,
) -> None:
    if not login_code or not login_code.strip():
        return
    code = login_code.strip()
    q = db.query(Student).filter(Student.login_code == code)
    if exclude_student_id is not None:
        q = q.filter(Student.id != exclude_student_id)
    if q.first() is not None:
        raise HTTPException(
            status_code=400,
            detail="学生端登录码不能重复，该登录码已被其他学生使用，请换一个。",
        )


CREDENTIAL_PASSWORD_REQUIRED_DETAIL = "启用学生端登录时必须同时设置密码（至少 8 位）。"


def _hash_credential_password(password: str | None) -> str | None:
    """Hash a student portal password, mapping policy violations to a stable 400."""
    if not password or not password.strip():
        return None
    try:
        return get_password_hash(password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


def create_student_for_user(db: Session, body: StudentCreate, current_user: User) -> Student:
    sub = get_current_subscription(current_user, db)
    require_plan_capacity(current_user, sub, db)
    ensure_login_code_unique(db, body.login_code)
    hashed_password = _hash_credential_password(body.password)
    enables_login = bool(body.login_code and body.login_code.strip())
    # SEC-01：登录码 + 密码必须同时存在，不允许 code-only 凭证诞生。
    if enables_login and hashed_password is None:
        raise HTTPException(status_code=400, detail=CREDENTIAL_PASSWORD_REQUIRED_DETAIL)
    row = Student(
        user_id=current_user.id,
        name=body.name,
        grade=body.grade,
        class_name=body.class_name,
        tags=body.tags or [],
        login_code=body.login_code.strip() if enables_login else None,
        hashed_password=hashed_password,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_student_for_user(
    db: Session,
    student_id: int,
    body: StudentUpdate,
    current_user: User,
) -> Student:
    row = get_student_or_404(db, student_id, current_user)
    data = body.model_dump(exclude_unset=True, exclude={"password"})
    has_password = bool(row.hashed_password and row.hashed_password.strip())
    if "login_code" in data:
        ensure_login_code_unique(db, data.get("login_code"), exclude_student_id=student_id)
    new_password_hash = _hash_credential_password(body.password)
    if "login_code" in data:
        enables_login = bool(data.get("login_code") and str(data.get("login_code")).strip())
        # 启用/保持登录码时，学生必须最终持有密码：已设密码允许只改登录码；
        # 无密码学生必须本次同时设置，否则拒绝且不做任何修改。
        if enables_login and not has_password and new_password_hash is None:
            raise HTTPException(status_code=400, detail=CREDENTIAL_PASSWORD_REQUIRED_DETAIL)
    if new_password_hash is not None:
        row.hashed_password = new_password_hash
    for key, value in data.items():
        if key == "login_code":
            row.login_code = value.strip() if value else None
        else:
            setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


def delete_student_for_user(db: Session, student_id: int, current_user: User) -> None:
    row = get_student_or_404(db, student_id, current_user)
    db.delete(row)
    db.commit()


def update_student_tags_for_user(
    db: Session,
    student_id: int,
    body: StudentTagsUpdate,
    current_user: User,
) -> Student:
    row = get_student_or_404(db, student_id, current_user)
    tags = list(row.tags or [])
    for tag in body.add:
        tag_str = (tag or "").strip()
        if tag_str and tag_str not in tags:
            tags.append(tag_str)
    for tag in body.remove:
        tag_str = (tag or "").strip()
        if tag_str and tag_str in tags:
            tags.remove(tag_str)
    row.tags = tags
    db.commit()
    db.refresh(row)
    return row
