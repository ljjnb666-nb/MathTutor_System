"""
PHASE 2B-2B：Question / QuestionBank / Exam 资源归属隔离测试。

owner_user_id 是租户归属的唯一事实来源；student_id 仅表示布置/业务上下文。
owner_user_id=NULL 的历史遗留行对普通教师不可见、不可改、不可删、不可批改。
"""
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.endpoints.auth import get_current_user
from app.api.endpoints.question_bank import _content_hash
from app.main import app
from app.models.base import Base, get_db
from app.models.exam import Exam
from app.models.mistake import MistakeRecord
from app.models.question import Question
from app.models.question_bank import QuestionBank
from app.models.student import Student
from app.models.user import User
from app.schemas.exam_dto import GradeResultItem, StudentAnswerItem
from app.services.exam_grading_service import find_question_by_content, grade_exam_core
from app.services.student_portal_service import StudentPortalServiceError
from app.services.student_portal_service import get_student_exam as portal_get_exam
from app.services.student_portal_service import grade_student_exam, list_student_exams

SHARED_CONTENT = "已知 x^2=4，求 x 的值。"
SHARED_KP = "一元二次方程"


def _make_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            Student.__table__,
            Question.__table__,
            QuestionBank.__table__,
            Exam.__table__,
            MistakeRecord.__table__,
        ],
    )
    return sessionmaker(bind=engine)()


