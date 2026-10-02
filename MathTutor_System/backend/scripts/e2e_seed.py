"""Test-only E2E seed CLI.

Populates a dedicated E2E database (tutorpro_e2e) with the minimal deterministic
fixture set required by the Playwright REAL_E2E journeys: admin, teacher,
student (login code + password), assigned exam with stable questions, one
pre-existing mistake and one schedule row.

Hard guards (fail closed):
- requires TUTORPRO_E2E=1 in the environment;
- refuses to run when ENV=production;
- requires DATABASE_URL to point at a database explicitly named tutorpro_e2e.

The credentials come from env (E2E_ADMIN_PASSWORD, E2E_TEACHER_PASSWORD,
E2E_STUDENT_PASSWORD, E2E_STUDENT_LOGIN_CODE) with test-only defaults; they are
only valid inside a guarded tutorpro_e2e database and are never referenced by
production code paths.
"""

import os
import sys
from datetime import date, timedelta
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

E2E_REQUIRED_DB_NAME = "tutorpro_e2e"

ADMIN_USERNAME = "e2e_admin"
TEACHER_USERNAME = "e2e_teacher"
STUDENT_NAME = "E2E学生"

EXAM_TITLE = "E2E 试卷 - 一次函数"
SEED_MISTAKE_CONTENT = "E2E 预置错题：解方程 2x + 1 = 5，求 x。"
SCHEDULE_SUBJECT = "E2E 数学辅导"

EXAM_QUESTIONS = [
    {
        "content": "E2E-第1题 计算：1 + 2 = ?",
        "options": ["3", "4", "5", "6"],
        "answer": "A",
        "analysis": "1 + 2 = 3，选 A。",
        "knowledge_point": "有理数",
        "question_type": "选择",
        "difficulty": "L3",
        "score": 10,
    },
    {
        "content": "E2E-第2题 计算：5 × 3 = ?",
        "options": ["10", "15", "20", "25"],
        "answer": "B",
        "analysis": "5 × 3 = 15，选 B。",
        "knowledge_point": "有理数",
        "question_type": "选择",
        "difficulty": "L3",
        "score": 10,
    },
    {
        "content": "E2E-第3题 填空：12 - 5 = ?",
        "options": [],
        "answer": "7",
        "analysis": "12 - 5 = 7。",
        "knowledge_point": "有理数",
        "question_type": "填空",
        "difficulty": "L3",
        "score": 10,
    },
]


def fail(message: str) -> None:
    print(f"e2e_seed REFUSES: {message}", file=sys.stderr)
    raise SystemExit(2)


def guard() -> str:
    if os.environ.get("TUTORPRO_E2E") != "1":
        fail("TUTORPRO_E2E=1 must be set to run the E2E seed")
    database_url = os.environ.get("DATABASE_URL", "")
    if not database_url:
        fail("DATABASE_URL must be provided")
    if os.environ.get("ENV", "").strip().lower() == "production":
        fail("ENV=production is forbidden for the E2E seed")
    # Accept optional driver suffix (+psycopg) and query strings, but require
    # the final database name to be exactly tutorpro_e2e.
    from urllib.parse import urlsplit, urlunsplit

    parsed = urlsplit(database_url)
    db_name = parsed.path.lstrip("/").split("?")[0]
    if db_name != E2E_REQUIRED_DB_NAME:
        fail(f"DATABASE_URL must point at the {E2E_REQUIRED_DB_NAME} database (got: {db_name!r})")
    return database_url


def bootstrap_schema() -> None:
    """Deterministic empty-database bootstrap: current-model schema + stamp head.

    Mirrors the project's own bootstrap path (Base.metadata for an initialized
    database, then alembic reconciliation). A freshly created schema from the
    current models is by definition identical to the head migration state.
    """
    import app.models  # noqa: F401  (registers every model on Base.metadata)
    from app.models.base import Base, engine

    Base.metadata.create_all(bind=engine)
    alembic_cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    command.stamp(alembic_cfg, "head")


