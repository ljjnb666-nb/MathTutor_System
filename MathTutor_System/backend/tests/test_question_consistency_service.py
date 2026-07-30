from app.services.question_consistency_service import (
    extract_problem_numbers,
    is_likely_content_analysis_mismatch,
)


def test_extract_problem_numbers_collects_commerce_parameters():
    text = "进价为20元，定价为35元，卖出40件，获得600元利润。"

    assert extract_problem_numbers(text) == {20, 35, 40, 600}


def test_is_likely_content_analysis_mismatch_detects_foreign_large_numbers():
    content = "某商品进价为20元，定价为35元，共卖出40件。"
    analysis = "解析却使用进价80元、定价120元计算。"

    assert is_likely_content_analysis_mismatch(content, analysis, "") is True


def test_is_likely_content_analysis_mismatch_ignores_small_step_numbers():
    content = "某商品进价为20元，定价为35元，共卖出40件。"
    analysis = "第1步和第2步都围绕20元、35元、40件计算。"

    assert is_likely_content_analysis_mismatch(content, analysis, "") is False
