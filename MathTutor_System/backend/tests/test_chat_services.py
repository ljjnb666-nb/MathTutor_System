from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.chat_session import ChatMessage as ChatMessageModel
from app.models.chat_session import ChatSession
from app.models.mistake import MistakeRecord
from app.models.student import Student
from app.models.user import User
from app.schemas.chat_dto import ChatMessage, ChatRequest
from app.services.chat_context_service import get_student_context_for_chat, split_topics
from app.services.chat_session_service import (
    list_session_messages,
    persist_chat_turn,
    update_user_message,
)


def make_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            Student.__table__,
            ChatSession.__table__,
            ChatMessageModel.__table__,
            MistakeRecord.__table__,
        ],
    )
    SessionLocal = sessionmaker(bind=engine)
    return SessionLocal()


def test_split_topics_and_student_context():
    db = make_db()
    student = Student(id=1, user_id=10, name="Alice", grade="8", class_name="1")
    db.add(student)
    db.add_all(
        [
            MistakeRecord(
                student_id=1,
                topic="几何 + 勾股定理",
                source="exam",
                content="A" * 90,
                status="pending",
            ),
            MistakeRecord(
                student_id=1,
                topic="函数",
                source="quiz",
                content="一次函数应用",
                status="mastered",
            ),
        ]
    )
    db.commit()

    weak_points, summaries = get_student_context_for_chat(db, student_id=1, current_user_id=10)

    assert split_topics("A + B") == {"A", "B"}
    assert weak_points == ["几何", "勾股定理"]
    assert summaries == [f"【几何 + 勾股定理】{'A' * 80}…"]


def test_persist_chat_turn_creates_session_and_messages():
    db = make_db()
    first_content = "这是一段超过五十个字符的用户消息，用来验证会话标题会按原逻辑截断并追加省略号。" * 2
    request = ChatRequest(messages=[ChatMessage(role="user", content=first_content)], student_id=3)

    session = persist_chat_turn(db, request, user_id=10, assistant_content="assistant answer")
    messages = list_session_messages(db, session.id, user_id=10)

    assert session.title == first_content[:50] + "…"
    assert session.student_id == 3
    assert [(m.role, m.content) for m in messages] == [
        ("user", first_content),
        ("assistant", "assistant answer"),
    ]


def test_persist_chat_turn_skips_duplicate_last_user_for_existing_session():
    db = make_db()
    session = ChatSession(user_id=10, title="existing")
    db.add(session)
    db.flush()
    db.add(ChatMessageModel(session_id=session.id, role="user", content="regenerate this"))
    db.commit()

    request = ChatRequest(
        session_id=session.id,
        messages=[ChatMessage(role="user", content="regenerate this")],
    )
    persist_chat_turn(db, request, user_id=10, assistant_content="new answer")
    messages = list_session_messages(db, session.id, user_id=10)

    assert [(m.role, m.content) for m in messages] == [
        ("user", "regenerate this"),
        ("assistant", "new answer"),
    ]


def test_update_user_message_truncates_following_messages():
    db = make_db()
    session = ChatSession(user_id=10, title="existing")
    db.add(session)
    db.flush()
    db.add_all(
        [
            ChatMessageModel(session_id=session.id, role="user", content="old"),
            ChatMessageModel(session_id=session.id, role="assistant", content="old answer"),
            ChatMessageModel(session_id=session.id, role="user", content="follow up"),
        ]
    )
    db.commit()
    first_message = list_session_messages(db, session.id, user_id=10)[0]

    updated = update_user_message(db, session.id, first_message.id, user_id=10, content="new")
    messages = list_session_messages(db, session.id, user_id=10)

    assert updated.content == "new"
    assert [(m.role, m.content) for m in messages] == [("user", "new")]
