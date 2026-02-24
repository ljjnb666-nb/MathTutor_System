"""
学生端专用接口：登录、当前学生信息、错题本、学情、试卷。所有接口依赖 get_current_student，仅能访问当前登录学生自己的数据。
"""
import io
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.endpoints.exams import grade_exam_core, _compute_results_from_student_answers
from app.api.endpoints.reports import _generate_pdf_report, _get_chinese_font_name
from app.core.security import create_access_token, decode_access_token, get_password_hash, verify_password
from app.models.base import get_db
from app.models.exam import Exam
from app.models.mistake import MistakeRecord
from app.models.student import Student
from app.schemas.exam_dto import ExamResponse, GradeResponse, SubmitAnswersRequest
from app.schemas.mistake_dto import MistakeResponse
from app.schemas.student_dto import StudentLoginRequest, StudentMeResponse, StudentPasswordUpdate
from app.schemas.user_dto import Token

REVIEW_INTERVAL_DAYS_NEXT = 3

router = APIRouter()
security_bearer = HTTPBearer(auto_error=False)


def get_current_student(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_bearer),
    db: Session = Depends(get_db),
) -> Student:
    """从 Bearer Token 解析学生 JWT（type=student, sub=student_id），返回当前学生；失败 401。"""
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
    if payload.get("type") != "student":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的 Token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的 Token 载荷",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        student_id = int(sub)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的 Token 载荷",
            headers={"WWW-Authenticate": "Bearer"},
        )
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="学生不存在",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not student.login_code or not student.login_code.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="该账号未开通学生端登录",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if student.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="学生不存在",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return student


@router.post("/token", response_model=Token)
def student_login(
    body: StudentLoginRequest,
    db: Session = Depends(get_db),
) -> Token:
    """学生端登录：登录码 + 密码（若已设置）。返回 JWT access_token。"""
    login_code = body.login_code.strip()
    student = db.query(Student).filter(Student.login_code == login_code).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录码或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if student.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录码或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if student.hashed_password and student.hashed_password.strip():
        if not body.password or not body.password.strip():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="请输入密码",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if not verify_password(body.password, student.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="登录码或密码错误",
                headers={"WWW-Authenticate": "Bearer"},
            )
    access_token = create_access_token(
        data={"sub": str(student.id), "type": "student"},
    )
    return Token(access_token=access_token, token_type="bearer")


@router.get("/me", response_model=StudentMeResponse)
def student_me(current_student: Student = Depends(get_current_student)) -> Student:
    """获取当前登录学生信息（不含登录码与密码）。"""
    return current_student


@router.put("/me/password")
def student_update_password(
    body: StudentPasswordUpdate,
    db: Session = Depends(get_db),
    current_student: Student = Depends(get_current_student),
):
    """学生修改自己的登录密码（仅当教师已为学生设置过密码时可用）。"""
    if not current_student.hashed_password or not current_student.hashed_password.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="您尚未设置密码，无法修改。请联系老师在学生管理中为您设置密码。",
        )
    if not verify_password(body.old_password, current_student.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="当前密码错误",
        )
    current_student.hashed_password = get_password_hash(body.new_password)
    db.commit()
    return {"detail": "密码已修改"}


def _split_topics(topic_str: str | None) -> set[str]:
    """将组合知识点字符串拆分为集合。"""
    if not topic_str or not str(topic_str).strip():
        return set()
    raw = str(topic_str).strip().replace("\u3000", " ").replace("\uff0c", ",")
    out: set[str] = set()
    for sep in ["＋", "、", "+"]:
        raw = raw.replace(sep, "+")
    for part in raw.split("+"):
        t = " ".join(part.split()).strip()
        if t:
            out.add(t)
    return out


def _week_start(d: date) -> date:
    """返回 d 所在周的周一。"""
    return d - timedelta(days=d.weekday())


# ----- 错题本 -----


