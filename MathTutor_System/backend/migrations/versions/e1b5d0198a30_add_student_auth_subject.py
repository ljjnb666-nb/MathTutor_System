"""Bind student credentials to random immutable account subjects.

Revision ID: e1b5d0198a30
Revises: d9b5d0137a20
"""
from uuid import uuid4

from alembic import op
import sqlalchemy as sa

revision = "e1b5d0198a30"
down_revision = "d9b5d0137a20"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("students", sa.Column("auth_subject", sa.String(36), nullable=True))
    students = sa.table("students", sa.column("id", sa.Integer), sa.column("auth_subject", sa.String(36)))
    bind = op.get_bind()
    for student_id in bind.execute(sa.select(students.c.id)).scalars().all():
        bind.execute(students.update().where(students.c.id == student_id).values(auth_subject=str(uuid4())))
    subjects = bind.execute(sa.select(students.c.auth_subject)).scalars().all()
    if any(subject is None for subject in subjects) or len(set(subjects)) != len(subjects):
        raise RuntimeError("Student auth_subject backfill did not establish unique non-null subjects")
    with op.batch_alter_table("students") as batch:
        batch.alter_column("auth_subject", existing_type=sa.String(36), nullable=False)
        batch.create_index("ix_students_auth_subject", ["auth_subject"], unique=True)


def downgrade() -> None:
    with op.batch_alter_table("students") as batch:
        batch.drop_index("ix_students_auth_subject")
        batch.drop_column("auth_subject")
