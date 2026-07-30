import pytest

from app.schemas.agent_dto import TeacherAgentPlan, TeacherIntent
from app.services.teacher_agent_planner import parse_validated_json


def test_parse_validated_intent_from_markdown_json():
    raw = """```json
    {"intent_type":"lesson_preparation","candidate_tools":["get_teacher_schedule"],"requires_rag":false}
    ```"""

    intent = parse_validated_json(raw, TeacherIntent)

    assert intent.intent_type == "lesson_preparation"
    assert intent.candidate_tools == ["get_teacher_schedule"]


def test_parse_repaired_plan_json():
    raw = '{"title":"Plan","summary":"A","intent_type":"general_teaching","steps":[{"step_id":"1","title":"T","description":"D","basis":"B"}],"safety_mode":"read_only"'

    plan = parse_validated_json(raw, TeacherAgentPlan)

    assert plan.title == "Plan"
    assert plan.steps[0].requires_confirmation is False


def test_parse_invalid_json_raises_after_repair_fails():
    with pytest.raises(Exception):
        parse_validated_json("not json", TeacherIntent)