@router.get("/mistakes", response_model=list[MistakeResponse])
def list_student_mistakes(
    status: str | None = Query(None, description="按状态筛选：pending | mastered"),
    review_due: bool = Query(False, description="仅今日待复习"),
    topic: str | None = Query(None, description="按知识点筛选（匹配错题的知识点之一）"),
    db: Session = Depends(get_db),
    current_student: Student = Depends(get_current_student),
) -> list[MistakeRecord]:
    """获取当前学生的错题列表。"""
    q = db.query(MistakeRecord).filter(MistakeRecord.student_id == current_student.id)
    if status and status.strip().lower() in ("pending", "mastered"):
        q = q.filter(MistakeRecord.status == status.strip().lower())
    if review_due:
        today = date.today()
        q = q.filter(MistakeRecord.status == "pending").filter(
            or_(MistakeRecord.next_review_date <= today, MistakeRecord.next_review_date.is_(None))
        )
    rows = q.order_by(MistakeRecord.created_at.desc()).all()
    if topic and topic.strip():
        topic_trim = topic.strip()
        rows = [r for r in rows if topic_trim in _split_topics(r.topic)]
    return rows


@router.get("/mistakes/{mistake_id}", response_model=MistakeResponse)
def get_student_mistake(
    mistake_id: int,
    db: Session = Depends(get_db),
    current_student: Student = Depends(get_current_student),
) -> MistakeRecord:
    """获取单条错题（仅本人）。"""
    row = db.get(MistakeRecord, mistake_id)
    if not row or row.student_id != current_student.id:
        raise HTTPException(status_code=404, detail="错题记录不存在")
    return row


@router.put("/mistakes/{mistake_id}/review", response_model=MistakeResponse)
def student_mistake_review(
    mistake_id: int,
    db: Session = Depends(get_db),
    current_student: Student = Depends(get_current_student),
) -> MistakeRecord:
    """复习一次：review_count +1，下次复习日延 3 天。"""
    row = db.get(MistakeRecord, mistake_id)
    if not row or row.student_id != current_student.id:
        raise HTTPException(status_code=404, detail="错题记录不存在")
    row.review_count = (row.review_count or 0) + 1
    row.next_review_date = date.today() + timedelta(days=REVIEW_INTERVAL_DAYS_NEXT)
    db.commit()
    db.refresh(row)
    return row


@router.put("/mistakes/{mistake_id}/master", response_model=MistakeResponse)
def student_mistake_master(
    mistake_id: int,
    db: Session = Depends(get_db),
    current_student: Student = Depends(get_current_student),
) -> MistakeRecord:
    """标记为已掌握。"""
    row = db.get(MistakeRecord, mistake_id)
    if not row or row.student_id != current_student.id:
        raise HTTPException(status_code=404, detail="错题记录不存在")
    row.status = "mastered"
    if getattr(row, "mastered_at", None) is None:
        row.mastered_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


# ----- 学情分析 -----


@router.get("/analysis/mastery")
def student_analysis_mastery(
    db: Session = Depends(get_db),
    current_student: Student = Depends(get_current_student),
):
    """当前学生的知识点掌握情况（弱项 / 已掌握）。"""
    pending = (
        db.query(MistakeRecord)
        .filter(
            MistakeRecord.student_id == current_student.id,
            MistakeRecord.status == "pending",
        )
        .all()
    )
    mastered = (
        db.query(MistakeRecord)
        .filter(
            MistakeRecord.student_id == current_student.id,
            MistakeRecord.status == "mastered",
        )
        .all()
    )
    weak_points: set[str] = set()
    for m in pending:
        weak_points |= _split_topics(m.topic)
    mastered_points: set[str] = set()
    for m in mastered:
        mastered_points |= _split_topics(m.topic)
    mastered_points -= weak_points
    return {
        "weak_points": sorted(weak_points),
        "mastered_points": sorted(mastered_points),
    }


