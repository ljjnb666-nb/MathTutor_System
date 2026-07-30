import logging
from datetime import date, datetime, timedelta

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.exam import Exam
from app.models.mistake import MistakeRecord
from app.models.question import Question
from app.schemas.exam_dto import GradeResponse, GradeResultItem, StudentAnswerItem

logger = logging.getLogger(__name__)

CONTENT_MATCH_LEN = 20
CONTENT_SNIPPET_LEN = 50


def flat_questions_from_exam(exam: Exam) -> list:
    questions = exam.questions
    if isinstance(questions, dict) and "questions" in questions:
        return list(questions.get("questions") or [])
    return list(questions) if isinstance(questions, list) else []


def get_question_data(flat_questions: list, index: int) -> dict | None:
    try:
        if index < 0 or index >= len(flat_questions):
            return None
        item = flat_questions[index]
        return item if isinstance(item, dict) else None
    except (IndexError, TypeError):
        return None


def _escape_like(value: str) -> str:
    return (value or "").replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def find_question_by_content(
    db: Session,
    content: str,
    knowledge_point: str,
    student_id: int | None,
) -> Question | None:
    content = (content or "").strip()
    if not content:
        return None
    knowledge_point = (knowledge_point or "").strip() or "综合"
    student_filter = or_(Question.student_id.is_(None), Question.student_id == student_id)

    question = (
        db.query(Question)
        .filter(
            Question.knowledge_point == knowledge_point,
            Question.content == content,
            student_filter,
        )
        .limit(1)
        .first()
    )
    if question is not None:
        return question

    prefix = content[:CONTENT_MATCH_LEN].strip()
    if prefix:
        question = (
            db.query(Question)
            .filter(
                Question.knowledge_point == knowledge_point,
                Question.content.startswith(prefix),
                student_filter,
            )
            .limit(1)
            .first()
        )
        if question is not None:
            return question

    snippet = content[:CONTENT_SNIPPET_LEN].strip()
    if not snippet:
        return None
    like_pattern = f"%{_escape_like(snippet)}%"
    return (
        db.query(Question)
        .filter(
            Question.knowledge_point == knowledge_point,
            Question.content.like(like_pattern, escape="\\"),
            student_filter,
        )
        .limit(1)
        .first()
    )


def create_question_from_exam_data(
    db: Session,
    question_data: dict,
    student_id: int | None,
) -> Question:
    options = question_data.get("options")
    if options is None or not isinstance(options, list):
        options = []
    row = Question(
        student_id=student_id,
        content=(question_data.get("content") or "").strip() or "(无题干)",
        options=options,
        answer=(question_data.get("answer") or "").strip() or "",
        analysis=(question_data.get("analysis") or "").strip() or "",
        knowledge_point=(question_data.get("knowledge_point") or "").strip() or "综合",
        difficulty=(question_data.get("difficulty") or "").strip() or "L3",
        question_type=(question_data.get("question_type") or "").strip() or "综合",
        source="Exam Grading",
    )
    db.add(row)
    db.flush()
    return row


def normalize_choice_answer_to_index(value: str, options: list | None) -> int | None:
    if value is None:
        return None
    value = (value or "").strip()
    if not value:
        return None
    if len(value) == 1:
        char = value.upper()
        if char in "ABCD":
            return ord(char) - ord("A")
    if value.isdigit():
        index = int(value)
        if index < 0:
            return None
        if options and len(options) > 0 and index >= 1:
            return min(index - 1, len(options) - 1)
        return index
    if options:
        for index, option in enumerate(options):
            option_text = (option if isinstance(option, str) else str(option)).strip()
            if option_text and (value == option_text or option_text.endswith(value) or value in option_text):
                return index
    return None


def normalize_text_answer(value: str) -> str:
    if value is None:
        return ""
    return " ".join((value or "").strip().split())


def is_solution_question(question_data: dict) -> bool:
    question_type = (question_data.get("question_type") or question_data.get("type") or "").strip()
    return question_type in ("解答", "解答题")


