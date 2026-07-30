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
from app.schemas.agent_dto import TeacherAgentPlan, TeacherAgentPlanStep, TeacherAgentRunCreate, TeacherIntent
from app.services.agent_tool_registry import execute_tool
from app.services.teacher_agent_service import get_agent_run_or_404, run_teacher_agent


class DeterministicFakePlanner:
    def __init__(self, *, intent: TeacherIntent | None = None, plan_title: str = "Read-only plan", fail_plan: bool = False):
        self.intent = intent
        self.plan_title = plan_title
        self.fail_plan = fail_plan
        self.extract_calls = 0
        self.compose_calls = 0

    async def extract_intent(self, request, available_tools, llm_config):
        self.extract_calls += 1
        if self.intent is not None:
            return self.intent
        student_specific = request.student_id is not None or any(token in request.goal for token in ["学生", "错题", "薄弱"])
        tools = ["search_owned_rag"] if request.use_knowledge_base else []
        if request.student_id is not None:
            tools = [
                "get_owned_student_profile",
                "get_student_weak_points",
                "get_student_recent_mistakes",
                "get_student_trend",
                *tools,
            ]
        return TeacherIntent(
            intent_type="review_plan" if student_specific else "lesson_preparation",
            knowledge_points=[request.knowledge_point] if request.knowledge_point else [],
            requested_outputs=["teaching_plan"],
            requires_student_context=student_specific,
            requires_rag=request.use_knowledge_base,
            candidate_tools=tools,
        )

    async def compose_plan(self, request, intent, tool_summaries, llm_config):
        self.compose_calls += 1
        if self.fail_plan:
            raise ValueError("bad plan")
        title = "45 minute introduction plan" if "45" in request.goal or "导入" in request.goal else self.plan_title
        return TeacherAgentPlan(
            title=title,
            summary=f"Plan for {request.goal}",
            intent_type=intent.intent_type,
            resolved_context={"student_id": request.student_id, "knowledge_points": intent.knowledge_points},
            evidence_summary=tool_summaries,
            steps=[
                TeacherAgentPlanStep(step_id="1", title="Lead-in", description="Introduce the goal.", basis="Teacher goal"),
                TeacherAgentPlanStep(step_id="2", title="Practice", description="Use evidence to guide practice.", basis="Read-only evidence"),
            ],
            expected_outputs=["teaching_plan"],
            safety_mode="read_only",
        )


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


def test_teacher_agent_completes_read_only_plan_with_injected_planner():
    db = make_db()
    user = seed_user(db, 1, "teacher-a")
    student = Student(user_id=user.id, name="Alice", grade="8", class_name="1", tags=[])
    db.add(student)
    db.commit()
    db.refresh(student)
    db.add(MistakeRecord(student_id=student.id, topic="一次函数", source="manual", content="y=kx+b", status="pending"))
    db.commit()

    planner = DeterministicFakePlanner()
    run = run_teacher_agent(
        db,
        user,
        TeacherAgentRunCreate(goal="根据错题规划一次函数复习课", student_id=student.id),
        LLMConfig(provider="fake", api_key="", base_url="", model=""),
        planner=planner,
    )

    assert run.status == "completed"
    assert run.plan_json["safety_mode"] == "read_only"
    assert run.tool_calls_json
    assert all(log["risk_level"] == "LOW" for log in run.tool_calls_json)
    assert planner.extract_calls == 1
    assert planner.compose_calls == 1


def test_teacher_agent_needs_input_does_not_call_second_model():
    db = make_db()
    user = seed_user(db, 1, "teacher-a")
    planner = DeterministicFakePlanner()

    run = run_teacher_agent(
        db,
        user,
        TeacherAgentRunCreate(goal="分析当前学生的薄弱点"),
        LLMConfig(provider="fake", api_key="", base_url="", model=""),
        planner=planner,
    )

    assert run.status == "needs_input"
    assert run.missing_fields_json[0]["field"] == "student_id"
    assert run.tool_calls_json == []
    assert planner.compose_calls == 0


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
        planner=DeterministicFakePlanner(),
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
        planner=DeterministicFakePlanner(),
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


def test_candidate_tool_whitelist_filters_write_and_unknown_tools():
    db = make_db()
    user = seed_user(db, 1, "teacher-a")
    intent = TeacherIntent(
        intent_type="lesson_preparation",
        candidate_tools=["create_exam", "execute_sql", "get_teacher_schedule", "missing_tool"],
    )
    run = run_teacher_agent(
        db,
        user,
        TeacherAgentRunCreate(goal="规划45分钟勾股定理导入课"),
        LLMConfig(provider="fake", api_key="", base_url="", model=""),
        planner=DeterministicFakePlanner(intent=intent),
    )

    assert run.status == "completed"
    assert [item["name"] for item in run.selected_tools_json] == ["get_teacher_schedule"]


def test_model_owner_user_id_output_is_ignored():
    db = make_db()
    user = seed_user(db, 1, "teacher-a")
    intent = TeacherIntent.model_validate({"intent_type": "lesson_preparation", "owner_user_id": 999, "candidate_tools": []})

    run = run_teacher_agent(
        db,
        user,
        TeacherAgentRunCreate(goal="规划导入课"),
        LLMConfig(provider="fake", api_key="", base_url="", model=""),
        planner=DeterministicFakePlanner(intent=intent),
    )

    assert run.status == "completed"
    assert "owner_user_id" not in run.intent_json


def test_different_goals_generate_different_plans():
    db = make_db()
    user = seed_user(db, 1, "teacher-a")

    run_a = run_teacher_agent(
        db,
        user,
        TeacherAgentRunCreate(goal="规划45分钟勾股定理导入课"),
        LLMConfig(provider="fake", api_key="", base_url="", model=""),
        planner=DeterministicFakePlanner(),
    )
    run_b = run_teacher_agent(
        db,
        user,
        TeacherAgentRunCreate(goal="规划函数复习课"),
        LLMConfig(provider="fake", api_key="", base_url="", model=""),
        planner=DeterministicFakePlanner(plan_title="Function review plan"),
    )

    assert run_a.plan_json["title"] != run_b.plan_json["title"]


def test_plan_failure_marks_run_failed():
    db = make_db()
    user = seed_user(db, 1, "teacher-a")

    run = run_teacher_agent(
        db,
        user,
        TeacherAgentRunCreate(goal="规划导入课"),
        LLMConfig(provider="fake", api_key="", base_url="", model=""),
        planner=DeterministicFakePlanner(fail_plan=True),
    )

    assert run.status == "failed"
    assert run.error_code == "plan_composition_failed"
