"""PHASE 2B-5B: durable SQL tenant purge with enforced foreign keys."""

from datetime import date
import os
from uuid import uuid4
import pytest
from sqlalchemy import create_engine, event, select, text
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.orm import sessionmaker
from app.models.base import Base
from app.models import (
    AgentAction,
    AgentArtifact,
    AgentRun,
    ChatMessage,
    ChatSession,
    Exam,
    MistakeRecord,
    Order,
    Plan,
    Question,
    QuestionBank,
    Schedule,
    Student,
    Subscription,
    SubscriptionHistory,
    User,
)
from app.services.user_admin_service import (
    delete_user_and_related,
    UserAdminServiceError,
)

USER_TENANT_PURGE_TABLES = {
    "users",
    "students",
    "mistake_records",
    "questions",
    "question_bank",
    "exams",
    "chat_sessions",
    "chat_messages",
    "schedules",
    "agent_runs",
    "agent_artifacts",
    "agent_actions",
    "subscriptions",
    "subscription_history",
    "orders",
}
PRESERVE_TABLES = {"plans"}


@pytest.fixture(params=["sqlite", "postgres"])
def database(request, tmp_path):
    if request.param == "postgres":
        url = os.environ.get("TUTORPRO_TEST_POSTGRES_URL")
        if not url:
            pytest.skip("NOT_RUN_ENV_UNAVAILABLE: TUTORPRO_TEST_POSTGRES_URL")
        engine = create_engine(url)
        schema = "purge_test_" + uuid4().hex
        with engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))

        @event.listens_for(engine, "connect")
        def search_path(connection, _):
            with connection.cursor() as cursor:
                cursor.execute(f'SET search_path TO "{schema}"')
            connection.commit()

        engine.dispose()
    else:
        engine = create_engine(f'sqlite:///{tmp_path / "purge.sqlite"}')

        @event.listens_for(engine, "connect")
        def foreign_keys(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")

    try:
        Base.metadata.create_all(engine)
        factory = sessionmaker(bind=engine)
        with factory() as db:
            db.add_all(
                [
                    User(
                        id=i,
                        username=f"user-{i}",
                        hashed_password="x",
                        role="admin" if i == 1 else "teacher",
                    )
                    for i in (1, 2, 3)
                ]
            )
            db.add(
                Plan(
                    id=1,
                    code="free",
                    name="Free",
                    max_students=10,
                    features={},
                    sort_order=1,
                )
            )
            db.commit()
        yield factory
    finally:
        if request.param == "postgres":
            with engine.begin() as connection:
                connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        engine.dispose()


def resource(model, owner, student=None):
    if model is Exam:
        return Exam(owner_user_id=owner, student_id=student, title="exam", questions=[])
    kwargs = dict(
        owner_user_id=owner,
        student_id=student,
        content="question",
        answer="A",
        analysis="",
        options=[],
        question_type="single_choice",
        difficulty="medium",
        knowledge_point="algebra",
        source="manual",
    )
    if model is QuestionBank:
        kwargs.update(content_hash="a" * 64, tags=[], images=[])
    return model(**kwargs)


def tenant(db, uid):
    student = Student(
        user_id=uid,
        name="Student",
        grade="8",
        class_name="1",
        login_code=f"code-{uid}",
        hashed_password="private",
    )
    run = AgentRun(user_id=uid, goal="private", status="completed")
    db.add_all([student, run])
    db.flush()
    artifact = AgentArtifact(
        user_id=uid,
        agent_run_id=run.id,
        student_id=student.id,
        artifact_type="practice_set",
        status="draft",
        title="private",
        content_json={},
        validation_json={},
    )
    chat = ChatSession(user_id=uid, student_id=student.id, title="private")
    db.add_all([artifact, chat])
    db.flush()
    db.add_all(
        [
            AgentAction(
                user_id=uid,
                agent_run_id=run.id,
                artifact_id=artifact.id,
                action_type="save",
                status="completed",
                idempotency_key=f"key-{uid}",
                payload_hash="a" * 64,
                expected_artifact_version=1,
            ),
            ChatMessage(session_id=chat.id, role="user", content="private"),
            Schedule(
                user_id=uid,
                student_id=student.id,
                schedule_date=date.today(),
                start_time="10:00",
                end_time="11:00",
            ),
            MistakeRecord(
                student_id=student.id, topic="algebra", source="exam", content="private"
            ),
            Subscription(user_id=uid, plan_id=1, status="active"),
            SubscriptionHistory(user_id=uid, plan_id=1),
            Order(user_id=uid, plan_id=1, amount=10, out_trade_no=f"order-{uid}"),
            *[resource(m, uid, student.id) for m in (Question, QuestionBank, Exam)],
        ]
    )
    db.commit()
    return student.id, run.id, artifact.id


def snapshot(factory):
    # Read every column through a fresh session, outside the purging identity map.
    with factory() as db:
        return {
            t.name: [tuple(r) for r in db.execute(select(t).order_by(t.c.id))]
            for t in Base.metadata.sorted_tables
        }


def observe_mutations(db):
    statements = []

    def record(connection, cursor, statement, parameters, context, executemany):
        if statement.lstrip().split()[0].upper() in {"DELETE", "UPDATE", "INSERT"}:
            statements.append(statement)

    event.listen(db.get_bind(), "before_cursor_execute", record)
    return statements, record


def test_explicit_policy_covers_entire_user_fk_graph():
    reachable = {"users"}
    while True:
        found = reachable | {
            t.name
            for t in Base.metadata.tables.values()
            if any(f.column.table.name in reachable for f in t.foreign_keys)
        }
        if found == reachable:
            break
        reachable = found
    assert reachable == USER_TENANT_PURGE_TABLES
    assert set(Base.metadata.tables) == USER_TENANT_PURGE_TABLES | PRESERVE_TABLES


def test_complete_purge_other_tenant_and_unclaimed_survive(database):
    with database() as db:
        sid, _, _ = tenant(db, 2)
        tenant(db, 3)
        chat_id = db.query(ChatSession).filter(ChatSession.user_id == 2).one().id
        db.add_all([resource(m, None) for m in (Question, QuestionBank, Exam)])
        db.commit()
        expected = snapshot(database)
        for t in Base.metadata.sorted_tables:
            if t.name == "plans":
                continue
            owner, key = (
                ("owner_user_id", 2) if "owner_user_id" in t.c else ("user_id", 2)
            )
            if t.name == "users":
                owner = "id"
            elif t.name == "mistake_records":
                owner, key = "student_id", sid
            elif t.name == "chat_messages":
                owner, key = "session_id", chat_id
            index = list(t.c.keys()).index(owner)
            expected[t.name] = [r for r in expected[t.name] if r[index] != key]
        commits = []
        event.listen(db, "after_commit", lambda session: commits.append(True))
        delete_user_and_related(db, 2, 1)
        assert len(commits) == 1
        assert snapshot(database) == expected
        assert db.get(Student, sid) is None


@pytest.mark.parametrize(
    "model", [Question, QuestionBank, Exam, ChatSession, Schedule, AgentArtifact]
)
def test_target_owned_resource_can_reference_other_student(database, model):
    with database() as db:
        tenant(db, 2)
        other_student, _, _ = tenant(db, 3)
        column = (
            model.owner_user_id
            if model in (Question, QuestionBank, Exam)
            else model.user_id
        )
        db.query(model).filter(column == 2).one().student_id = other_student
        db.commit()
        other_before = snapshot(database)["students"][1]
        delete_user_and_related(db, 2, 1)
        assert snapshot(database)["students"] == [other_before]


@pytest.mark.parametrize(
    "model,owner",
    [
        *[(m, o) for m in (Question, QuestionBank, Exam) for o in (3, None)],
        (ChatSession, 3),
        (Schedule, 3),
        (AgentArtifact, 3),
    ],
)
def test_dirty_student_reference_blocks_before_any_mutation(database, model, owner):
    with database() as db:
        sid, _, _ = tenant(db, 2)
        tenant(db, 3)
        if owner is None:
            db.add(resource(model, None, sid))
        else:
            column = (
                model.owner_user_id
                if model in (Question, QuestionBank, Exam)
                else model.user_id
            )
            db.query(model).filter(column == owner).one().student_id = sid
        db.commit()
        before = snapshot(database)
        statements, listener = observe_mutations(db)
        try:
            with pytest.raises(UserAdminServiceError) as error:
                delete_user_and_related(db, 2, 1)
            assert error.value.status_code == 409
            assert (
                error.value.detail
                == "该用户存在跨租户或归属不明的数据引用，删除已取消，请先修复数据关系"
            )
            assert statements == []
        finally:
            event.remove(db.get_bind(), "before_cursor_execute", listener)
        assert snapshot(database) == before
        assert db.get(User, 2) is not None


@pytest.mark.parametrize("edge", ["artifact-run", "action-run", "action-artifact"])
def test_dirty_agent_cascade_blocks(database, edge):
    with database() as db:
        _, run_id, artifact_id = tenant(db, 2)
        tenant(db, 3)
        if edge == "artifact-run":
            db.query(AgentArtifact).filter(
                AgentArtifact.user_id == 3
            ).one().agent_run_id = run_id
        elif edge == "action-run":
            db.query(AgentAction).filter(
                AgentAction.user_id == 3
            ).one().agent_run_id = run_id
        else:
            action = db.query(AgentAction).filter(AgentAction.user_id == 3).one()
            action.artifact_id = artifact_id
            action.expected_artifact_version = 2
        db.commit()
        before = snapshot(database)
        statements, listener = observe_mutations(db)
        try:
            with pytest.raises(UserAdminServiceError) as error:
                delete_user_and_related(db, 2, 1)
            assert error.value.status_code == 409
            assert statements == []
        finally:
            event.remove(db.get_bind(), "before_cursor_execute", listener)
        assert snapshot(database) == before


@pytest.mark.parametrize("failure", ["runtime", "integrity", "dbapi", "commit"])
def test_late_failure_rolls_back_complete_tenant_and_session_is_reusable(
    database, monkeypatch, failure
):
    with database() as db:
        sid, _, _ = tenant(db, 2)
        tenant(db, 3)
        before = snapshot(database)
        statements, listener = observe_mutations(db)

        def fail_at_user(
            connection, cursor, statement, parameters, context, executemany
        ):
            if not statement.startswith("DELETE FROM users "):
                return
            assert len(statements) >= 10
            if failure == "runtime":
                raise RuntimeError("late failure")
            if failure == "dbapi":
                raise DBAPIError("injected", {}, RuntimeError("db error"))
            if failure == "integrity":
                # A real late FK reference survives the earlier Order purge.
                # The final users DELETE itself must fail with IntegrityError.
                connection.execute(
                    Order.__table__.insert().values(
                        user_id=2, plan_id=1, amount=10, out_trade_no="late-reference"
                    )
                )

        event.listen(db.get_bind(), "before_cursor_execute", fail_at_user)
        if failure == "commit":

            def fail_commit():
                db.flush()
                raise RuntimeError("commit failure")

            monkeypatch.setattr(db, "commit", fail_commit)
        expected = (
            UserAdminServiceError
            if failure == "integrity"
            else DBAPIError if failure == "dbapi" else RuntimeError
        )
        try:
            with pytest.raises(expected) as error:
                delete_user_and_related(db, 2, 1)
            if failure == "integrity":
                assert error.value.status_code == 409
                assert isinstance(error.value.__cause__, IntegrityError)
                assert error.value.__cause__.statement.startswith("DELETE FROM users ")
            assert not db.in_transaction()
            assert snapshot(database) == before
            assert db.get(Student, sid) is not None
        finally:
            event.remove(db.get_bind(), "before_cursor_execute", fail_at_user)
            event.remove(db.get_bind(), "before_cursor_execute", listener)


@pytest.mark.parametrize("uid,status", [(1, 400), (99999, 404)])
def test_self_and_missing_user_zero_mutation(database, uid, status):
    with database() as db:
        tenant(db, 2)
        before = snapshot(database)
        statements, listener = observe_mutations(db)
        try:
            with pytest.raises(UserAdminServiceError) as error:
                delete_user_and_related(db, uid, 1)
            assert error.value.status_code == status
            assert statements == []
        finally:
            event.remove(db.get_bind(), "before_cursor_execute", listener)
        assert snapshot(database) == before


def test_existing_teacher_and_student_credentials_revoked(database):
    from fastapi import HTTPException
    from fastapi.security import HTTPAuthorizationCredentials
    from app.api.endpoints.auth import get_current_user
    from app.core.security import create_access_token
    from app.services.student_portal_service import (
        get_current_student_from_token,
        StudentPortalServiceError,
    )

    with database() as db:
        sid, _, _ = tenant(db, 2)
        user = db.get(User, 2)
        token = create_access_token(
            {
                "sub": user.auth_subject,
                "uid": user.id,
                "username": user.username,
                "type": "teacher",
            }
        )
        credential = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        student = db.get(Student, sid)
        student_token = create_access_token({
            "type": "student", "sub": student.auth_subject, "sid": sid,
            "owner_uid": user.id, "owner_sub": user.auth_subject,
        })
        assert get_current_user(credential, db).id == 2
        assert get_current_student_from_token(db, student_token).id == sid
        delete_user_and_related(db, 2, 1)
        with pytest.raises(HTTPException) as teacher_error:
            get_current_user(credential, db)
        assert teacher_error.value.status_code == 401
        with pytest.raises(StudentPortalServiceError) as student_error:
            get_current_student_from_token(db, student_token)
        assert student_error.value.status_code == 401


def test_purge_with_preloaded_student_relationships(database):
    with database() as db:
        sid, _, _ = tenant(db, 2)
        user = db.get(User, 2)
        assert user.students[0].id == sid
        assert user.students[0].mistake_records
        delete_user_and_related(db, 2, 1)
        assert snapshot(database)["students"] == []
        assert snapshot(database)["mistake_records"] == []


@pytest.mark.parametrize("side", ["user", "child"])
def test_rb01_all_relationships_preloaded_purge_is_durable_and_session_reusable(
    database, side, monkeypatch
):
    from sqlalchemy import inspect

    with database() as db:
        tenant(db, 2)
        tenant(db, 3)
        before = snapshot(database)
        target = db.get(User, 2)

        def forbid_orm_delete(instance):
            pytest.fail("Tenant purge must not use ORM instance deletion")

        monkeypatch.setattr(db, "delete", forbid_orm_delete)
        if side == "user":
            for name in (
                "students",
                "chat_sessions",
                "schedules",
                "subscription",
                "subscription_histories",
            ):
                assert getattr(target, name)
                assert name not in inspect(target).unloaded
        else:
            loaded_children = []
            for model, relationship in (
                (Student, "owner"),
                (ChatSession, "user"),
                (Schedule, "owner"),
                (Subscription, "user"),
                (SubscriptionHistory, "user"),
            ):
                child = db.query(model).filter(model.user_id == 2).one()
                loaded_children.append(child)
                assert getattr(child, relationship) is target
                assert relationship not in inspect(child).unloaded
        delete_user_and_related(db, 2, 1)
        assert [user.id for user in db.query(User).order_by(User.id).all()] == [1, 3]
        assert not db.get(User, 2)
        after = snapshot(database)
        for table in Base.metadata.sorted_tables:
            if table.name == "plans":
                assert after[table.name] == before[table.name]
            else:
                # Both full tenant graphs are seeded in order: target first,
                # other second. Users additionally include the admin.
                expected = (
                    before[table.name][1:]
                    if table.name != "users"
                    else [before["users"][0], before["users"][2]]
                )
                assert after[table.name] == expected


def test_rb01_unexpected_user_delete_count_rolls_back(database, monkeypatch):
    from sqlalchemy.orm import Query

    with database() as db:
        tenant(db, 2)
        tenant(db, 3)
        before = snapshot(database)
        original_delete = Query.delete

        def unexpected_user_count(query, *args, **kwargs):
            if query.column_descriptions[0]["entity"] is User:
                assert kwargs["synchronize_session"] == "fetch"
                return 0
            return original_delete(query, *args, **kwargs)

        monkeypatch.setattr(Query, "delete", unexpected_user_count)
        with pytest.raises(RuntimeError, match="exactly one user"):
            delete_user_and_related(db, 2, 1)
        assert not db.in_transaction()
        assert db.get(User, 2) is not None
        assert snapshot(database) == before
