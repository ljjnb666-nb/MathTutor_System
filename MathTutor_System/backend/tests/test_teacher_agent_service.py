from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.deps import LLMConfig
from app.models.agent_run import AgentRun
from app.models.base import Base
from app.models.mistake import MistakeRecord
from app.models.plan import Plan
from app.models.schedule import Schedule
from app.models.student import Student
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.agent_dto import TeacherAgentRunCreate
from app.services.agent_tool_registry import execute_tool
from app.services.teacher_agent_service import get_agent_run_or_404, run_teacher_agent


def make_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            Plan.__table__,
            Subscription.__table__,
            Student.__table__,
            MistakeRecord.__table__,
            Schedule.__table__,
            AgentRun.__table__,
        ],
    )
    return sessionmaker(bind=engine)()


def seed_user(db, user_id: int, username: str) -> User:
    plan = db.query(Plan).filter(Plan.code == "free").first()
    if plan is None:
        plan = Plan(code="free", name="Free", max_students=3, features={"rag": False})
        db.add(plan)
        db.flush()
    user = User(id=user_id, username=username, hashed_password="x", role="teacher", is_active=True)
    db.add(user)
    db.flush()
    db.add(Subscription(user_id=user.id, plan_id=plan.id, status="active"))
    db.commit()
    db.refresh(user)
    return user


def test_teacher_agent_completes_read_only_plan():
    db = make_db()
    user = seed_user(db, 1, "teacher-a")
    student = Student(user_id=user.id, name="Alice", grade="8", class_name="1", tags=[])
    db.add(student)
    db.commit()
    db.refresh(student)
    db.add(MistakeRecord(student_id=student.id, topic="一次函数", source="manual", content="y=kx+b", status="pending"))
    db.commit()

    run = run_teacher_agent(
        db,
        user,
        TeacherAgentRunCreate(goal="根据错题规划一次函数复习课", student_id=student.id),
        LLMConfig(provider="fake", api_key="", base_url="", model=""),
    )

    assert run.status == "completed"
    assert run.plan_json["safety_mode"] == "read_only"
    assert run.tool_calls_json
    assert all(log["risk_level"] == "LOW" for log in run.tool_calls_json)


def test_teacher_agent_needs_input_for_student_specific_goal_without_student():
    db = make_db()
    user = seed_user(db, 1, "teacher-a")

    run = run_teacher_agent(
        db,
        user,
        TeacherAgentRunCreate(goal="分析当前学生的薄弱点"),
        LLMConfig(provider="fake", api_key="", base_url="", model=""),
    )

    assert run.status == "needs_input"
    assert run.missing_fields_json[0]["field"] == "student_id"


def test_teacher_agent_rejects_other_teacher_student_without_enumeration():
    db = make_db()
    user = seed_user(db, 1, "teacher-a")
    other = seed_user(db, 2, "teacher-b")
    student = Student(user_id=other.id, name="Bob", grade="8", class_name="1", tags=[])
    db.add(student)
    db.commit()
    db.refresh(student)

    run = run_teacher_agent(
        db,
        user,
        TeacherAgentRunCreate(goal="分析学生薄弱点", student_id=student.id),
        LLMConfig(provider="fake", api_key="", base_url="", model=""),
    )

    assert run.status == "failed"
    assert run.error_code == "student_not_found"


def test_agent_run_owner_only_lookup():
    db = make_db()
    user = seed_user(db, 1, "teacher-a")
    other = seed_user(db, 2, "teacher-b")
    run = run_teacher_agent(
        db,
        user,
        TeacherAgentRunCreate(goal="规划一节导入课"),
        LLMConfig(provider="fake", api_key="", base_url="", model=""),
    )

    try:
        get_agent_run_or_404(db, other, run.id)
    except Exception as exc:
        assert getattr(exc, "status_code", None) == 404
    else:
        raise AssertionError("expected 404")


def test_tool_registry_rejects_write_tool_and_user_id_override():
    db = make_db()
    user = seed_user(db, 1, "teacher-a")

    log, result = execute_tool(
        db,
        user,
        "create_exam",
        {"user_id": 999, "student_id": 1},
        LLMConfig(provider="fake", api_key="", base_url="", model=""),
    )

    assert result is None
    assert log.status == "failed"
    assert log.error_code == "tool_not_allowed"
    assert "user_id" not in log.safe_arguments
