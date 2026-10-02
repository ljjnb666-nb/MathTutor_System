"""Business logic for the student-facing portal."""
from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.security import create_access_token, decode_access_token, get_password_hash, verify_password
from app.models.exam import Exam
from app.models.mistake import MistakeRecord
from app.models.student import Student
from app.models.user import User, USER_DELETION_ACTIVE
from app.schemas.exam_dto import GradeResponse
from app.schemas.user_dto import Token
from app.services.exam_grading_service import compute_results_from_student_answers, grade_exam_core
from app.services.topic_service import split_topics

REVIEW_INTERVAL_DAYS_NEXT = 3


class StudentPortalServiceError(Exception):
    """Domain error that student endpoints map to HTTP responses."""

    def __init__(self, status_code: int, detail: str, *, authenticate_header: bool = False) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
        self.authenticate_header = authenticate_header


def _auth_error(detail: str) -> StudentPortalServiceError:
    return StudentPortalServiceError(401, detail, authenticate_header=True)


def _validate_student_owner(db: Session, student: Student, *, auth_subject: str | None = None) -> User:
    query = db.query(User).filter(User.id == student.user_id)
    if auth_subject is not None:
        query = query.filter(User.auth_subject == auth_subject)
    owner = query.populate_existing().first()
    if owner is None or not owner.is_active or owner.deletion_state != USER_DELETION_ACTIVE:
        raise _auth_error("学生所属账号已禁用")
    return owner


def _canonical_subject(value) -> bool:
    if not isinstance(value, str):
        return False
    try:
        return str(UUID(value)) == value
    except ValueError:
        return False


def _positive_id(value) -> bool:
    return type(value) is int and 0 < value <= 2**63 - 1


def get_current_student_from_token(db: Session, token: str | None) -> Student:
    if not token:
        raise _auth_error("未提供认证信息")
    payload = decode_access_token(token)
    if not payload:
        raise _auth_error("无效或过期的 Token")
    if payload.get("type") != "student":
        raise _auth_error("无效的 Token")

    sub = payload.get("sub")
    sid = payload.get("sid")
    owner_uid = payload.get("owner_uid")
    owner_sub = payload.get("owner_sub")
    if (not _canonical_subject(sub) or not _canonical_subject(owner_sub)
            or not _positive_id(sid) or not _positive_id(owner_uid)):
        raise _auth_error("无效的 Token 载荷")

    student = db.query(Student).filter(Student.auth_subject == sub).populate_existing().first()
    if not student or student.id != sid or student.user_id != owner_uid:
        raise _auth_error("学生不存在")
    if not student.login_code or not student.login_code.strip():
        raise _auth_error("该账号未开通学生端登录")
    _validate_student_owner(db, student, auth_subject=owner_sub)
    return student


def login_student(db: Session, login_code: str, password: str | None) -> Token:
    student = db.query(Student).filter(Student.login_code == login_code.strip()).populate_existing().first()
    if not student or student.user_id is None:
        raise _auth_error("登录码或密码错误")

    owner = _validate_student_owner(db, student)
    # SEC-01：登录码 + 密码必须同时存在；历史「只有登录码」的学生一律无法登录，
    # 且不得向调用方透露「登录码存在但未设密码」。
    if not student.hashed_password or not student.hashed_password.strip():
        raise _auth_error("登录码或密码错误")
    if not password or not password.strip():
        raise _auth_error("请输入密码")
    if not verify_password(password, student.hashed_password):
        raise _auth_error("登录码或密码错误")

    access_token = create_access_token(data={
        "type": "student", "sub": student.auth_subject, "sid": student.id,
        "owner_uid": owner.id, "owner_sub": owner.auth_subject,
    })
    return Token(access_token=access_token, token_type="bearer")


def update_student_password(db: Session, student: Student, old_password: str, new_password: str) -> dict:
    if not student.hashed_password or not student.hashed_password.strip():
        raise StudentPortalServiceError(400, "您尚未设置密码，无法修改。请联系老师在学生管理中为您设置密码。")
    if not verify_password(old_password, student.hashed_password):
        raise StudentPortalServiceError(400, "当前密码错误")
    # 旧密码只做校验不套用新规则；新密码必须满足统一 policy。
    try:
        student.hashed_password = get_password_hash(new_password)
    except ValueError as exc:
        raise StudentPortalServiceError(400, str(exc)) from None
    db.commit()
    return {"detail": "密码已修改"}


def week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def list_student_mistakes(
    db: Session,
    student_id: int,
    *,
    status: str | None = None,
    review_due: bool = False,
    topic: str | None = None,
) -> list[MistakeRecord]:
    query = db.query(MistakeRecord).filter(MistakeRecord.student_id == student_id)
    if status and status.strip().lower() in ("pending", "mastered"):
        query = query.filter(MistakeRecord.status == status.strip().lower())
    if review_due:
        today = date.today()
        query = query.filter(MistakeRecord.status == "pending").filter(
            or_(MistakeRecord.next_review_date <= today, MistakeRecord.next_review_date.is_(None))
        )
    rows = query.order_by(MistakeRecord.created_at.desc()).all()
    if topic and topic.strip():
        topic_trim = topic.strip()
        rows = [row for row in rows if topic_trim in split_topics(row.topic)]
    return rows