def upsert_user(db: Session, username: str, password: str, role: str):
    from app.core.security import get_password_hash
    from app.models.user import User

    user = db.query(User).filter(User.username == username).first()
    if user is None:
        user = User(username=username, hashed_password=get_password_hash(password), role=role)
        db.add(user)
        db.flush()
    else:
        user.hashed_password = get_password_hash(password)
        user.role = role
        user.is_active = True
    return user


def main() -> int:
    database_url = guard()
    os.environ["DATABASE_URL"] = database_url

    bootstrap_schema()

    from app.core.db_seed import seed_default_data
    from app.core.security import get_password_hash
    from app.models.base import SessionLocal
    from app.models.exam import Exam
    from app.models.mistake import MistakeRecord
    from app.models.schedule import Schedule
    from app.models.student import Student
    from app.models.subscription import Subscription
    from app.models.user import User

    admin_password = os.environ.get("E2E_ADMIN_PASSWORD", "e2e-admin-pass-123")
    teacher_password = os.environ.get("E2E_TEACHER_PASSWORD", "e2e-teacher-pass-123")
    student_password = os.environ.get("E2E_STUDENT_PASSWORD", "e2e-student-pass-123")
    student_login_code = os.environ.get("E2E_STUDENT_LOGIN_CODE", "E2E-STU-001")

    db = SessionLocal()
    try:
        seed_default_data()

        from app.models.plan import Plan

        admin = upsert_user(db, ADMIN_USERNAME, admin_password, "admin")
        teacher = upsert_user(db, TEACHER_USERNAME, teacher_password, "teacher")

        pro_plan = db.query(Plan).filter(Plan.code == "pro").first()
        subscription = db.query(Subscription).filter(Subscription.user_id == teacher.id).first()
        if subscription is None:
            subscription = Subscription(user_id=teacher.id, plan_id=pro_plan.id, status="active")
            db.add(subscription)
        else:
            subscription.plan_id = pro_plan.id
            subscription.status = "active"

        student = db.query(Student).filter(Student.login_code == student_login_code).first()
        if student is None:
            student = Student(
                user_id=teacher.id,
                name=STUDENT_NAME,
                grade="八年级",
                class_name="1班",
                tags=[],
                login_code=student_login_code,
                hashed_password=get_password_hash(student_password),
            )
            db.add(student)
            db.flush()
        else:
            student.user_id = teacher.id
            student.hashed_password = get_password_hash(student_password)

        today = date.today()

        exam = db.query(Exam).filter(Exam.title == EXAM_TITLE, Exam.owner_user_id == teacher.id).first()
        if exam is not None:
            db.delete(exam)
            db.flush()
        exam = Exam(
            owner_user_id=teacher.id,
            student_id=student.id,
            title=EXAM_TITLE,
            questions=EXAM_QUESTIONS,
            assignment_date=today,
        )
        db.add(exam)

        seed_mistake = db.query(MistakeRecord).filter(MistakeRecord.content == SEED_MISTAKE_CONTENT).first()
        if seed_mistake is not None:
            db.delete(seed_mistake)
            db.flush()
        db.add(MistakeRecord(
            student_id=student.id,
            topic="一次函数",
            source="手动录入",
            content=SEED_MISTAKE_CONTENT,
            options=None,
            solution="x = 2",
            status="pending",
            review_count=0,
            next_review_date=today + timedelta(days=1),
        ))

        schedule = db.query(Schedule).filter(Schedule.user_id == teacher.id, Schedule.subject == SCHEDULE_SUBJECT).first()
        if schedule is None:
            db.add(Schedule(
                user_id=teacher.id,
                student_id=student.id,
                schedule_date=today + timedelta(days=1),
                start_time="10:00",
                end_time="11:00",
                subject=SCHEDULE_SUBJECT,
                note="E2E seed fixture",
            ))

        db.commit()
        print(
            "e2e_seed OK: "
            f"admin={ADMIN_USERNAME}, teacher={TEACHER_USERNAME}, "
            f"student_login_code={student_login_code}, exam='{EXAM_TITLE}'"
        )
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
