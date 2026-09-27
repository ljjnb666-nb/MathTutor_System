"""add resource owner columns

Revision ID: b7e2c94f6a15
Revises: 7f1f4d9a2c10
Create Date: 2026-09-27 00:00:00.000000

owner_user_id 是租户归属的唯一事实来源；student_id 仅表示布置/业务上下文。
回填策略（确定性，绝不猜测归属）：
  - student_id 非空且引用的学生存在且学生有归属教师 -> owner = Student.user_id
  - student_id 为空 / 学生不存在 / 学生无归属教师 -> owner 保持 NULL（unclaimed）
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b7e2c94f6a15"
down_revision: Union[str, None] = "7f1f4d9a2c10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OWNER_TABLES = ("questions", "question_bank", "exams")


def upgrade() -> None:
    for table in OWNER_TABLES:
        with op.batch_alter_table(table) as batch_op:
            batch_op.add_column(sa.Column("owner_user_id", sa.Integer(), nullable=True))
            batch_op.create_foreign_key(
                f"fk_{table}_owner_user_id_users",
                "users",
                ["owner_user_id"],
                ["id"],
            )
        op.create_index(f"ix_{table}_owner_user_id", table, ["owner_user_id"])
    _backfill_owner_from_student()


def _backfill_owner_from_student() -> None:
    # 关联子查询回填：学生缺失或 students.user_id 为 NULL 时子查询结果为 NULL，
    # 行保持 unclaimed；绝不指派给任意用户。
    for table in OWNER_TABLES:
        op.execute(
            f"UPDATE {table} SET owner_user_id = ("
            f"SELECT students.user_id FROM students WHERE students.id = {table}.student_id"
            f") WHERE student_id IS NOT NULL"
        )


def downgrade() -> None:
    for table in OWNER_TABLES:
        op.drop_index(f"ix_{table}_owner_user_id", table_name=table)
        with op.batch_alter_table(table) as batch_op:
            batch_op.drop_constraint(f"fk_{table}_owner_user_id_users", type_="foreignkey")
            batch_op.drop_column("owner_user_id")
