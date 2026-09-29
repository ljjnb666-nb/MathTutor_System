"""cascade practice data with its user, run, and artifact owners

Revision ID: f2b9c7a41d63
Revises: e4f7a1b9c2d8
Create Date: 2026-09-29 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f2b9c7a41d63"
down_revision: Union[str, None] = "e4f7a1b9c2d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_FOREIGN_KEYS = (
    ("agent_runs", "user_id", "users", "id"),
    ("agent_artifacts", "user_id", "users", "id"),
    ("agent_artifacts", "agent_run_id", "agent_runs", "id"),
    ("agent_actions", "user_id", "users", "id"),
    ("agent_actions", "agent_run_id", "agent_runs", "id"),
    ("agent_actions", "artifact_id", "agent_artifacts", "id"),
)
_SQLITE_NAMING = {
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
}


def _replace_sqlite_foreign_key(table: str, column: str, referred_table: str, referred_column: str, ondelete):
    generated_name = f"fk_{table}_{column}_{referred_table}"
    with op.batch_alter_table(table, naming_convention=_SQLITE_NAMING) as batch_op:
        batch_op.drop_constraint(generated_name, type_="foreignkey")
        batch_op.create_foreign_key(
            generated_name,
            referred_table,
            [column],
            [referred_column],
            ondelete=ondelete,
        )


def _replace_server_foreign_key(table: str, column: str, referred_table: str, referred_column: str, ondelete):
    bind = op.get_bind()
    foreign_keys = sa.inspect(bind).get_foreign_keys(table)
    existing = next(
        fk for fk in foreign_keys
        if fk["constrained_columns"] == [column]
        and fk["referred_table"] == referred_table
        and fk["referred_columns"] == [referred_column]
    )
    if existing.get("name"):
        op.drop_constraint(existing["name"], table, type_="foreignkey")
    name = f"fk_{table}_{column}_{referred_table}"
    op.create_foreign_key(name, table, referred_table, [column], [referred_column], ondelete=ondelete)


def _replace_foreign_keys(ondelete) -> None:
    bind = op.get_bind()
    replace = _replace_sqlite_foreign_key if bind.dialect.name == "sqlite" else _replace_server_foreign_key
    for table, column, referred_table, referred_column in _FOREIGN_KEYS:
        replace(table, column, referred_table, referred_column, ondelete)


def upgrade() -> None:
    _replace_foreign_keys("CASCADE")


def downgrade() -> None:
    _replace_foreign_keys(None)
