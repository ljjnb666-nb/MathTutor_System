"""add agent artifacts and actions

Revision ID: b4d8e2c9a713
Revises: 7f1f4d9a2c10
Create Date: 2026-07-30 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import sqlite

revision: str = "b4d8e2c9a713"
down_revision: Union[str, None] = "7f1f4d9a2c10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "agent_artifacts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("agent_run_id", sa.Integer(), nullable=False),
        sa.Column("artifact_type", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("content_json", sqlite.JSON(), nullable=False),
        sa.Column("validation_json", sqlite.JSON(), nullable=False),
        sa.Column("context_summary_json", sqlite.JSON(), nullable=True),
        sa.Column("student_id", sa.Integer(), nullable=True),
        sa.Column("knowledge_point", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["agent_run_id"], ["agent_runs.id"]),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_artifacts_user_id", "agent_artifacts", ["user_id"])
    op.create_index("ix_agent_artifacts_agent_run_id", "agent_artifacts", ["agent_run_id"])
    op.create_index("ix_agent_artifacts_artifact_type", "agent_artifacts", ["artifact_type"])
    op.create_index("ix_agent_artifacts_status", "agent_artifacts", ["status"])
    op.create_index("ix_agent_artifacts_student_id", "agent_artifacts", ["student_id"])

    op.create_table(
        "agent_actions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("agent_run_id", sa.Integer(), nullable=False),
        sa.Column("artifact_id", sa.Integer(), nullable=False),
        sa.Column("action_type", sa.String(length=96), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("payload_hash", sa.String(length=64), nullable=False),
        sa.Column("expected_artifact_version", sa.Integer(), nullable=False),
        sa.Column("result_json", sqlite.JSON(), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("error_message", sa.String(length=512), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["agent_run_id"], ["agent_runs.id"]),
        sa.ForeignKeyConstraint(["artifact_id"], ["agent_artifacts.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "action_type", "idempotency_key", name="uq_agent_actions_user_action_idempotency"),
    )
    op.create_index("ix_agent_actions_user_id", "agent_actions", ["user_id"])
    op.create_index("ix_agent_actions_agent_run_id", "agent_actions", ["agent_run_id"])
    op.create_index("ix_agent_actions_artifact_id", "agent_actions", ["artifact_id"])
    op.create_index("ix_agent_actions_action_type", "agent_actions", ["action_type"])
    op.create_index("ix_agent_actions_status", "agent_actions", ["status"])


def downgrade() -> None:
    op.drop_index("ix_agent_actions_status", table_name="agent_actions")
    op.drop_index("ix_agent_actions_action_type", table_name="agent_actions")
    op.drop_index("ix_agent_actions_artifact_id", table_name="agent_actions")
    op.drop_index("ix_agent_actions_agent_run_id", table_name="agent_actions")
    op.drop_index("ix_agent_actions_user_id", table_name="agent_actions")
    op.drop_table("agent_actions")
    op.drop_index("ix_agent_artifacts_student_id", table_name="agent_artifacts")
    op.drop_index("ix_agent_artifacts_status", table_name="agent_artifacts")
    op.drop_index("ix_agent_artifacts_artifact_type", table_name="agent_artifacts")
    op.drop_index("ix_agent_artifacts_agent_run_id", table_name="agent_artifacts")
    op.drop_index("ix_agent_artifacts_user_id", table_name="agent_artifacts")
    op.drop_table("agent_artifacts")
