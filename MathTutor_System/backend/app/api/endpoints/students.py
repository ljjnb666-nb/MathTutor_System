"""
学生管理接口 - 学生档案与学习分析（CRUD + 标签），按当前用户隔离
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.core.security import get_password_hash
from app.core.subscription import get_current_subscription, require_plan_capacity
from app.models.base import get_db
from app.models.student import Student
from app.models.user import User
from app.schemas.student_dto import StudentCreate, StudentResponse, StudentTagsUpdate, StudentUpdate

router = APIRouter()


def _require_own_student(row: Student | None, current_user: User) -> Student:
    """若学生不存在或不属于当前用户，则 404。"""
    if row is None:
        raise HTTPException(status_code=404, detail="学生不存在")
    if row.user_id is not None and row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="学生不存在")
    return row


@router.get("/", response_model=list[StudentResponse])
def list_students(
    name: str | None = Query(None, description="按姓名搜索（模糊）"),
    class_name: str | None = Query(None, description="按班级搜索（模糊）"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Student]:
    """获取当前用户的学生列表，支持按 name 或 class_name 搜索"""
    q = db.query(Student).filter(Student.user_id == current_user.id)
    if name is not None and name.strip():
        q = q.filter(Student.name.ilike(f"%{name.strip()}%"))
    if class_name is not None and class_name.strip():
        q = q.filter(Student.class_name.ilike(f"%{class_name.strip()}%"))
    return q.order_by(Student.created_at.desc()).all()


def _check_login_code_unique(db: Session, login_code: str | None, exclude_student_id: int | None = None) -> None:
    """若登录码为空或已被其他学生使用则 400。学生端账号（登录码）全局唯一，不能重复。"""
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


@router.post("/", response_model=StudentResponse, status_code=201)
def create_student(
    body: StudentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Student:
    """新增学生，归属当前用户；受套餐学生数限制。"""
    sub = get_current_subscription(current_user, db)
    require_plan_capacity(current_user, sub, db)
    _check_login_code_unique(db, body.login_code, exclude_student_id=None)
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


@router.get("/{student_id}", response_model=StudentResponse)
def get_student(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Student:
    """获取单个学生（仅限本人）"""
    row = db.get(Student, student_id)
    _require_own_student(row, current_user)
    return row


@router.put("/{student_id}", response_model=StudentResponse)
def update_student(
    student_id: int,
    body: StudentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Student:
    """修改学生信息（仅限本人）"""
    row = db.get(Student, student_id)
    _require_own_student(row, current_user)
    data = body.model_dump(exclude_unset=True, exclude={"password"})
    if "login_code" in data:
        _check_login_code_unique(db, data.get("login_code"), exclude_student_id=student_id)
    if body.password is not None and body.password.strip():
        row.hashed_password = get_password_hash(body.password)
    for k, v in data.items():
        if k == "login_code":
            row.login_code = v.strip() if v else None
        else:
            setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{student_id}", status_code=204)
def delete_student(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """删除学生（仅限本人）"""
    row = db.get(Student, student_id)
    _require_own_student(row, current_user)
    db.delete(row)
    db.commit()
    return None


@router.post("/{student_id}/tags", response_model=StudentResponse)
def update_student_tags(
    student_id: int,
    body: StudentTagsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Student:
    """快速添加/删除标签（仅限本人）"""
    row = db.get(Student, student_id)
    _require_own_student(row, current_user)
    tags: list[str] = list(row.tags or [])
    for t in body.add:
        t_str = (t or "").strip()
        if t_str and t_str not in tags:
            tags.append(t_str)
    for t in body.remove:
        t_str = (t or "").strip()
        if t_str and t_str in tags:
            tags.remove(t_str)
    row.tags = tags
    db.commit()
    db.refresh(row)
    return row
