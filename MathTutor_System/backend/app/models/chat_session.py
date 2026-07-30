"""
Persisted chat sessions and messages.
"""
from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.models.base import Base, created_at_column, pk_column


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = pk_column()
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=True, index=True)
    title = Column(String(255), nullable=True)
    pinned = Column(Boolean, nullable=False, default=False)
    created_at = created_at_column()

    user = relationship("User", backref="chat_sessions")
    student = relationship("Student", backref="chat_sessions")
    messages = relationship("ChatMessage", back_populates="session", order_by="ChatMessage.created_at")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = pk_column()
    session_id = Column(Integer, ForeignKey("chat_sessions.id"), nullable=False, index=True)
    role = Column(String(32), nullable=False)
    content = Column(Text, nullable=False)
    created_at = created_at_column()

    session = relationship("ChatSession", back_populates="messages")
