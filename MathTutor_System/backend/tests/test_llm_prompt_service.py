from app.schemas.generation import GenerateRequest
from app.services.llm_prompt_service import build_generation_prompt


def make_request(**overrides):
    data = {
        "knowledge_point": "勾股定理",
        "difficulty": "L3",
        "question_type": "选择",
        "count": 2,
        "scenario": "default",
    }
    data.update(overrides)
    return GenerateRequest(**data)


def test_build_generation_prompt_adds_kb_prefix_and_diversity_hint():
    prompt = build_generation_prompt(
        make_request(),
        count=1,
        diversity_index=2,
        knowledge_base_context="local knowledge",
    )

    assert prompt.startswith("参考本地知识库内容：\nlocal knowledge")
    assert "这是第 3 道题" in prompt
    assert "勾股定理" in prompt


def test_build_generation_prompt_specialized_without_ref_uses_reinforcement_mode():
    prompt = build_generation_prompt(make_request(scenario="specialized", ref_content=""), count=2)

    assert "User Intent: Generate intensive reinforcement questions" in prompt
    assert "L4-L5 (High)" in prompt


def test_build_generation_prompt_assessment_forces_mixed_type():
    prompt = build_generation_prompt(make_request(scenario="assessment", question_type="填空"), count=5)

    assert prompt.startswith("You are a Diagnostic Exam Generator. Output JSON only.")
    assert "综合 (混合题型)" in prompt
    assert "question_type: 填空" not in prompt


def test_build_generation_prompt_ref_content_ignores_knowledge_point_for_error_crusher():
    prompt = build_generation_prompt(
        make_request(scenario="error_crusher", ref_content="错题内容"),
        count=1,
    )

    assert "请忽略输入的 knowledge_point 参数" in prompt
    assert "错题内容" in prompt