def compute_results_from_student_answers(
    exam: Exam,
    student_answers: list[StudentAnswerItem],
) -> list[GradeResultItem]:
    flat_questions = flat_questions_from_exam(exam)
    results: list[GradeResultItem] = []
    item_by_index = {item.question_index: item for item in student_answers}

    for index in range(len(flat_questions)):
        question_data = get_question_data(flat_questions, index)
        if question_data is None:
            continue
        item = item_by_index.get(index)
        student_raw = (item.student_answer or "").strip() if item else ""

        if is_solution_question(question_data):
            is_correct = item.is_correct if item is not None and item.is_correct is not None else False
        else:
            correct_answer = (question_data.get("answer") or "").strip()
            options = question_data.get("options")
            if options is not None and not isinstance(options, list):
                options = list(options) if options else []
            elif not options:
                options = []
            if options:
                correct_idx = normalize_choice_answer_to_index(correct_answer, options)
                student_idx = normalize_choice_answer_to_index(student_raw, options)
                is_correct = correct_idx is not None and student_idx is not None and correct_idx == student_idx
            else:
                is_correct = normalize_text_answer(correct_answer) == normalize_text_answer(student_raw)

        results.append(GradeResultItem(question_index=index, is_correct=is_correct, error_type=None))
    return results


def grade_exam_core(
    db: Session,
    exam: Exam,
    results: list,
    student_id: int,
    student_answers: list[StudentAnswerItem] | None = None,
) -> GradeResponse:
    flat_questions = flat_questions_from_exam(exam)
    mistakes_added = 0

    for item in results:
        question_data = get_question_data(flat_questions, item.question_index)
        if question_data is None:
            logger.warning("Question index %s out of range or invalid, skip", item.question_index)
            continue

        content = (question_data.get("content") or "").strip() or "(无题干)"
        knowledge_point = (question_data.get("knowledge_point") or "").strip() or "综合"
        answer = (question_data.get("answer") or "").strip() or ""
        options = question_data.get("options")
        if options is not None and not isinstance(options, list):
            options = list(options) if options else None
        elif not options:
            options = None

        question = find_question_by_content(db, content, knowledge_point, student_id)
        if question is None:
            question = create_question_from_exam_data(db, question_data, student_id)
            db.flush()
            logger.info("Created Question id=%s for exam item %s", question.id, item.question_index)

        existing_mistake = (
            db.query(MistakeRecord)
            .filter(
                MistakeRecord.student_id == student_id,
                MistakeRecord.content == content,
            )
            .first()
        )

        if not item.is_correct:
            if existing_mistake:
                existing_mistake.status = "pending"
                mistakes_added += 1
            else:
                db.add(MistakeRecord(
                    student_id=student_id,
                    topic=knowledge_point,
                    source="试卷批改",
                    content=content,
                    options=options,
                    solution=answer or None,
                    status="pending",
                    review_count=0,
                    next_review_date=date.today() + timedelta(days=1),
                ))
                mistakes_added += 1
        elif existing_mistake:
            existing_mistake.status = "mastered"
            existing_mistake.review_count = (existing_mistake.review_count or 0) + 1

    correct_count = sum(1 for result in results if getattr(result, "is_correct", False))
    exam.graded_at = datetime.utcnow()
    exam.grade_summary = {"correct": correct_count, "total": len(results)}
    answer_by_index = (
        {item.question_index: (item.student_answer or "").strip() for item in student_answers}
        if student_answers
        else {}
    )
    exam.grade_results = [
        {
            "question_index": getattr(result, "question_index", index),
            "is_correct": getattr(result, "is_correct", False),
            **({"student_answer": answer_by_index.get(getattr(result, "question_index", index), "")} if answer_by_index else {}),
        }
        for index, result in enumerate(results)
    ]

    db.commit()
    logger.info("Grade exam committed: graded=%s, mistakes_added=%s", len(results), mistakes_added)
    return GradeResponse(
        graded=len(results),
        mistakes_added=mistakes_added,
        grade_summary=exam.grade_summary,
        grade_results=exam.grade_results,
    )
