"""
学生端专用接口：登录、当前学生信息、错题本、学情、试卷。所有接口依赖 get_current_student，仅能访问当前登录学生自己的数据。
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.models.base import get_db
from app.models.exam import Exam
from app.models.mistake import MistakeRecord
from app.models.student import Student
from app.schemas.exam_dto import ExamResponse, GradeResponse, SubmitAnswersRequest
from app.schemas.mistake_dto import MistakeResponse
from app.schemas.student_dto import StudentLoginRequest, StudentMeResponse, StudentPasswordUpdate
from app.schemas.user_dto import Token
from app.services.report_pdf_service import build_student_report_pdf_buffer
from app.services.student_portal_service import (
    StudentPortalServiceError,
    get_current_student_from_token,
    get_student_exam as get_student_exam_service,
    get_student_mastery,
    get_student_mistake as get_student_mistake_service,
    get_student_trend,
    grade_student_exam as grade_student_exam_service,
    list_student_exams as list_student_exams_service,
    list_student_mistakes as list_student_mistakes_service,
    login_student,
    master_student_mistake,
    review_student_mistake,
    update_student_password,
)

router = APIRouter()
security_bearer = HTTPBearer(auto_error=False)


def _raise_http_error(exc: StudentPortalServiceError) -> None:
    headers = {"WWW-Authenticate": "Bearer"} if exc.authenticate_header else None
    raise HTTPException(status_code=exc.status_code, detail=exc.detail, headers=headers)


def get_current_student(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_bearer),
    db: Session = Depends(get_db),
) -> Student:
    """从 Bearer Token 解析学生 JWT（type=student, sub=student_id），返回当前学生；失败 401。"""
    try:
        token = credentials.credentials if credentials else None
        return get_current_student_from_token(db, token)
    except StudentPortalServiceError as exc:
        _raise_http_error(exc)


@router.post("/token", response_model=Token)
def student_login(
    body: StudentLoginRequest,
    db: Session = Depends(get_db),
) -> Token:
    """学生端登录：登录码 + 密码（若已设置）。返回 JWT access_token。"""
    try:
        return login_student(db, body.login_code, body.password)
    except StudentPortalServiceError as exc:
        _raise_http_error(exc)


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
    try:
        return update_student_password(db, current_student, body.old_password, body.new_password)
    except StudentPortalServiceError as exc:
        _raise_http_error(exc)


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
    return list_student_mistakes_service(
        db,
        current_student.id,
        status=status,
        review_due=review_due,
        topic=topic,
    )


@router.get("/mistakes/{mistake_id}", response_model=MistakeResponse)
def get_student_mistake(
    mistake_id: int,
    db: Session = Depends(get_db),
    current_student: Student = Depends(get_current_student),
) -> MistakeRecord:
    """获取单条错题（仅本人）。"""
    try:
        return get_student_mistake_service(db, current_student.id, mistake_id)
    except StudentPortalServiceError as exc:
        _raise_http_error(exc)


@router.put("/mistakes/{mistake_id}/review", response_model=MistakeResponse)
def student_mistake_review(
    mistake_id: int,
    db: Session = Depends(get_db),
    current_student: Student = Depends(get_current_student),
) -> MistakeRecord:
    """复习一次：review_count +1，下次复习日延 3 天。"""
    try:
        return review_student_mistake(db, current_student.id, mistake_id)
    except StudentPortalServiceError as exc:
        _raise_http_error(exc)


@router.put("/mistakes/{mistake_id}/master", response_model=MistakeResponse)
def student_mistake_master(
    mistake_id: int,
    db: Session = Depends(get_db),
    current_student: Student = Depends(get_current_student),
) -> MistakeRecord:
    """标记为已掌握。"""
    try:
        return master_student_mistake(db, current_student.id, mistake_id)
    except StudentPortalServiceError as exc:
        _raise_http_error(exc)


# ----- 学情分析 -----


@router.get("/analysis/mastery")
def student_analysis_mastery(
    db: Session = Depends(get_db),
    current_student: Student = Depends(get_current_student),
):
    """当前学生的知识点掌握情况（弱项 / 已掌握）。"""
    return get_student_mastery(db, current_student.id)


@router.get("/analysis/trend")
def student_analysis_trend(
    weeks: int = Query(8, ge=1, le=26),
    db: Session = Depends(get_db),
    current_student: Student = Depends(get_current_student),
):
    """当前学生的学情趋势（按周新增错题数、新掌握数）。"""
    return get_student_trend(db, current_student.id, weeks)


# ----- 试卷 -----


@router.get("/exams", response_model=list[ExamResponse])
def list_student_exams(
    db: Session = Depends(get_db),
    current_student: Student = Depends(get_current_student),
) -> list[Exam]:
    """当前学生的试卷列表（仅分配给自己的）。"""
    return list_student_exams_service(db, current_student.id)


@router.get("/exams/{exam_id}", response_model=ExamResponse)
def get_student_exam(
    exam_id: int,
    db: Session = Depends(get_db),
    current_student: Student = Depends(get_current_student),
) -> Exam:
    """获取单份试卷（仅本人）。"""
    try:
        return get_student_exam_service(db, current_student.id, exam_id)
    except StudentPortalServiceError as exc:
        _raise_http_error(exc)


@router.post("/exams/{exam_id}/grade", response_model=GradeResponse)
def student_grade_exam(
    exam_id: int,
    body: SubmitAnswersRequest,
    db: Session = Depends(get_db),
    current_student: Student = Depends(get_current_student),
) -> GradeResponse:
    """学生端提交答案，系统判题后写入批改结果与错题本；使用当前登录学生 ID。已提交的作业不可重复提交。"""
    try:
        return grade_student_exam_service(db, current_student.id, exam_id, body.student_answers)
    except StudentPortalServiceError as exc:
        _raise_http_error(exc)
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
        buffer = build_student_report_pdf_buffer(db, current_student)
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
