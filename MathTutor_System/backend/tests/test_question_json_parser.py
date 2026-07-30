from app.services.question_json_parser import (
    fix_json_invalid_escapes,
    parse_questions,
    parse_sync_tutoring_response,
    strip_json_markdown,
)


def test_strip_json_markdown_handles_fenced_json():
    raw = """```json
{"questions":[]}
```"""

    assert strip_json_markdown(raw) == '{"questions":[]}'


def test_parse_questions_repairs_latex_escapes():
    raw = r'{"questions":[{"content":"求 \triangle ABC 的面积","options":[],"answer":"1","analysis":"用 \frac{1}{2}ab"}]}'

    questions = parse_questions(raw)

    assert len(questions) == 1
    assert questions[0].question_type == "解答"
    assert "\\triangle" in questions[0].content
    assert "\\frac" in questions[0].analysis


def test_parse_questions_accepts_single_question_object():
    raw = '{"content":"1+1=?","options":["1","2"],"answer":"2","analysis":"计算"}'

    questions = parse_questions(raw)

    assert len(questions) == 1
    assert questions[0].question_type == "选择"


def test_parse_sync_tutoring_response_extracts_questions():
    raw = """
说明文字
{"knowledge_card":{"title":"勾股定理","summary":"a^2+b^2=c^2","key_points":["直角三角形"]},
"examples":[{"content":"例题"}],
"questions":[{"content":"A. 1\\nB. 2\\n求答案","options":[],"answer":"B","analysis":"选B"}]}
"""

    parsed = parse_sync_tutoring_response(raw)

    assert parsed["knowledge_card"]["title"] == "勾股定理"
    assert parsed["examples"] == [{"content": "例题"}]
    assert len(parsed["questions"]) == 1
