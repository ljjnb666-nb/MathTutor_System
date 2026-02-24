"""
排课接口 - 按当前用户隔离的课程安排 CRUD，支持单次与每周重复、按日期范围展开
"""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.models.base import get_db
from app.models.schedule import Schedule
from app.models.student import Student
from app.models.user import User
from app.schemas.schedule_dto import ScheduleCreate, ScheduleResponse, ScheduleUpdate

router = APIRouter()

# Python weekday: Monday=0, Sunday=6，与前端约定一致
WEEKDAY_MON, WEEKDAY_SUN = 0, 6


def _require_own_schedule(row: Schedule | None, current_user: User) -> Schedule:
    if row is None:
        raise HTTPException(status_code=404, detail="排课记录不存在")
    if row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="排课记录不存在")
    return row


def _require_own_student(student_id: int, current_user: User, db: Session) -> Student:
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="学生不存在")
    if student.user_id is not None and student.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="学生不存在")
    return student


def _schedule_to_response(
    s: Schedule,
    db: Session,
    *,
    occurrence_date: date | None = None,
    is_recurring: bool = False,
) -> ScheduleResponse:
    student = db.get(Student, s.student_id)
    weekdays = getattr(s, "recurrence_weekdays", None) or []
    if not isinstance(weekdays, list):
        weekdays = []
    return ScheduleResponse(
        id=s.id,
        user_id=s.user_id,
        student_id=s.student_id,
        student_name=student.name if student else None,
        schedule_date=occurrence_date if occurrence_date is not None else s.schedule_date,
        start_time=s.start_time,
        end_time=s.end_time,
        subject=s.subject,
        note=s.note,
        is_recurring=is_recurring,
        recurrence_weekdays=weekdays if is_recurring else None,
        created_at=s.created_at,
    )


def _expand_recurring(
    s: Schedule,
    from_date: date,
    to_date: date,
    db: Session,
) -> list[ScheduleResponse]:
    """将一条每周重复的排课在 [from_date, to_date] 内展开为多条 occurrence。"""
    weekdays: list[int] = getattr(s, "recurrence_weekdays", None) or []
    if not weekdays:
        return []
    start = max(s.schedule_date, from_date)
    out: list[ScheduleResponse] = []
    d = start
    while d <= to_date:
        if d.weekday() in weekdays:  # Python: Mon=0, Sun=6
            out.append(_schedule_to_response(s, db, occurrence_date=d, is_recurring=True))
        d += timedelta(days=1)
    return out


@router.get("/", response_model=list[ScheduleResponse])
def list_schedules(
    student_id: int | None = Query(None, description="按学生 ID 筛选"),
    from_date: date | None = Query(None, description="起始日期 YYYY-MM-DD"),
    to_date: date | None = Query(None, description="结束日期 YYYY-MM-DD"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ScheduleResponse]:
    """获取当前用户的排课列表；有 from_date/to_date 时每周重复会展开为多条 occurrence"""
    q = db.query(Schedule).filter(Schedule.user_id == current_user.id)
    if student_id is not None:
        q = q.filter(Schedule.student_id == student_id)
    rows = q.order_by(Schedule.schedule_date.asc(), Schedule.start_time.asc()).all()

    result: list[ScheduleResponse] = []
    for r in rows:
        is_weekly = getattr(r, "recurrence_type", None) == "weekly"
        weekdays = getattr(r, "recurrence_weekdays", None) or []
        if is_weekly and weekdays:
            if from_date is not None and to_date is not None:
                result.extend(_expand_recurring(r, from_date, to_date, db))
            else:
                result.append(
                    _schedule_to_response(r, db, occurrence_date=r.schedule_date, is_recurring=True)
                )
        else:
            if from_date is not None and r.schedule_date < from_date:
                continue
            if to_date is not None and r.schedule_date > to_date:
                continue
            result.append(_schedule_to_response(r, db))
    result.sort(key=lambda x: (x.schedule_date, x.start_time))
    return result


@router.post("/", response_model=ScheduleResponse, status_code=201)
def create_schedule(
    body: ScheduleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ScheduleResponse:
    """新增排课，学生须属于当前用户；可传 recurrence_weekdays 表示每周重复"""
    _require_own_student(body.student_id, current_user, db)
    weekdays = body.recurrence_weekdays if body.recurrence_weekdays else None
    row = Schedule(
        user_id=current_user.id,
        student_id=body.student_id,
        schedule_date=body.schedule_date,
        start_time=body.start_time.strip(),
        end_time=body.end_time.strip(),
        subject=body.subject.strip() if body.subject else None,
        note=body.note.strip() if body.note else None,
        recurrence_type="weekly" if weekdays else None,
        recurrence_weekdays=weekdays,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    is_recurring = bool(weekdays)
    return _schedule_to_response(
        row, db, occurrence_date=row.schedule_date, is_recurring=is_recurring
    )


@router.get("/{schedule_id}", response_model=ScheduleResponse)
def get_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ScheduleResponse:
    """获取单条排课（模板）"""
    row = db.get(Schedule, schedule_id)
    _require_own_schedule(row, current_user)
    is_recurring = getattr(row, "recurrence_type", None) == "weekly"
    return _schedule_to_response(
        row, db, occurrence_date=row.schedule_date, is_recurring=is_recurring
    )


@router.put("/{schedule_id}", response_model=ScheduleResponse)
def update_schedule(
    schedule_id: int,
    body: ScheduleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ScheduleResponse:
    """修改排课（重复规则编辑后影响所有 occurrence）"""
    row = db.get(Schedule, schedule_id)
    _require_own_schedule(row, current_user)
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        if v is not None and isinstance(v, str) and k in ("subject", "note"):
            v = v.strip() or None
        if k == "recurrence_weekdays":
            row.recurrence_type = "weekly" if (v and len(v) > 0) else None
            row.recurrence_weekdays = v if (v and len(v) > 0) else None
            continue
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    is_recurring = getattr(row, "recurrence_type", None) == "weekly"
    return _schedule_to_response(
        row, db, occurrence_date=row.schedule_date, is_recurring=is_recurring
    )


@router.delete("/{schedule_id}", status_code=204)
def delete_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """删除排课"""
    row = db.get(Schedule, schedule_id)
    _require_own_schedule(row, current_user)
    db.delete(row)
    db.commit()
    return None