@router.get("/analysis/trend")
def student_analysis_trend(
    weeks: int = Query(8, ge=1, le=26),
    db: Session = Depends(get_db),
    current_student: Student = Depends(get_current_student),
):
    """当前学生的学情趋势（按周新增错题数、新掌握数）。"""
    today = date.today()
    week_starts = [_week_start(today) - timedelta(weeks=i) for i in range(weeks)]
    week_starts.reverse()
    out = []
    for ws in week_starts:
        week_end = ws + timedelta(days=7)
        ws_dt = datetime.combine(ws, datetime.min.time())
        we_dt = datetime.combine(week_end, datetime.min.time())
        new_mistakes = (
            db.query(func.count(MistakeRecord.id))
            .filter(
                MistakeRecord.student_id == current_student.id,
                MistakeRecord.created_at >= ws_dt,
                MistakeRecord.created_at < we_dt,
            )
            .scalar()
            or 0
        )
        new_mastered = (
            db.query(func.count(MistakeRecord.id))
            .filter(
                MistakeRecord.student_id == current_student.id,
                MistakeRecord.mastered_at.isnot(None),
                MistakeRecord.mastered_at >= ws_dt,
                MistakeRecord.mastered_at < we_dt,
            )
            .scalar()
            or 0
        )
        out.append({
            "week_start": ws.isoformat(),
            "label": f"{ws.month}/{ws.day}",
            "new_mistakes": new_mistakes,
            "new_mastered": new_mastered,
        })
    return {"weeks": out}


# ----- 试卷 -----


@router.get("/exams", response_model=list[ExamResponse])
def list_student_exams(
    db: Session = Depends(get_db),
    current_student: Student = Depends(get_current_student),
) -> list[Exam]:
    """当前学生的试卷列表（仅分配给自己的）。"""
    return (
        db.query(Exam)
        .filter(Exam.student_id == current_student.id)
        .order_by(Exam.created_at.desc())
        .all()
    )


@router.get("/exams/{exam_id}", response_model=ExamResponse)
def get_student_exam(
    exam_id: int,
    db: Session = Depends(get_db),
    current_student: Student = Depends(get_current_student),
) -> Exam:
    """获取单份试卷（仅本人）。"""
    row = db.get(Exam, exam_id)
    if not row or row.student_id != current_student.id:
        raise HTTPException(status_code=404, detail="试卷不存在")
    return row


@router.post("/exams/{exam_id}/grade", response_model=GradeResponse)
def student_grade_exam(
    exam_id: int,
    body: SubmitAnswersRequest,
    db: Session = Depends(get_db),
    current_student: Student = Depends(get_current_student),
) -> GradeResponse:
    """学生端提交答案，系统判题后写入批改结果与错题本；使用当前登录学生 ID。已提交的作业不可重复提交。"""
    exam = db.get(Exam, exam_id)
    if not exam or exam.student_id != current_student.id:
        raise HTTPException(status_code=404, detail="试卷不存在")
    if exam.graded_at is not None:
        raise HTTPException(status_code=400, detail="已提交过，不可重复提交")
    try:
        results = _compute_results_from_student_answers(exam, body.student_answers)
        return grade_exam_core(db, exam, results, current_student.id, student_answers=body.student_answers)
    except Exception as e:
        db.rollback()
        import traceback

        traceback.print_exc()
        detail = str(e).strip() or "提交批改结果失败"
        if len(detail) > 300:
            detail = detail[:300] + "..."
        raise HTTPException(status_code=500, detail=detail)


# ----- 学习报告 -----


@router.get("/report/pdf")
def student_report_pdf(
    db: Session = Depends(get_db),
    current_student: Student = Depends(get_current_student),
) -> StreamingResponse:
    """下载当前学生的学情分析报告 PDF。"""
    try:
        total_mistakes = (
            db.query(func.count(MistakeRecord.id))
            .filter(MistakeRecord.student_id == current_student.id)
            .scalar()
            or 0
        )
        unsolved_mistakes = (
            db.query(func.count(MistakeRecord.id))
            .filter(
                MistakeRecord.student_id == current_student.id,
                MistakeRecord.status == "pending",
            )
            .scalar()
            or 0
        )
        font_name = _get_chinese_font_name()
        buffer = io.BytesIO()
        _generate_pdf_report(
            current_student, total_mistakes, unsolved_mistakes, font_name, buffer
        )
        buffer.seek(0)
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={
                "Content-Disposition": 'attachment; filename="学情报告.pdf"',
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"生成报告失败: {str(e)}")
