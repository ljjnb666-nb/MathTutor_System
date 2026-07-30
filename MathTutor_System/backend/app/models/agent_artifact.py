"""Versioned Teacher Agent artifacts and confirmed actions."""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.sqlite import JSON

from app.models.base import Base, created_at_column, pk_column, updated_at_column


class AgentArtifact(Base):
    __tablename__ = "agent_artifacts"

    id = pk_column()
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    agent_run_id = Column(Integer, ForeignKey("agent_runs.id"), nullable=False, index=True)
    artifact_type = Column(String(64), nullable=False, index=True)
    status = Column(String(32), nullable=False, index=True)
    version = Column(Integer, nullable=False, default=1)
    title = Column(String(255), nullable=False)
    content_json = Column(JSON, nullable=False)
    validation_json = Column(JSON, nullable=False)
    context_summary_json = Column(JSON, nullable=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=True, index=True)
    knowledge_point = Column(String(255), nullable=True)
    created_at = created_at_column()
    updated_at = updated_at_column()
    confirmed_at = Column(DateTime, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)


class AgentAction(Base):
    __tablename__ = "agent_actions"
    __table_args__ = (
        UniqueConstraint("user_id", "action_type", "idempotency_key", name="uq_agent_actions_user_action_idempotency"),
    )

    id = pk_column()
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    agent_run_id = Column(Integer, ForeignKey("agent_runs.id"), nullable=False, index=True)
    artifact_id = Column(Integer, ForeignKey("agent_artifacts.id"), nullable=False, index=True)
    action_type = Column(String(96), nullable=False, index=True)
    status = Column(String(32), nullable=False, index=True)
    idempotency_key = Column(String(128), nullable=False)
    payload_hash = Column(String(64), nullable=False)
    expected_artifact_version = Column(Integer, nullable=False)
    result_json = Column(JSON, nullable=True)
    error_code = Column(String(64), nullable=True)
    error_message = Column(String(512), nullable=True)
    created_at = created_at_column()
    confirmed_at = Column(DateTime, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
