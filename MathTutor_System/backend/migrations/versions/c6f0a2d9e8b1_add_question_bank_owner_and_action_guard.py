"""add question bank owner and action artifact guard

Revision ID: c6f0a2d9e8b1
Revises: b4d8e2c9a713
Create Date: 2026-07-31 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c6f0a2d9e8b1"
down_revision: Union[str, None] = "b4d8e2c9a713"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("question_bank") as batch_op:
        batch_op.add_column(sa.Column("owner_user_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key("fk_question_bank_owner_user_id_users", "users", ["owner_user_id"], ["id"])
        batch_op.create_index("ix_question_bank_owner_user_id", ["owner_user_id"])

    op.execute(
        sa.text(
            """
            UPDATE question_bank
            SET owner_user_id = (
                SELECT students.user_id
                FROM students
                WHERE students.id = question_bank.student_id
            )
            WHERE student_id IS NOT NULL
              AND owner_user_id IS NULL
            """
        )
    )

    with op.batch_alter_table("agent_actions") as batch_op:
        batch_op.create_unique_constraint(
            "uq_agent_actions_artifact_action_version",
            ["artifact_id", "action_type", "expected_artifact_version"],
        )


def downgrade() -> None:
    with op.batch_alter_table("agent_actions") as batch_op:
        batch_op.drop_constraint("uq_agent_actions_artifact_action_version", type_="unique")

    with op.batch_alter_table("question_bank") as batch_op:
        batch_op.drop_index("ix_question_bank_owner_user_id")
        batch_op.drop_constraint("fk_question_bank_owner_user_id_users", type_="foreignkey")
        batch_op.drop_column("owner_user_id")
