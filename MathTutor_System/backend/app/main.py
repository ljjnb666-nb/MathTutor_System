"""
MathTutor_System - 初中数学备课助手
FastAPI 应用入口
"""
import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

# 启动时最先加载 backend/.env，确保 LLM_HTTPS_PROXY 等在后端进程中生效（与启动目录无关）
_backend_dir = Path(__file__).resolve().parent.parent
_env_file = _backend_dir / ".env"
if _env_file.exists():
    from dotenv import load_dotenv
    load_dotenv(_env_file)

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.core.config import CORS_ORIGINS
from app.models.base import Base, engine, SessionLocal
from app.models.exam import Exam  # noqa: F401 - 注册模型以创建表
from app.models.mistake import MistakeRecord  # noqa: F401 - 注册模型以创建表
from app.models.order import Order  # noqa: F401 - 注册模型以创建表
from app.models.plan import Plan  # noqa: F401 - 注册模型以创建表
from app.models.question import Question  # noqa: F401 - 注册模型以创建表
from app.models.question_bank import QuestionBank  # noqa: F401 - 注册模型以创建表
from app.models.student import Student  # noqa: F401 - 注册模型以创建表
from app.models.subscription import Subscription  # noqa: F401 - 注册模型以创建表
from app.models.subscription_history import SubscriptionHistory  # noqa: F401 - 注册模型以创建表
from app.models.user import User  # noqa: F401 - 注册模型以创建表
from app.models.chat_session import ChatMessage, ChatSession  # noqa: F401 - 注册模型以创建表
from app.models.schedule import Schedule  # noqa: F401 - 注册模型以创建表


def _ensure_questions_student_id():
    """若 questions 表缺少 student_id 列则添加（兼容旧库）。"""
    from sqlalchemy import text
    with engine.connect() as conn:
        r = conn.execute(text("SELECT name FROM pragma_table_info('questions') WHERE name = 'student_id'"))
        if r.fetchone() is None:
            conn.execute(text("ALTER TABLE questions ADD COLUMN student_id INTEGER"))
            conn.commit()


def _ensure_question_bank_images():
    """若 question_bank 表缺少 images 列则添加（兼容旧库，题目附图持久化）。"""
    from sqlalchemy import text
    if "sqlite" not in str(engine.url):
        return
    with engine.connect() as conn:
        r = conn.execute(text("SELECT name FROM pragma_table_info('question_bank') WHERE name = 'images'"))
        if r.fetchone() is None:
            conn.execute(text("ALTER TABLE question_bank ADD COLUMN images TEXT DEFAULT '[]'"))
            conn.commit()


def _ensure_order_period_months():
    """若 orders 表缺少 period_months 列则添加（兼容旧库）。"""
    from sqlalchemy import text
    if "sqlite" not in str(engine.url):
        return
    with engine.connect() as conn:
        r = conn.execute(text("SELECT name FROM pragma_table_info('orders') WHERE name = 'period_months'"))
        if r.fetchone() is None:
            conn.execute(text("ALTER TABLE orders ADD COLUMN period_months INTEGER DEFAULT 1 NOT NULL"))
            conn.commit()


def _ensure_mistake_next_review_date():
    """若 mistake_records 表缺少 next_review_date 列则添加（复习计划/今日待复习）。"""
    from sqlalchemy import text
    if "sqlite" not in str(engine.url):
        return
    with engine.connect() as conn:
        r = conn.execute(text("SELECT name FROM pragma_table_info('mistake_records') WHERE name = 'next_review_date'"))
        if r.fetchone() is None:
            conn.execute(text("ALTER TABLE mistake_records ADD COLUMN next_review_date DATE"))
            conn.commit()


def _ensure_mistake_mastered_at():
    """若 mistake_records 表缺少 mastered_at 列则添加（学情趋势：标记掌握时间）。"""
    from sqlalchemy import text
    if "sqlite" not in str(engine.url):
        return
    with engine.connect() as conn:
        r = conn.execute(text("SELECT name FROM pragma_table_info('mistake_records') WHERE name = 'mastered_at'"))
        if r.fetchone() is None:
            conn.execute(text("ALTER TABLE mistake_records ADD COLUMN mastered_at DATETIME"))
            conn.commit()


def _ensure_mistake_options():
    """若 mistake_records 表缺少 options 列则添加（选择题选项，JSON 存为 TEXT）。"""
    from sqlalchemy import text
    if "sqlite" not in str(engine.url):
        return
    with engine.connect() as conn:
        r = conn.execute(text("SELECT name FROM pragma_table_info('mistake_records') WHERE name = 'options'"))
        if r.fetchone() is None:
            conn.execute(text("ALTER TABLE mistake_records ADD COLUMN options TEXT"))
            conn.commit()


