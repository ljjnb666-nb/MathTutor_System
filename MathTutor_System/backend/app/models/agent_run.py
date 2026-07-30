"""Persistent read-only Teacher Agent run log."""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.sqlite import JSON
from app.models.base import Base, created_at_column, pk_column, updated_at_column


class AgentRun(Base):
    __tablename__ = "agent_runs"

    id = pk_column()
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    goal = Column(Text, nullable=False)
    status = Column(String(32), nullable=False, default="created", index=True)
    intent_json = Column(JSON, nullable=True)
    context_snapshot_json = Column(JSON, nullable=True)
    selected_tools_json = Column(JSON, nullable=True)
    tool_calls_json = Column(JSON, nullable=True)
    plan_json = Column(JSON, nullable=True)
    missing_fields_json = Column(JSON, nullable=True)
    warnings_json = Column(JSON, nullable=True)
    error_code = Column(String(64), nullable=True)
    error_message = Column(String(512), nullable=True)
    created_at = created_at_column()
    updated_at = updated_at_column()
    completed_at = Column(DateTime, nullable=True)