def get_student_mistake(db: Session, student_id: int, mistake_id: int) -> MistakeRecord:
    row = db.get(MistakeRecord, mistake_id)
    if not row or row.student_id != student_id:
        raise StudentPortalServiceError(404, "错题记录不存在")
    return row


def review_student_mistake(db: Session, student_id: int, mistake_id: int) -> MistakeRecord:
    row = get_student_mistake(db, student_id, mistake_id)
    row.review_count = (row.review_count or 0) + 1
    row.next_review_date = date.today() + timedelta(days=REVIEW_INTERVAL_DAYS_NEXT)
    db.commit()
    db.refresh(row)
    return row


def master_student_mistake(db: Session, student_id: int, mistake_id: int) -> MistakeRecord:
    row = get_student_mistake(db, student_id, mistake_id)
    row.status = "mastered"
    if getattr(row, "mastered_at", None) is None:
        row.mastered_at = datetime.now(UTC).replace(tzinfo=None)
    db.commit()
    db.refresh(row)
    return row


def get_student_mastery(db: Session, student_id: int) -> dict:
    pending = (
        db.query(MistakeRecord)
        .filter(
            MistakeRecord.student_id == student_id,
            MistakeRecord.status == "pending",
        )
        .all()
    )
    mastered = (
        db.query(MistakeRecord)
        .filter(
            MistakeRecord.student_id == student_id,
            MistakeRecord.status == "mastered",
        )
        .all()
    )
    weak_points: set[str] = set()
    for mistake in pending:
        weak_points |= split_topics(mistake.topic)
    mastered_points: set[str] = set()
    for mistake in mastered:
        mastered_points |= split_topics(mistake.topic)
    mastered_points -= weak_points
    return {
        "weak_points": sorted(weak_points),
        "mastered_points": sorted(mastered_points),
    }


def get_student_trend(db: Session, student_id: int, weeks: int) -> dict:
    today = date.today()
    week_starts = [week_start(today) - timedelta(weeks=i) for i in range(weeks)]
    week_starts.reverse()
    out = []
    for start in week_starts:
        week_end = start + timedelta(days=7)
        start_dt = datetime.combine(start, datetime.min.time())
        end_dt = datetime.combine(week_end, datetime.min.time())
        new_mistakes = (
            db.query(func.count(MistakeRecord.id))
            .filter(
                MistakeRecord.student_id == student_id,
                MistakeRecord.created_at >= start_dt,
                MistakeRecord.created_at < end_dt,
            )
            .scalar()
            or 0
        )
        new_mastered = (
            db.query(func.count(MistakeRecord.id))
            .filter(
                MistakeRecord.student_id == student_id,
                MistakeRecord.mastered_at.isnot(None),
                MistakeRecord.mastered_at >= start_dt,
                MistakeRecord.mastered_at < end_dt,
            )
            .scalar()
            or 0
        )
        out.append(
            {
                "week_start": start.isoformat(),
                "label": f"{start.month}/{start.day}",
                "new_mistakes": new_mistakes,
                "new_mastered": new_mastered,
            }
        )
    return {"weeks": out}


def _student_owner_id(db: Session, student_id: int) -> int | None:
    """学生的归属教师 ID；学生不存在或未归属教师时为 None（对应不到任何 owner）。"""
    student = db.get(Student, student_id)
    return student.user_id if student is not None else None


def list_student_exams(db: Session, student_id: int) -> list[Exam]:
    owner_id = _student_owner_id(db, student_id)
    if owner_id is None:
        return []
    return (
        db.query(Exam)
        .filter(
            Exam.student_id == student_id,
            Exam.owner_user_id == owner_id,
        )
        .order_by(Exam.created_at.desc())
        .all()
    )


def get_student_exam(db: Session, student_id: int, exam_id: int) -> Exam:
    exam = db.get(Exam, exam_id)
    owner_id = _student_owner_id(db, student_id)
    if (
        not exam
        or exam.student_id != student_id
        or owner_id is None
        or exam.owner_user_id != owner_id
    ):
        # owner 与学生归属教师不一致即视为跨租户脏数据，对学生不可见
        raise StudentPortalServiceError(404, "试卷不存在")
    return exam


def grade_student_exam(db: Session, student_id: int, exam_id: int, student_answers: dict) -> GradeResponse:
    exam = get_student_exam(db, student_id, exam_id)
    if exam.graded_at is not None:
        raise StudentPortalServiceError(400, "已提交过，不可重复提交")
    results = compute_results_from_student_answers(exam, student_answers)
    return grade_exam_core(db, exam, results, student_id, student_answers=student_answers)