def _ensure_schedule_recurrence_columns():
    """若 schedules 表缺少重复排课相关列则添加（兼容旧库）。"""
    from sqlalchemy import text
    if "sqlite" not in str(engine.url):
        return
    with engine.connect() as conn:
        info = conn.execute(text("SELECT name FROM pragma_table_info('schedules')"))
        names = {row[0] for row in info.fetchall()}
        if "recurrence_type" not in names:
            conn.execute(text("ALTER TABLE schedules ADD COLUMN recurrence_type VARCHAR(16)"))
            conn.commit()
        if "recurrence_weekdays" not in names:
            conn.execute(text("ALTER TABLE schedules ADD COLUMN recurrence_weekdays TEXT"))
            conn.commit()


def _init_plans_and_subscriptions():
    """无套餐时插入默认 plans；为无订阅的用户创建免费版订阅。"""
    db = SessionLocal()
    try:
        plan_count = db.query(Plan).count()
        if plan_count == 0:
            db.add(Plan(
                code="free",
                name="免费版",
                max_students=3,
                features={"magic_ppt": False, "rag": False},
                sort_order=0,
                price_monthly=0,
                price_yearly=0,
            ))
            db.add(Plan(
                code="basic",
                name="基础版",
                max_students=15,
                features={"magic_ppt": False, "rag": True},
                sort_order=1,
                price_monthly=19.9,
                price_yearly=199,
            ))
            db.add(Plan(
                code="pro",
                name="专业版",
                max_students=50,
                features={"magic_ppt": True, "rag": True},
                sort_order=2,
                price_monthly=29.9,
                price_yearly=299,
            ))
            db.commit()
        else:
            # 同步已存在套餐的定价（基础版 19.9，专业版 29.9）
            for code, monthly, yearly in [("basic", 19.9, 199), ("pro", 29.9, 299)]:
                p = db.query(Plan).filter(Plan.code == code).first()
                if p and (p.price_monthly != monthly or p.price_yearly != yearly):
                    p.price_monthly = monthly
                    p.price_yearly = yearly
            db.commit()
        free_plan = db.query(Plan).filter(Plan.code == "free").first()
        if not free_plan:
            return
        for user in db.query(User).all():
            sub = db.query(Subscription).filter(Subscription.user_id == user.id).first()
            if sub is None:
                db.add(Subscription(
                    user_id=user.id,
                    plan_id=free_plan.id,
                    status="active",
                ))
                db.commit()
    finally:
        db.close()


def _ensure_student_login_columns():
    """若 students 表缺少 login_code、hashed_password 列则添加（学生端登录）。"""
    from sqlalchemy import text
    if "sqlite" not in str(engine.url):
        return
    with engine.connect() as conn:
        info = conn.execute(text("SELECT name FROM pragma_table_info('students')"))
        names = {row[0] for row in info.fetchall()}
        if "login_code" not in names:
            conn.execute(text("ALTER TABLE students ADD COLUMN login_code VARCHAR(32)"))
            conn.commit()
        if "hashed_password" not in names:
            conn.execute(text("ALTER TABLE students ADD COLUMN hashed_password VARCHAR(256)"))
            conn.commit()


def _ensure_exam_graded_columns():
    """若 exams 表缺少 graded_at、grade_summary 列则添加（学生做题提交状态，供教师端查看）。"""
    from sqlalchemy import text
    if "sqlite" not in str(engine.url):
        return
    with engine.connect() as conn:
        info = conn.execute(text("SELECT name FROM pragma_table_info('exams')"))
        names = {row[0] for row in info.fetchall()}
        if "graded_at" not in names:
            conn.execute(text("ALTER TABLE exams ADD COLUMN graded_at DATETIME"))
            conn.commit()
        if "grade_summary" not in names:
            conn.execute(text("ALTER TABLE exams ADD COLUMN grade_summary TEXT"))
            conn.commit()
        if "grade_results" not in names:
            conn.execute(text("ALTER TABLE exams ADD COLUMN grade_results TEXT"))
            conn.commit()


def _ensure_exam_assignment_date():
    """若 exams 表缺少 assignment_date 列则添加（作业管理按日期）。"""
    from sqlalchemy import text
    if "sqlite" not in str(engine.url):
        return
    with engine.connect() as conn:
        info = conn.execute(text("SELECT name FROM pragma_table_info('exams')"))
        names = {row[0] for row in info.fetchall()}
        if "assignment_date" not in names:
            conn.execute(text("ALTER TABLE exams ADD COLUMN assignment_date DATE"))
            conn.commit()


