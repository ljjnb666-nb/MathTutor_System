"""Business logic for the student-facing portal."""
from datetime import date, datetime, timedelta

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.security import create_access_token, decode_access_token, get_password_hash, verify_password
from app.models.exam import Exam
from app.models.mistake import MistakeRecord
from app.models.student import Student
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


def get_current_student_from_token(db: Session, token: str | None) -> Student:
    if not token:
        raise _auth_error("未提供认证信息")
    payload = decode_access_token(token)
    if not payload:
        raise _auth_error("无效或过期的 Token")
    if payload.get("type") != "student":
        raise _auth_error("无效的 Token")

    sub = payload.get("sub")
    if not sub:
        raise _auth_error("无效的 Token 载荷")
    try:
        student_id = int(sub)
    except (TypeError, ValueError):
        raise _auth_error("无效的 Token 载荷")

    student = db.get(Student, student_id)
    if not student:
        raise _auth_error("学生不存在")
    if not student.login_code or not student.login_code.strip():
        raise _auth_error("该账号未开通学生端登录")
    if student.user_id is None:
        raise _auth_error("学生不存在")
    return student


def login_student(db: Session, login_code: str, password: str | None) -> Token:
    student = db.query(Student).filter(Student.login_code == login_code.strip()).first()
    if not student or student.user_id is None:
        raise _auth_error("登录码或密码错误")

    if student.hashed_password and student.hashed_password.strip():
        if not password or not password.strip():
            raise _auth_error("请输入密码")
        if not verify_password(password, student.hashed_password):
            raise _auth_error("登录码或密码错误")

    access_token = create_access_token(data={"sub": str(student.id), "type": "student"})
    return Token(access_token=access_token, token_type="bearer")


def update_student_password(db: Session, student: Student, old_password: str, new_password: str) -> dict:
    if not student.hashed_password or not student.hashed_password.strip():
        raise StudentPortalServiceError(400, "您尚未设置密码，无法修改。请联系老师在学生管理中为您设置密码。")
    if not verify_password(old_password, student.hashed_password):
        raise StudentPortalServiceError(400, "当前密码错误")
    student.hashed_password = get_password_hash(new_password)
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
        row.mastered_at = datetime.utcnow()
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


def list_student_exams(db: Session, student_id: int) -> list[Exam]:
    return db.query(Exam).filter(Exam.student_id == student_id).order_by(Exam.created_at.desc()).all()


def get_student_exam(db: Session, student_id: int, exam_id: int) -> Exam:
    exam = db.get(Exam, exam_id)
    if not exam or exam.student_id != student_id:
        raise StudentPortalServiceError(404, "试卷不存在")
    return exam


def grade_student_exam(db: Session, student_id: int, exam_id: int, student_answers: dict) -> GradeResponse:
    exam = get_student_exam(db, student_id, exam_id)
    if exam.graded_at is not None:
        raise StudentPortalServiceError(400, "已提交过，不可重复提交")
    results = compute_results_from_student_answers(exam, student_answers)
    return grade_exam_core(db, exam, results, student_id, student_answers=student_answers)
