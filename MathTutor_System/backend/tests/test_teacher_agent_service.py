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
from app.services.teacher_agent_service import contains_completed_write_claim, get_agent_run_or_404, run_teacher_agent


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


def make_plan(summary: str, *, future_action: str | None = None) -> TeacherAgentPlan:
    return TeacherAgentPlan(
        title="Read-only plan",
        summary=summary,
        intent_type="lesson_preparation",
        resolved_context={},
        evidence_summary={},
        steps=[
            TeacherAgentPlanStep(
                step_id="1",
                title="Plan",
                description="Draft a future plan.",
                basis="Teacher goal",
                future_action=future_action,
            )
        ],
        expected_outputs=["teaching_plan"],
        safety_mode="read_only",
    )


class SummaryPlanner(DeterministicFakePlanner):
    def __init__(self, summary: str):
        super().__init__()
        self.summary = summary

    async def compose_plan(self, request, intent, tool_summaries, llm_config):
        self.compose_calls += 1
        return make_plan(self.summary)


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


def test_completed_write_claim_detection_rejects_english_and_chinese():
    rejected = [
        "I have created the exam.",
        "The assistant created the exam for you.",
        "The system has saved the questions.",
        "The homework has been published successfully.",
        "I have deleted the student.",
        "Payment has been completed.",
        "I have sent the assignment to the class.",
        "\u6211\u5df2\u4e3a\u4f60\u521b\u5efa\u8bd5\u5377",
        "\u7cfb\u7edf\u5df2\u4fdd\u5b58\u9898\u76ee",
        "\u5df2\u4e3a\u8be5\u73ed\u53d1\u5e03\u4f5c\u4e1a",
        "\u5b66\u751f\u5df2\u88ab\u5220\u9664",
        "\u5df2\u5b8c\u6210\u652f\u4ed8",
        "\u5df2\u4ece\u8d26\u6237\u6263\u8d39",
        "\u6211\u5df2\u53d1\u9001\u901a\u77e5",
        "\u8bd5\u5377\u5df2\u521b\u5efa",
    ]
    for summary in rejected:
        assert contains_completed_write_claim(make_plan(summary)), summary


def test_completed_write_claim_detection_allows_future_actions():
    allowed = [
        "Review the exam I created last week.",
        "Analyze the updated report.",
        "Use the questions the teacher saved.",
        "The teacher sent this file yesterday.",
        "\u8001\u5e08\u786e\u8ba4\u540e\u53ef\u521b\u5efa\u8bd5\u5377",
        "\u4e0b\u4e00\u9636\u6bb5\u53ef\u4ee5\u53d1\u5e03\u4f5c\u4e1a",
        "\u5206\u6790\u8001\u5e08\u4e4b\u524d\u5df2\u521b\u5efa\u7684\u8bd5\u5377",
        "\u67e5\u770b\u5b66\u751f\u6628\u5929\u66f4\u65b0\u7684\u6570\u636e",
    ]
    for summary in allowed:
        assert not contains_completed_write_claim(make_plan(summary)), summary
    assert not contains_completed_write_claim(
        make_plan("Draft only.", future_action="\u8001\u5e08\u786e\u8ba4\u540e\u53ef\u521b\u5efa\u8bd5\u5377")
    )


def test_completed_write_claim_marks_agent_run_failed():
    db = make_db()
    user = seed_user(db, 1, "teacher-a")

    run = run_teacher_agent(
        db,
        user,
        TeacherAgentRunCreate(goal="Draft a lesson plan"),
        LLMConfig(provider="fake", api_key="", base_url="", model=""),
        planner=SummaryPlanner("I have created the exam."),
    )

    assert run.status == "failed"
    assert run.error_code == "unsafe_plan"


def test_historical_write_wording_allows_agent_run_completed():
    db = make_db()
    user = seed_user(db, 1, "teacher-a")

    run = run_teacher_agent(
        db,
        user,
        TeacherAgentRunCreate(goal="Review the exam I created last week."),
        LLMConfig(provider="fake", api_key="", base_url="", model=""),
        planner=SummaryPlanner("Review the exam I created last week."),
    )

    assert run.status == "completed"
