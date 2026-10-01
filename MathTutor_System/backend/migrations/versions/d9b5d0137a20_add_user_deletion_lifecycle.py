"""Add durable user deletion state.

Revision ID: d9b5d0137a20
Revises: a6c8e2f91b40
"""
from alembic import op
import sqlalchemy as sa

revision = "d9b5d0137a20"
down_revision = "a6c8e2f91b40"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("deletion_state", sa.String(16), nullable=False, server_default="active"))
        batch.add_column(sa.Column("deletion_started_at", sa.DateTime(), nullable=True))


def downgrade():
    with op.batch_alter_table("users") as batch:
        batch.drop_column("deletion_started_at")
        batch.drop_column("deletion_state")
