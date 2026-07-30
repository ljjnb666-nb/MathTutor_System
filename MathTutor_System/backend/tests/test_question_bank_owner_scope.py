import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.plan import Plan
from app.models.question_bank import QuestionBank
from app.models.student import Student
from app.models.subscription import Subscription
from app.models.user import User
from app.services.question_bank_service import SaveQuestionToBankItem, save_questions_to_bank


def make_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine, tables=[User.__table__, Plan.__table__, Subscription.__table__, Student.__table__, QuestionBank.__table__])
    return sessionmaker(bind=engine)()


def seed_user(db, user_id, username):
    plan = Plan(code=f"free-{user_id}", name="Free", max_students=3, features={})
    db.add(plan)
    db.flush()
    user = User(id=user_id, username=username, hashed_password="x", role="teacher", is_active=True)
    db.add(user)
    db.flush()
    db.add(Subscription(user_id=user.id, plan_id=plan.id, status="active"))
    db.commit()
    return user


def item(content="same stem", answer="A", student_id=None):
    return SaveQuestionToBankItem(
        content=content,
        options=["A text", "B text"],
        answer=answer,
        question_type="choice",
        difficulty="medium",
        knowledge_point="函数",
        student_id=student_id,
    )


def test_owner_is_set_for_studentless_agent_questions_and_dedupe_is_owner_scoped():
    db = make_db()
    teacher_a = seed_user(db, 1, "teacher-a")
    teacher_b = seed_user(db, 2, "teacher-b")

    row_a = save_questions_to_bank(db, teacher_a, [item(answer="A text")])[0]
    row_b = save_questions_to_bank(db, teacher_b, [item(answer="A text")])[0]
    db.commit()

    assert row_a.owner_user_id == teacher_a.id
    assert row_b.owner_user_id == teacher_b.id
    assert row_a.id != row_b.id
    assert db.query(QuestionBank).count() == 2


def test_student_questions_are_owned_by_current_teacher():
    db = make_db()
    teacher = seed_user(db, 1, "teacher-a")
    student = Student(id=10, user_id=teacher.id, name="student-a", grade="G7", class_name="Class 1")
    db.add(student)
    db.commit()

    row = save_questions_to_bank(db, teacher, [item(student_id=student.id, answer="A text")])[0]
    db.commit()

    assert row.owner_user_id == teacher.id
    assert row.student_id == student.id


def test_choice_answer_must_match_actual_options():
    db = make_db()
    teacher = seed_user(db, 1, "teacher-a")

    with pytest.raises(HTTPException) as exc:
        save_questions_to_bank(db, teacher, [item(answer="F")])

    assert exc.value.status_code == 400
