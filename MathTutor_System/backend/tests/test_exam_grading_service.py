from types import SimpleNamespace

from app.schemas.exam_dto import StudentAnswerItem
from app.services.exam_grading_service import (
    compute_results_from_student_answers,
    normalize_choice_answer_to_index,
    normalize_text_answer,
)


def test_normalize_choice_answer_to_index():
    options = ["A. 1", "B. 2", "C. 3", "D. 4"]

    assert normalize_choice_answer_to_index("A", options) == 0
    assert normalize_choice_answer_to_index("2", options) == 1
    assert normalize_choice_answer_to_index("D. 4", options) == 3
    assert normalize_choice_answer_to_index("", options) is None


def test_normalize_text_answer():
    assert normalize_text_answer("  x   +   y  ") == "x + y"
    assert normalize_text_answer(None) == ""


def test_compute_results_from_student_answers_mixes_question_types():
    exam = SimpleNamespace(questions=[
        {
            "question_type": "选择",
            "content": "choose",
            "options": ["A. 1", "B. 2", "C. 3", "D. 4"],
            "answer": "B",
        },
        {
            "question_type": "填空",
            "content": "fill",
            "answer": "x + y",
        },
        {
            "question_type": "解答",
            "content": "solution",
            "answer": "long proof",
        },
    ])

    results = compute_results_from_student_answers(
        exam,
        [
            StudentAnswerItem(question_index=0, student_answer="2"),
            StudentAnswerItem(question_index=1, student_answer=" x   +   y "),
            StudentAnswerItem(question_index=2, student_answer="", is_correct=False),
        ],
    )

    assert [item.is_correct for item in results] == [True, True, False]