def _ensure_plan_features():
    """确保 free/basic/pro 套餐的 features 字段正确（旧库可能为空或缺 key），便于 require_feature 校验生效。"""
    db = SessionLocal()
    try:
        defaults = [
            ("free", {"magic_ppt": False, "rag": False}),
            ("basic", {"magic_ppt": False, "rag": True}),
            ("pro", {"magic_ppt": True, "rag": True}),
        ]
        for code, want in defaults:
            plan = db.query(Plan).filter(Plan.code == code).first()
            if plan is None:
                continue
            current = plan.features if isinstance(plan.features, dict) else {}
            if current.get("rag") != want.get("rag") or current.get("magic_ppt") != want.get("magic_ppt"):
                plan.features = want
                db.commit()
    finally:
        db.close()


def _drop_mistake_records_if_old_schema():
    """
    若 mistake_records 表存在且为旧 schema（含 is_solved 或 question_id），则删除该表，
    以便 create_all 用新模型重建。仅 SQLite 本地开发；生产可改用迁移脚本。
    """
    from sqlalchemy import text
    if "sqlite" not in str(engine.url):
        return
    with engine.connect() as conn:
        r = conn.execute(text(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='mistake_records'"
        ))
        if r.fetchone() is None:
            return
        info = conn.execute(text("SELECT name FROM pragma_table_info('mistake_records')"))
        col_names = {row[0] for row in info.fetchall()}
        if "status" in col_names and "topic" in col_names:
            return
        conn.execute(text("DROP TABLE mistake_records"))
        conn.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if os.getenv("LLM_HTTPS_PROXY") or os.getenv("HTTPS_PROXY"):
        print("[Gemini] 代理已配置，请求将经代理发出（LLM_HTTPS_PROXY/HTTPS_PROXY）")
    try:
        _drop_mistake_records_if_old_schema()
    except Exception:
        pass
    Base.metadata.create_all(bind=engine)
    try:
        _ensure_questions_student_id()
    except Exception:
        pass
    try:
        _ensure_question_bank_images()
    except Exception:
        pass
    try:
        _ensure_schedule_recurrence_columns()
    except Exception:
        pass
    try:
        _ensure_order_period_months()
    except Exception:
        pass
    try:
        _ensure_mistake_next_review_date()
        _ensure_mistake_mastered_at()
        _ensure_mistake_options()
    except Exception:
        pass
    try:
        _init_plans_and_subscriptions()
    except Exception:
        pass
    try:
        _ensure_student_login_columns()
    except Exception:
        pass
    try:
        _ensure_exam_graded_columns()
    except Exception:
        pass
    try:
        _ensure_exam_assignment_date()
    except Exception:
        pass
    try:
        _ensure_plan_features()
    except Exception:
        pass
    yield


app = FastAPI(
    title="MathTutor_System",
    description="初中数学备课助手 API",
    version="0.1.0",
    lifespan=lifespan,
)

_default_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]
allow_origins = _default_origins + CORS_ORIGINS if CORS_ORIGINS else _default_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """对易出错的接口做兜底：避免 500 导致前端白屏。"""
    if isinstance(exc, HTTPException):
        raise exc
    path = request.url.path.rstrip("/")
    if request.method == "GET" and path == "/api/rag/documents":
        logging.getLogger(__name__).warning(
            "GET /api/rag/documents 异常，返回空列表: %s", exc, exc_info=True
        )
        return JSONResponse(content={"documents": []}, status_code=200)
    if request.method == "GET" and path == "/api/users/me":
        logging.getLogger(__name__).warning(
            "GET /api/users/me 异常，返回 401: %s", exc, exc_info=True
        )
        return JSONResponse(
            content={"detail": "认证失败，请重新登录"},
            status_code=401,
            headers={"WWW-Authenticate": "Bearer"},
        )
    return JSONResponse(
        content={"detail": str(exc) or "Internal server error"},
        status_code=500,
    )


@app.get("/")
def root():
    return {"message": "MathTutor_System API", "status": "ok"}


@app.get("/favicon.ico")
def favicon():
    """避免浏览器自动请求 favicon 时出现 404。"""
    from fastapi.responses import Response
    return Response(status_code=204)


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.get("/api/health")
def api_health():
    """供前端代理探测后端是否可用，不依赖数据库或 ChromaDB。"""
    return {"ok": True}
