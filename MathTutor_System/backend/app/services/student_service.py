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
    if row is None or (row.user_id is not None and row.user_id != current_user.id):
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


def create_student_for_user(db: Session, body: StudentCreate, current_user: User) -> Student:
    sub = get_current_subscription(current_user, db)
    require_plan_capacity(current_user, sub, db)
    ensure_login_code_unique(db, body.login_code)
    row = Student(
        user_id=current_user.id,
        name=body.name,
        grade=body.grade,
        class_name=body.class_name,
        tags=body.tags or [],
        login_code=body.login_code.strip() if body.login_code and body.login_code.strip() else None,
        hashed_password=get_password_hash(body.password) if body.password and body.password.strip() else None,
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
    if "login_code" in data:
        ensure_login_code_unique(db, data.get("login_code"), exclude_student_id=student_id)
    if body.password is not None and body.password.strip():
        row.hashed_password = get_password_hash(body.password)
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
