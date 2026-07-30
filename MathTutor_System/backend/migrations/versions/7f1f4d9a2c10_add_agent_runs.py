"""add agent runs

Revision ID: 7f1f4d9a2c10
Revises: 388fe57f097c
Create Date: 2026-07-30 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import sqlite

revision: str = "7f1f4d9a2c10"
down_revision: Union[str, None] = "388fe57f097c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "agent_runs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("goal", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("intent_json", sqlite.JSON(), nullable=True),
        sa.Column("context_snapshot_json", sqlite.JSON(), nullable=True),
        sa.Column("selected_tools_json", sqlite.JSON(), nullable=True),
        sa.Column("tool_calls_json", sqlite.JSON(), nullable=True),
        sa.Column("plan_json", sqlite.JSON(), nullable=True),
        sa.Column("missing_fields_json", sqlite.JSON(), nullable=True),
        sa.Column("warnings_json", sqlite.JSON(), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("error_message", sa.String(length=512), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_runs_user_id", "agent_runs", ["user_id"])
    op.create_index("ix_agent_runs_status", "agent_runs", ["status"])


def downgrade() -> None:
    op.drop_index("ix_agent_runs_status", table_name="agent_runs")
    op.drop_index("ix_agent_runs_user_id", table_name="agent_runs")
    op.drop_table("agent_runs")
