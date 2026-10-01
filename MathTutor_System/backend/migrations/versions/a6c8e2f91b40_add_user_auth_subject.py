"""Add random immutable account subjects to existing and new users.

Revision ID: a6c8e2f91b40
Revises: f2b9c7a41d63
"""
from uuid import uuid4

from alembic import op
import sqlalchemy as sa

revision = "a6c8e2f91b40"
down_revision = "f2b9c7a41d63"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("auth_subject", sa.String(36), nullable=True))
    users = sa.table("users", sa.column("id", sa.Integer), sa.column("auth_subject", sa.String(36)))
    bind = op.get_bind()
    for user_id in bind.execute(sa.select(users.c.id)).scalars().all():
        bind.execute(users.update().where(users.c.id == user_id).values(auth_subject=str(uuid4())))
    subjects = bind.execute(sa.select(users.c.auth_subject)).scalars().all()
    if any(subject is None for subject in subjects) or len(set(subjects)) != len(subjects):
        raise RuntimeError("User auth_subject backfill did not establish unique non-null subjects")
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column("auth_subject", existing_type=sa.String(36), nullable=False)
        batch_op.create_index("ix_users_auth_subject", ["auth_subject"], unique=True)


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_index("ix_users_auth_subject")
        batch_op.drop_column("auth_subject")
