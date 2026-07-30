"""Baseline schema marker for external bootstrap.

Revision ID: 388fe57f097c
Revises: 
Create Date: 2026-07-15 14:37:17.187845
"""
revision = '388fe57f097c'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Schema creation is handled by scripts/bootstrap_database.py for new
    # environments and by explicit maintenance scripts for legacy SQLite data.
    pass


def downgrade():
    pass
