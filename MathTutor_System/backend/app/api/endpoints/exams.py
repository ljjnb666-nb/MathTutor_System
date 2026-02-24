"""
试卷持久化接口：保存与查询整套试卷；批改结果提交与错题本更新。
支持基于 question_index 的 JSON 题目，通过知识点+内容前缀匹配同步错题本。
按当前登录用户隔离：仅可操作本用户学生相关试卷。
"""
import logging
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, desc
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.models.base import get_db
from app.models.exam import Exam
from app.models.mistake import MistakeRecord
from app.models.question import Question
from app.models.student import Student
from app.models.user import User
from app.schemas.exam_dto import (
    ExamCreate,
    ExamResponse,
    ExamResponseWithStudent,
    ExamUpdate,
    GradeRequest,
    GradeResponse,
    GradeResultItem,
    StudentAnswerItem,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def _my_student_ids(db: Session, user: User) -> list[int]:
    """当前用户名下的学生 ID 列表。"""
    rows = db.query(Student.id).filter(Student.user_id == user.id).all()
    return [r[0] for r in rows]


def _exam_visible_filter(my_student_ids: list[int]):
    """试卷可见条件：归属当前用户的学生或未关联学生。"""
    if not my_student_ids:
        return Exam.student_id.is_(None)
    return or_(Exam.student_id.in_(my_student_ids), Exam.student_id.is_(None))


def _require_own_exam(exam: Exam | None, db: Session, current_user: User) -> Exam:
    """若试卷不存在或不属于当前用户，则 404。"""
    if exam is None:
        raise HTTPException(status_code=404, detail="试卷不存在")
    my_ids = _my_student_ids(db, current_user)
    if exam.student_id is not None and exam.student_id not in my_ids:
        raise HTTPException(status_code=404, detail="试卷不存在")
    return exam


def _require_own_student(student_id: int, db: Session, current_user: User) -> Student:
    """若学生不存在或不属于当前用户，则 404。"""
    student = db.get(Student, student_id)
    if student is None or (student.user_id is not None and student.user_id != current_user.id):
        raise HTTPException(status_code=404, detail="学生不存在")
    return student

CONTENT_MATCH_LEN = 20  # 优先用前 20 字符匹配
CONTENT_SNIPPET_LEN = 50  # 模糊匹配备用长度


def _flat_questions_from_exam(exam: Exam) -> list:
    """从试卷 JSON 中取出扁平题目列表（与前端顺序一致）。"""
    q = exam.questions
    if isinstance(q, dict) and "questions" in q:
        return list(q.get("questions") or [])
    return list(q) if isinstance(q, list) else []


def _get_question_data(flat_questions: list, index: int) -> dict | None:
    """按索引取题目数据，越界返回 None。"""
    try:
        if index < 0 or index >= len(flat_questions):
            return None
        item = flat_questions[index]
        return item if isinstance(item, dict) else None
    except (IndexError, TypeError):
        return None


def _escape_like(s: str) -> str:
    """转义 LIKE 中的 % 和 _，避免误匹配。"""
    return (s or "").replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _find_question_by_content(
    db: Session,
    content: str,
    knowledge_point: str,
    student_id: int | None,
) -> Question | None:
    """
    通过「知识点 + 题目内容」匹配已有题目：优先精确 content，再 content 前 20 字前缀，最后 LIKE 片段。
    """
    content = (content or "").strip()
    if not content:
        return None
    kp = (knowledge_point or "").strip() or "综合"
    student_filter = or_(Question.student_id.is_(None), Question.student_id == student_id)

    # 1) 精确匹配：knowledge_point + content 完全一致
    q = (
        db.query(Question)
        .filter(
            Question.knowledge_point == kp,
            Question.content == content,
            student_filter,
        )
        .limit(1)
        .first()
    )
    if q is not None:
        return q

    # 2) 前缀匹配：knowledge_point + content 前 20 字符
    prefix = content[:CONTENT_MATCH_LEN].strip()
    if prefix:
        q = (
            db.query(Question)
            .filter(
                Question.knowledge_point == kp,
                Question.content.startswith(prefix),
                student_filter,
            )
            .limit(1)
            .first()
        )
        if q is not None:
            return q

    # 3) 备用：LIKE 前 50 字片段（转义后）
    snippet = content[:CONTENT_SNIPPET_LEN].strip()
    if not snippet:
        return None
    like_pattern = f"%{_escape_like(snippet)}%"
    q = (
        db.query(Question)
        .filter(
            Question.knowledge_point == kp,
            Question.content.like(like_pattern, escape="\\"),
            student_filter,
        )
        .limit(1)
        .first()
    )
    return q


def _create_question_from_exam_data(
    db: Session,
    question_data: dict,
    student_id: int | None,
) -> Question:
    """用试卷 JSON 题目数据创建一条 Question 记录，字段完整（content/answer/analysis/source）。"""
    content = (question_data.get("content") or "").strip() or "(无题干)"
    options = question_data.get("options")
    if options is None or not isinstance(options, list):
        options = []
    answer = (question_data.get("answer") or "").strip() or ""
    analysis = (question_data.get("analysis") or "").strip() or ""
    knowledge_point = (question_data.get("knowledge_point") or "").strip() or "综合"
    difficulty = (question_data.get("difficulty") or "").strip() or "L3"
    question_type = (question_data.get("question_type") or "").strip() or "综合"
    row = Question(
        student_id=student_id,
        content=content,
        options=options,
        answer=answer,
        analysis=analysis,
        knowledge_point=knowledge_point,
        difficulty=difficulty,
        question_type=question_type,
        source="Exam Grading",
    )
    db.add(row)
    db.flush()
    return row


def _default_title() -> str:
    return "未命名试卷 " + datetime.now().strftime("%Y-%m-%d")


def _normalize_choice_answer_to_index(value: str, options: list | None) -> int | None:
    """
    将选择题答案规范为 0-based 选项下标。
    value: 标准答案或学生答案，如 "A"/"B"/"1"/"2" 或选项全文。
    options: 选项列表，可为空。
    """
    if value is None:
        return None
    s = (value or "").strip()
    if not s:
        return None
    # 字母 A/B/C/D -> 0,1,2,3
    if len(s) == 1:
        c = s.upper()
        if c in "ABCD":
            return ord(c) - ord("A")
        if c in "0123456789":
            return int(c)
    # 数字字符串：有 options 时按 1-based（1->0, 2->1）；否则 0-based
    if s.isdigit():
        i = int(s)
        if i < 0:
            return None
        if options and len(options) > 0 and i >= 1:
            return min(i - 1, len(options) - 1)
        return i
    # 与选项全文匹配
    if options:
        for idx, opt in enumerate(options):
            opt_str = (opt if isinstance(opt, str) else str(opt)).strip()
            if opt_str and (s == opt_str or opt_str.endswith(s) or s in opt_str):
                return idx
    return None


def _normalize_text_answer(s: str) -> str:
    """填空/简答：去除首尾空白，内部连续空白压成单空格。"""
    if s is None:
        return ""
    return " ".join((s or "").strip().split())


def _is_solution_question(question_data: dict) -> bool:
    """是否为解答题（由学生自评，系统不判题）。"""
    qtype = (question_data.get("question_type") or question_data.get("type") or "").strip()
    return qtype in ("解答", "解答题")


def _compute_results_from_student_answers(
    exam: Exam,
    student_answers: list[StudentAnswerItem],
) -> list[GradeResultItem]:
    """
    根据学生答案与试卷标准答案计算每道题对错。
    选择题：按选项字母或下标比较；填空题：文本规范化后比较；
    解答题：不系统判题，采用学生自评 is_correct（若未传则按错处理）。
    """
    flat_questions = _flat_questions_from_exam(exam)
    results: list[GradeResultItem] = []
    item_by_index = {item.question_index: item for item in student_answers}

    for index in range(len(flat_questions)):
        question_data = _get_question_data(flat_questions, index)
        if question_data is None:
            continue
        item = item_by_index.get(index)
        student_raw = (item.student_answer or "").strip() if item else ""

        if _is_solution_question(question_data):
            # 解答题：采用学生自评，不比对答案
            is_correct = item.is_correct if item is not None and item.is_correct is not None else False
        else:
            correct_answer = (question_data.get("answer") or "").strip()
            options = question_data.get("options")
            if options is not None and not isinstance(options, list):
                options = list(options) if options else []
            elif not options:
                options = []
            if options:
                correct_idx = _normalize_choice_answer_to_index(correct_answer, options)
                student_idx = _normalize_choice_answer_to_index(student_raw, options)
                is_correct = correct_idx is not None and student_idx is not None and correct_idx == student_idx
            else:
                is_correct = _normalize_text_answer(correct_answer) == _normalize_text_answer(student_raw)

        results.append(
            GradeResultItem(question_index=index, is_correct=is_correct, error_type=None)
        )
    return results


@router.post("/", response_model=ExamResponse, status_code=201)
def create_exam(
    body: ExamCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Exam:
    """保存试卷。支持 Mode A（题目列表）与 Mode B（辅导讲义 dict）。student_id 若提供则必须属于当前用户。"""
    if body.student_id is not None:
        _require_own_student(body.student_id, db, current_user)
    title = (body.title or "").strip() or _default_title()
    if isinstance(body.questions, dict):
        questions_data = body.questions
    else:
        questions_data = [q.model_dump() for q in body.questions]
    row = Exam(
        title=title,
        student_id=body.student_id,
        questions=questions_data,
        assignment_date=body.assignment_date,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/", response_model=list[ExamResponseWithStudent])
def list_exams(
    assignment_date: date | None = Query(None, description="按作业日期筛选"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ExamResponseWithStudent]:
    """获取试卷列表，按作业日期倒序、再创建时间倒序；支持 assignment_date 筛选。含学生姓名与做题提交状态。"""
    my_ids = _my_student_ids(db, current_user)
    q = (
        db.query(Exam, Student.name)
        .outerjoin(Student, Exam.student_id == Student.id)
        .filter(_exam_visible_filter(my_ids))
    )
    if assignment_date is not None:
        q = q.filter(Exam.assignment_date == assignment_date)
    rows = q.order_by(desc(Exam.assignment_date).nullslast(), Exam.created_at.desc()).all()
    return [
        ExamResponseWithStudent(
            id=e.id,
            title=e.title,
            student_id=e.student_id,
            questions=e.questions,
            created_at=e.created_at,
            assignment_date=getattr(e, "assignment_date", None),
            graded_at=getattr(e, "graded_at", None),
            grade_summary=getattr(e, "grade_summary", None),
            grade_results=getattr(e, "grade_results", None),
            student_name=student_name,
        )
        for e, student_name in rows
    ]


@router.put("/{exam_id}", response_model=ExamResponse)
def update_exam(
    exam_id: int,
    body: ExamUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Exam:
    """更新试卷（标题、题目、作业日期）。仅可更新当前用户可见的试卷，用于作业草稿编辑。"""
    row = db.get(Exam, exam_id)
    _require_own_exam(row, db, current_user)
    data = body.model_dump(exclude_unset=True)
    if "title" in data and data["title"] is not None:
        row.title = (data["title"] or "").strip() or _default_title()
    if "assignment_date" in data:
        row.assignment_date = data["assignment_date"]
    if "questions" in data and data["questions"] is not None:
        if isinstance(data["questions"], dict):
            row.questions = data["questions"]
        else:
            row.questions = [q.model_dump() if hasattr(q, "model_dump") else q for q in data["questions"]]
    db.commit()
    db.refresh(row)
    return row


@router.get("/{exam_id}", response_model=ExamResponse)
def get_exam(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Exam:
    """获取单份试卷详情。仅可查看当前用户可见的试卷。"""
    row = db.get(Exam, exam_id)
    _require_own_exam(row, db, current_user)
    return row


@router.delete("/{exam_id}", status_code=204)
def delete_exam(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """删除试卷/作业。仅可删除当前用户可见的试卷；删除后学生端将不再显示该作业。"""
    row = db.get(Exam, exam_id)
    _require_own_exam(row, db, current_user)
    db.delete(row)
    db.commit()
    logger.info("Exam %s deleted by user %s", exam_id, current_user.id)


def grade_exam_core(
    db: Session,
    exam: Exam,
    results: list,
    student_id: int,
    student_answers: list[StudentAnswerItem] | None = None,
) -> GradeResponse:
    """
    批改试卷核心逻辑：按 results 更新/创建错题记录。调用方需已校验 exam 与 student_id 归属。
    若传入 student_answers（学生端提交），会将其写入 grade_results 供再次打开时展示。
    """
    flat_questions = _flat_questions_from_exam(exam)
    mistakes_added = 0
    for item in results:
        logger.info(
            "Processing Question Index %s: Correct=%s",
            item.question_index,
            item.is_correct,
        )

        question_data = _get_question_data(flat_questions, item.question_index)
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

        question = _find_question_by_content(db, content, knowledge_point, student_id)
        if question is None:
            question = _create_question_from_exam_data(db, question_data, student_id)
            db.flush()
            logger.info("Action: Created New Question id=%s for index %s", question.id, item.question_index)

        existing_mistake = (
            db.query(MistakeRecord)
            .filter(
                MistakeRecord.student_id == student_id,
                MistakeRecord.content == content,
            )
            .first()
        )
        found = existing_mistake is not None
        logger.info("Found existing mistake? %s", "yes" if found else "no")

        if not item.is_correct:
            if existing_mistake:
                existing_mistake.status = "pending"
                mistakes_added += 1
                logger.info("Action: Updated (mark pending)")
            else:
                next_review = date.today() + timedelta(days=1)
                row = MistakeRecord(
                    student_id=student_id,
                    topic=knowledge_point,
                    source="试卷批改",
                    content=content,
                    options=options,
                    solution=answer or None,
                    status="pending",
                    review_count=0,
                    next_review_date=next_review,
                )
                db.add(row)
                mistakes_added += 1
                logger.info("Action: Created New MistakeRecord")
        else:
            if existing_mistake:
                existing_mistake.status = "mastered"
                existing_mistake.review_count = (existing_mistake.review_count or 0) + 1
                logger.info("Action: Marked mastered")

    correct_count = sum(1 for r in results if getattr(r, "is_correct", False))
    exam.graded_at = datetime.utcnow()
    exam.grade_summary = {"correct": correct_count, "total": len(results)}
    answer_by_index = (
        {item.question_index: (item.student_answer or "").strip() for item in student_answers}
        if student_answers
        else {}
    )
    exam.grade_results = [
        {
            "question_index": getattr(r, "question_index", i),
            "is_correct": getattr(r, "is_correct", False),
            **({"student_answer": answer_by_index.get(getattr(r, "question_index", i), "")} if answer_by_index else {}),
        }
        for i, r in enumerate(results)
    ]

    db.commit()
    logger.info("Grade exam committed: graded=%s, mistakes_added=%s", len(results), mistakes_added)
    return GradeResponse(
        graded=len(results),
        mistakes_added=mistakes_added,
        grade_summary=exam.grade_summary,
        grade_results=exam.grade_results,
    )


@router.post("/{exam_id}/grade", response_model=GradeResponse)
def grade_exam(
    exam_id: int,
    body: GradeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GradeResponse:
    """
    提交试卷批改结果；使用 question_index 从 exam.questions (JSON) 取题，
    通过「知识点 + 内容前 20 字」优先匹配，创建/更新错题记录。必须提供学生上下文。
    仅可批改当前用户可见的试卷，且学生必须属于当前用户。
    """
    exam = db.get(Exam, exam_id)
    _require_own_exam(exam, db, current_user)

    student_id = body.student_id if body.student_id is not None else exam.student_id
    if student_id is None:
        logger.warning("Grade exam %s: no student_id in body and exam.student_id is empty", exam_id)
        raise HTTPException(
            status_code=400,
            detail="Cannot grade exam without student context. Pass student_id in request body or use an exam linked to a student.",
        )

    _require_own_student(student_id, db, current_user)
    logger.info("Grading exam %s for student %s", exam_id, student_id)

    try:
        return grade_exam_core(db, exam, body.results, student_id)
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        import traceback

        traceback.print_exc()
        logger.exception("Grade exam %s failed: %s", exam_id, e)
        detail = str(e).strip() or "提交批改结果失败"
        if len(detail) > 300:
            detail = detail[:300] + "..."
        raise HTTPException(status_code=500, detail=detail)
