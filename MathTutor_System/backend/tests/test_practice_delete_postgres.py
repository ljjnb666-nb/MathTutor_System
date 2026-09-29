"""Real PostgreSQL coverage for practice-content FK deletion semantics.

Set TUTORPRO_TEST_POSTGRES_URL to an isolated test database URL to enable this
integration test. The suite intentionally does not fall back to a mock or SQLite.
"""
import os

import pytest
from sqlalchemy import create_engine, inspect, text

from app.models.agent_artifact import AgentAction, AgentArtifact
from app.models.agent_run import AgentRun
from app.models.base import Base
from app.models.student import Student
from app.models.user import User


POSTGRES_URL = os.environ.get("TUTORPRO_TEST_POSTGRES_URL")
pytestmark = pytest.mark.skipif(not POSTGRES_URL, reason="requires isolated PostgreSQL via TUTORPRO_TEST_POSTGRES_URL")


def test_postgresql_database_cascades_user_delete_through_practice_graph():
    engine = create_engine(POSTGRES_URL)
    tables = [User.__table__, Student.__table__, AgentRun.__table__, AgentArtifact.__table__, AgentAction.__table__]
    try:
        Base.metadata.create_all(engine, tables=tables)
        inspector = inspect(engine)
        expected = {
            ("agent_runs", "user_id", "users"),
            ("agent_artifacts", "user_id", "users"),
            ("agent_artifacts", "agent_run_id", "agent_runs"),
            ("agent_actions", "user_id", "users"),
            ("agent_actions", "agent_run_id", "agent_runs"),
            ("agent_actions", "artifact_id", "agent_artifacts"),
        }
        actual = set()
        for table in ("agent_runs", "agent_artifacts", "agent_actions"):
            for fk in inspector.get_foreign_keys(table):
                actual.add((table, fk["constrained_columns"][0], fk["referred_table"]))
                if (table, fk["constrained_columns"][0], fk["referred_table"]) in expected:
                    assert fk["options"].get("ondelete") == "CASCADE"
        assert expected.issubset(actual)

        with engine.begin() as connection:
            user_id = connection.execute(
                text("INSERT INTO users (username, hashed_password, is_active, role, created_at) "
                     "VALUES ('pg-delete-owner', 'x', true, 'teacher', CURRENT_TIMESTAMP) RETURNING id")
            ).scalar_one()
            run_id = connection.execute(
                text("INSERT INTO agent_runs (user_id, goal, status, context_snapshot_json, created_at, updated_at) "
                     "VALUES (:user_id, 'PRIVATE_PG_PROMPT', 'completed', '{\"student\":\"PRIVATE_PG_CONTEXT\"}', "
                     "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id"),
                {"user_id": user_id},
            ).scalar_one()
            artifact_id = connection.execute(
                text("INSERT INTO agent_artifacts (user_id, agent_run_id, artifact_type, status, version, title, "
                     "content_json, validation_json, context_summary_json, created_at, updated_at) "
                     "VALUES (:user_id, :run_id, 'practice_set', 'ready_for_confirmation', 1, 'Private draft', "
                     "'{\"question\":\"PRIVATE_PG_QUESTION\"}', '{}', '{\"context\":\"PRIVATE_PG_CONTEXT\"}', "
                     "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id"),
                {"user_id": user_id, "run_id": run_id},
            ).scalar_one()
            action_id = connection.execute(
                text("INSERT INTO agent_actions (user_id, agent_run_id, artifact_id, action_type, status, "
                     "idempotency_key, payload_hash, expected_artifact_version, result_json, created_at) "
                     "VALUES (:user_id, :run_id, :artifact_id, 'save_practice_set', 'completed', 'pg-test-key', "
                     ":payload_hash, 1, '{\"response\":\"PRIVATE_PG_RESPONSE\"}', CURRENT_TIMESTAMP) RETURNING id"),
                {"user_id": user_id, "run_id": run_id, "artifact_id": artifact_id, "payload_hash": "a" * 64},
            ).scalar_one()

            # Direct SQL proves the FK graph, independently of ORM unit-of-work behavior.
            connection.execute(text("DELETE FROM users WHERE id = :id"), {"id": user_id})
            for table, row_id in (
                ("agent_runs", run_id),
                ("agent_artifacts", artifact_id),
                ("agent_actions", action_id),
            ):
                assert connection.execute(
                    text(f"SELECT count(*) FROM {table} WHERE id = :id"), {"id": row_id}
                ).scalar_one() == 0
            assert connection.execute(
                text("SELECT count(*) FROM agent_artifacts WHERE user_id = :id"), {"id": user_id}
            ).scalar_one() == 0
            assert connection.execute(
                text("SELECT count(*) FROM agent_actions WHERE user_id = :id"), {"id": user_id}
            ).scalar_one() == 0
    finally:
        Base.metadata.drop_all(engine, tables=tables)
        engine.dispose()