def _question(db, *, owner, student, kp=SHARED_KP, content=SHARED_CONTENT):
    row = Question(
        owner_user_id=owner,
        student_id=student,
        content=content,
        options=[],
        answer="±2",
        analysis="",
        knowledge_point=kp,
        difficulty="L3",
        question_type="解答",
        source="手动录入",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _bank_item(db, *, owner, student, kp=SHARED_KP, content=SHARED_CONTENT):
    row = QuestionBank(
        owner_user_id=owner,
        student_id=student,
        content=content,
        options=[],
        answer="±2",
        analysis="",
        question_type="解答",
        difficulty="L3",
        knowledge_point=kp,
        source="错题收藏",
        tags=[],
        images=[],
        content_hash=_content_hash(content, "±2"),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _exam(db, *, owner, student, title="试卷", questions=None):
    row = Exam(
        owner_user_id=owner,
        title=title,
        student_id=student,
        questions=questions if questions is not None else [],
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@pytest.fixture
def world():
    """Teacher A/B 各带一名学生；预置各方 general/student 资源与未认领资源。"""
    db = _make_db()
    teacher_a = User(username="teacher-a", hashed_password="x", role="teacher")
    teacher_b = User(username="teacher-b", hashed_password="x", role="teacher")
    db.add_all([teacher_a, teacher_b])
    db.flush()
    student_a = Student(user_id=teacher_a.id, name="学生A", grade="高一", class_name="1班")
    student_b = Student(user_id=teacher_b.id, name="学生B", grade="高一", class_name="2班")
    db.add_all([student_a, student_b])
    db.commit()
    db.refresh(student_a)
    db.refresh(student_b)

    resources = {
        "a_general": _question(db, owner=teacher_a.id, student=None),
        "a_student": _question(db, owner=teacher_a.id, student=student_a.id),
        "b_general": _question(db, owner=teacher_b.id, student=None),
        "unclaimed": _question(db, owner=None, student=None),
        "a_bank_general": _bank_item(db, owner=teacher_a.id, student=None),
        "b_bank_general": _bank_item(db, owner=teacher_b.id, student=None),
        "bank_unclaimed": _bank_item(db, owner=None, student=None),
        "a_exam_draft": _exam(db, owner=teacher_a.id, student=None, title="A草稿"),
        "b_exam_draft": _exam(db, owner=teacher_b.id, student=None, title="B草稿"),
        "a_exam_assigned": _exam(db, owner=teacher_a.id, student=student_a.id, title="A作业"),
        "exam_unclaimed": _exam(db, owner=None, student=None, title="未认领"),
    }

    holder = {"user": teacher_a}

    def switch_to(user: User) -> None:
        holder["user"] = user

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: holder["user"]
    client = TestClient(app)
    bundle = {
        "db": db,
        "teacher_a": teacher_a,
        "teacher_b": teacher_b,
        "student_a_id": student_a.id,
        "student_b_id": student_b.id,
        **resources,
        "switch_to": switch_to,
        "client": client,
    }
    yield bundle
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)


# ---------------------------------------------------------------- Q-OWNER


def test_q_owner_01_a_sees_own_general_question(world):
    rows = world["client"].get("/api/questions/").json()
    ids = {row["id"] for row in rows}
    assert world["a_general"].id in ids


def test_q_owner_02_a_sees_own_student_question(world):
    rows = world["client"].get("/api/questions/").json()
    ids = {row["id"] for row in rows}
    assert world["a_student"].id in ids


def test_q_owner_03_a_cannot_see_b_general_question(world):
    rows = world["client"].get("/api/questions/").json()
    ids = {row["id"] for row in rows}
    assert world["b_general"].id not in ids
    assert world["unclaimed"].id not in ids


def test_q_owner_04_a_cannot_delete_b_general_question(world):
    response = world["client"].delete(f"/api/questions/{world['b_general'].id}")
    assert response.status_code == 404
    assert world["db"].get(Question, world["b_general"].id) is not None


def test_q_owner_05_a_cannot_delete_unclaimed_question(world):
    response = world["client"].delete(f"/api/questions/{world['unclaimed'].id}")
    assert response.status_code == 404
    assert world["db"].get(Question, world["unclaimed"].id) is not None


def test_q_owner_06_new_general_question_owned_by_a(world):
    response = world["client"].post(
        "/api/questions/",
        json={
            "content": "新题",
            "options": [],
            "answer": "42",
            "knowledge_point": "函数",
            "difficulty": "L2",
            "question_type": "填空",
            "source": "手动录入",
            "student_id": None,
        },
    )
    assert response.status_code == 201
    row = world["db"].get(Question, response.json()["id"])
    assert row.owner_user_id == world["teacher_a"].id
    assert row.student_id is None


def test_q_owner_07_batch_create_sets_owner_on_every_row(world):
    payload = {
        "questions": [
            {
                "content": f"批量题{i}",
                "options": [],
                "answer": str(i),
                "knowledge_point": "数列",
                "difficulty": "L3",
                "question_type": "填空",
                "source": "AI生成",
                "student_id": None,
            }
            for i in range(3)
        ]
    }
    response = world["client"].post("/api/questions/batch", json=payload)
    assert response.status_code == 200
    for item in response.json():
        row = world["db"].get(Question, item["id"])
        assert row.owner_user_id == world["teacher_a"].id


def test_q_owner_08_student_filter_returns_own_student_plus_own_general(world):
    rows = world["client"].get(f"/api/questions/?student_id={world['student_a_id']}").json()
    ids = {row["id"] for row in rows}
    assert ids == {world["a_student"].id, world["a_general"].id}


# ---------------------------------------------------------------- BANK-OWNER


def test_bank_owner_01_a_list_excludes_b_and_unclaimed(world):
    rows = world["client"].get("/api/bank/").json()
    ids = {row["id"] for row in rows}
    assert world["a_bank_general"].id in ids
    assert world["b_bank_general"].id not in ids
    assert world["bank_unclaimed"].id not in ids


def test_bank_owner_02_a_general_collect_creates_owner_a(world):
    response = world["client"].post(
        "/api/bank/collect",
        json={
            "content": "全新收藏题",
            "options": [],
            "answer": "1",
            "knowledge_point": "函数",
            "question_type": "填空",
            "difficulty": "L2",
            "source": "AI生成",
            "student_id": None,
        },
    )
    assert response.status_code == 201
    assert response.json()["created"] is True
    row = world["db"].get(QuestionBank, response.json()["data"]["id"])
    assert row.owner_user_id == world["teacher_a"].id


def test_bank_owner_03_b_collecting_same_content_creates_independent_row(world):
    shared = _bank_item(world["db"], owner=world["teacher_a"].id, student=None, content="仅A收藏过的共享内容")
    world["switch_to"](world["teacher_b"])
    response = world["client"].post(
        "/api/bank/collect",
        json={
            "content": "仅A收藏过的共享内容",
            "options": [],
            "answer": "±2",
            "knowledge_point": SHARED_KP,
            "question_type": "解答",
            "difficulty": "L3",
            "source": "AI生成",
            "student_id": None,
        },
    )
    assert response.status_code == 201
    assert response.json()["created"] is True
    row = world["db"].get(QuestionBank, response.json()["data"]["id"])
    assert row.owner_user_id == world["teacher_b"].id
    assert row.id != shared.id


def test_bank_owner_04_same_teacher_same_content_dedupes(world):
    response = world["client"].post(
        "/api/bank/collect",
        json={
            "content": SHARED_CONTENT,
            "options": [],
            "answer": "±2",
            "knowledge_point": SHARED_KP,
            "question_type": "解答",
            "difficulty": "L3",
            "source": "AI生成",
            "student_id": None,
        },
    )
    assert response.status_code == 201
    assert response.json()["created"] is False
    assert response.json()["data"]["id"] == world["a_bank_general"].id


def test_bank_owner_05_a_cannot_delete_b_bank_row(world):
    response = world["client"].delete(f"/api/bank/{world['b_bank_general'].id}")
    assert response.status_code == 404
    assert world["db"].get(QuestionBank, world["b_bank_general"].id) is not None


def test_bank_owner_06_a_cannot_delete_unclaimed_bank_row(world):
    response = world["client"].delete(f"/api/bank/{world['bank_unclaimed'].id}")
    assert response.status_code == 404
    assert world["db"].get(QuestionBank, world["bank_unclaimed"].id) is not None


def test_bank_owner_07_student_filter_returns_requested_student_plus_general(world):
    a_bank_student = _bank_item(world["db"], owner=world["teacher_a"].id, student=world["student_a_id"])
    rows = world["client"].get(f"/api/bank/?student_id={world['student_a_id']}").json()
    ids = {row["id"] for row in rows}
    assert ids == {world["a_bank_general"].id, a_bank_student.id}


# ---------------------------------------------------------------- EXAM-OWNER


def test_exam_owner_01_new_draft_exam_owned_by_a(world):
    response = world["client"].post("/api/exams/", json={"title": "草稿", "student_id": None, "questions": []})
    assert response.status_code == 201
    row = world["db"].get(Exam, response.json()["id"])
    assert row.owner_user_id == world["teacher_a"].id
    assert row.student_id is None


def test_exam_owner_02_a_list_includes_own_draft(world):
    rows = world["client"].get("/api/exams/").json()
    assert world["a_exam_draft"].id in {row["id"] for row in rows}


def test_exam_owner_03_a_list_excludes_b_draft(world):
    rows = world["client"].get("/api/exams/").json()
    ids = {row["id"] for row in rows}
    assert world["b_exam_draft"].id not in ids
    assert world["exam_unclaimed"].id not in ids


def test_exam_owner_04_a_direct_get_b_draft_404(world):
    response = world["client"].get(f"/api/exams/{world['b_exam_draft'].id}")
    assert response.status_code == 404
    assert response.json()["detail"] == "试卷不存在"


def test_exam_owner_05_a_update_b_draft_404(world):
    response = world["client"].put(f"/api/exams/{world['b_exam_draft'].id}", json={"title": "篡改"})
    assert response.status_code == 404
    assert world["db"].get(Exam, world["b_exam_draft"].id).title == "B草稿"


def test_exam_owner_06_a_delete_b_draft_404(world):
    response = world["client"].delete(f"/api/exams/{world['b_exam_draft'].id}")
    assert response.status_code == 404
    assert world["db"].get(Exam, world["b_exam_draft"].id) is not None


def test_exam_owner_07_a_grade_b_exam_404(world):
    response = world["client"].post(
        f"/api/exams/{world['b_exam_draft'].id}/grade",
        json={"results": [], "student_id": world["student_a_id"]},
    )
    assert response.status_code == 404


def test_exam_owner_08_unclaimed_exam_hidden_and_mutation_404(world):
    assert world["client"].get(f"/api/exams/{world['exam_unclaimed'].id}").status_code == 404
    assert world["client"].put(f"/api/exams/{world['exam_unclaimed'].id}", json={"title": "x"}).status_code == 404
    assert world["client"].delete(f"/api/exams/{world['exam_unclaimed'].id}").status_code == 404
    assert world["db"].get(Exam, world["exam_unclaimed"].id) is not None


def test_exam_owner_09_assigned_exam_preserves_owner_and_student(world):
    response = world["client"].post(
        "/api/exams/",
        json={"title": "作业", "student_id": world["student_a_id"], "questions": []},
    )
    assert response.status_code == 201
    row = world["db"].get(Exam, response.json()["id"])
    assert row.owner_user_id == world["teacher_a"].id
    assert row.student_id == world["student_a_id"]


# ---------------------------------------------------------------- DASHBOARD


def test_dashboard_counts_only_own_resources(world):
    extra_question = _question(world["db"], owner=world["teacher_a"].id, student=None, kp="函数", content="A 第二题")
    extra_exam = _exam(world["db"], owner=world["teacher_a"].id, student=None, title="A 第二卷")

    stats = world["client"].get("/api/dashboard/stats").json()

    # A 名下：3 道题（general + student + 新增）、3 套卷（draft + assigned + 新增）；B 与未认领行不计入
    assert stats["total_questions"] == 3
    assert stats["total_exams"] == 3
    recent_ids = {row["id"] for row in stats["recent_exams"]}
    assert recent_ids == {world["a_exam_draft"].id, world["a_exam_assigned"].id, extra_exam.id}
    distribution_tags = {row["tag"] for row in stats["knowledge_distribution"]}
    assert distribution_tags == {SHARED_KP, "函数"}
    assert extra_question.knowledge_point == "函数"


# ---------------------------------------------------------------- GRADING


def test_grading_matches_only_owner_question(world):
    match_content = "批改匹配专用的同内容题干"
    owned = _question(world["db"], owner=world["teacher_a"].id, student=None, content=match_content)
    _question(world["db"], owner=world["teacher_b"].id, student=None, content=match_content)
    exam = _exam(
        world["db"],
        owner=world["teacher_a"].id,
        student=world["student_a_id"],
        title="A 卷",
        questions=[{"content": match_content, "answer": "±2", "knowledge_point": SHARED_KP, "question_type": "填空"}],
    )

    matched = find_question_by_content(world["db"], match_content, SHARED_KP, world["student_a_id"], exam.owner_user_id)

    assert matched is not None and matched.id == owned.id


def test_grading_created_question_gets_exam_owner(world):
    exam = _exam(
        world["db"],
        owner=world["teacher_a"].id,
        student=world["student_a_id"],
        title="A 新题卷",
        questions=[{"content": "全新批改题", "answer": "9", "knowledge_point": "乘方", "question_type": "填空"}],
    )
    grade_exam_core(
        world["db"],
        exam,
        results=[GradeResultItem(question_index=0, is_correct=False)],
        student_id=world["student_a_id"],
    )
    row = (
        world["db"].query(Question)
        .filter(Question.content == "全新批改题")
        .one()
    )
    assert row.owner_user_id == world["teacher_a"].id


def test_grading_unclaimed_exam_fails_closed(world):
    exam = _exam(
        world["db"],
        owner=None,
        student=world["student_a_id"],
        title="未认领卷",
        questions=[{"content": SHARED_CONTENT, "answer": "±2", "knowledge_point": SHARED_KP}],
    )
    with pytest.raises(HTTPException) as exc_info:
        grade_exam_core(world["db"], exam, results=[], student_id=world["student_a_id"])
    assert exc_info.value.status_code == 404
    assert world["db"].query(Question).filter(Question.source == "Exam Grading").count() == 0


def test_teacher_grade_endpoint_creates_owned_question(world):
    exam = _exam(
        world["db"],
        owner=world["teacher_a"].id,
        student=world["student_a_id"],
        title="端到端批改",
        questions=[{"content": "端到端题目", "answer": "5", "knowledge_point": "有理数", "question_type": "填空"}],
    )
    response = world["client"].post(
        f"/api/exams/{exam.id}/grade",
        json={"results": [{"question_index": 0, "is_correct": False}], "student_id": world["student_a_id"]},
    )
    assert response.status_code == 200
    row = world["db"].query(Question).filter(Question.content == "端到端题目").one()
    assert row.owner_user_id == world["teacher_a"].id


# ---------------------------------------------------------------- STUDENT PORTAL


def test_student_sees_exam_of_own_teacher(world):
    rows = list_student_exams(world["db"], world["student_a_id"])
    assert world["a_exam_assigned"].id in {row.id for row in rows}
    fetched = portal_get_exam(world["db"], world["student_a_id"], world["a_exam_assigned"].id)
    assert fetched.id == world["a_exam_assigned"].id


def test_student_cannot_see_cross_tenant_owner_mismatch_exam(world):
    corrupt = _exam(world["db"], owner=world["teacher_b"].id, student=world["student_a_id"], title="跨租户脏数据")
    assert corrupt.id not in {row.id for row in list_student_exams(world["db"], world["student_a_id"])}
    with pytest.raises(StudentPortalServiceError) as exc_info:
        portal_get_exam(world["db"], world["student_a_id"], corrupt.id)
    assert exc_info.value.status_code == 404


def test_student_grade_rejects_owner_mismatch_exam(world):
    corrupt = _exam(
        world["db"],
        owner=world["teacher_b"].id,
        student=world["student_a_id"],
        title="跨租户脏数据",
        questions=[{"content": SHARED_CONTENT, "answer": "±2", "knowledge_point": SHARED_KP}],
    )
    with pytest.raises(StudentPortalServiceError) as exc_info:
        grade_student_exam(
            world["db"],
            world["student_a_id"],
            corrupt.id,
            [StudentAnswerItem(question_index=0, student_answer="±2")],
        )
    assert exc_info.value.status_code == 404
    assert world["db"].query(Question).filter(Question.source == "Exam Grading").count() == 0
