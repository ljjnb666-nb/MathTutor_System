from app.services.exam_question_merge import (
    append_region,
    merge_by_section_headers,
    merge_same_number_questions,
    normalize_question_type,
    question_merge_key,
)


def test_question_merge_key_uses_main_number():
    assert question_merge_key("20.1") == "20"
    assert question_merge_key("20．2") == "20"
    assert question_merge_key("综合题") == "综合题"


def test_merge_same_number_questions_combines_content_options_and_regions():
    questions = [
        {
            "number": "20.1",
            "type": "fill",
            "content": "第一问",
            "options": [],
            "image_region": {"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.2},
        },
        {
            "number": "20.2",
            "type": "solution",
            "content": "第二问",
            "options": ["A", "B"],
            "images": ["img"],
        },
    ]

    merged = merge_same_number_questions(questions)

    assert len(merged) == 1
    assert merged[0]["number"] == 20
    assert merged[0]["type"] == "solution"
    assert merged[0]["content"] == "第一问\n\n第二问"
    assert merged[0]["options"] == ["A", "B"]
    assert merged[0]["images"] == ["img"]
    assert merged[0]["image_regions"] == [{"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.2}]


def test_merge_by_section_headers_appends_to_previous_solution():
    questions = [
        {"number": 20, "type": "solution", "content": "主问题", "images": []},
        {"number": "", "type": "solution", "content": "【问题解决】继续讨论", "image_regions": [{"x": 0.2, "y": 0.2, "width": 0.2, "height": 0.2}]},
        {"number": 21, "type": "fill", "content": "21. 新题"},
    ]

    merged = merge_by_section_headers(questions)

    assert len(merged) == 2
    assert merged[0]["content"] == "主问题\n\n【问题解决】继续讨论"
    assert merged[0]["image_regions"] == [{"x": 0.2, "y": 0.2, "width": 0.2, "height": 0.2}]


def test_append_region_filters_tiny_or_full_page_boxes():
    regions = []
    append_region(regions, {"x": 0.1, "y": 0.1, "width": 0.001, "height": 0.001})
    append_region(regions, {"x": 0, "y": 0, "width": 1, "height": 1})
    append_region(regions, {"x": 0.1, "y": 0.1, "width": 0.2, "height": 0.2})

    assert regions == [{"x": 0.1, "y": 0.1, "width": 0.2, "height": 0.2}]


def test_normalize_question_type_uses_aliases_and_options_fallback():
    assert normalize_question_type("选择题", []) == "choice"
    assert normalize_question_type("应用题", []) == "solution"
    assert normalize_question_type("", ["A", "B"]) == "choice"
    assert normalize_question_type("", []) == "fill"
