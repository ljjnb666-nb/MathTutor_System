"""
PHASE 2B-2B：owner_user_id 资源归属迁移与全新 schema 测试。

- 遗留库（7f1f4d9a2c10 schema）升级到 head：列/索引/FK 元数据、确定性回填、幂等、可降级
- 全新 Base.metadata.create_all：owner 列/索引/FK 元数据直接存在
全部使用隔离的临时 SQLite 文件库，不触碰真实数据库。
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from sqlalchemy import create_engine, inspect, text

from app.models.base import Base

BACKEND_DIR = Path(__file__).resolve().parents[1]
TEST_TMP_DIR = Path(__file__).resolve().parent / ".tmp_owner_migration"
BASELINE_REVISION = "388fe57f097c"
AGENT_RUNS_REVISION = "7f1f4d9a2c10"
OWNER_REVISION = "b7e2c94f6a15"
OWNER_TABLES = ("questions", "question_bank", "exams")

LEGACY_DDL_STATEMENTS = (
    """
    CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username VARCHAR(128) NOT NULL UNIQUE,
        hashed_password VARCHAR(256) NOT NULL,
        is_active BOOLEAN NOT NULL,
        role VARCHAR(32) NOT NULL,
        created_at DATETIME
    )
    """,
    """
    CREATE TABLE students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        name VARCHAR(128) NOT NULL,
        grade VARCHAR(64) NOT NULL,
        class_name VARCHAR(64) NOT NULL,
        tags TEXT,
        performance_score INTEGER,
        created_at DATETIME,
        login_code VARCHAR(32),
        hashed_password VARCHAR(256)
    )
    """,
    """
    CREATE TABLE questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER,
        content TEXT NOT NULL,
        options TEXT,
        answer TEXT NOT NULL,
        analysis TEXT NOT NULL,
        knowledge_point VARCHAR(255) NOT NULL,
        difficulty VARCHAR(10) NOT NULL,
        question_type VARCHAR(64) NOT NULL,
        source VARCHAR(64) NOT NULL,
        created_at DATETIME
    )
    """,
    """
    CREATE TABLE question_bank (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER,
        content TEXT NOT NULL,
        options TEXT,
        answer TEXT NOT NULL,
        analysis TEXT NOT NULL,
        question_type VARCHAR(64) NOT NULL,
        difficulty VARCHAR(16) NOT NULL,
        knowledge_point VARCHAR(255) NOT NULL,
        source VARCHAR(64) NOT NULL,
        tags TEXT,
        images TEXT,
        content_hash VARCHAR(64) NOT NULL,
        created_at DATETIME
    )
    """,
    """
    CREATE TABLE exams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title VARCHAR(256) NOT NULL,
        student_id INTEGER,
        questions TEXT,
        created_at DATETIME,
        assignment_date DATE,
        graded_at DATETIME,
        grade_summary TEXT,
        grade_results TEXT
    )
    """,
    """
    CREATE TABLE agent_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        goal TEXT NOT NULL,
        status VARCHAR(32) NOT NULL,
        intent_json JSON,
        context_snapshot_json JSON,
        selected_tools_json JSON,
        tool_calls_json JSON,
        plan_json JSON,
        missing_fields_json JSON,
        warnings_json JSON,
        error_code VARCHAR(64),
        error_message VARCHAR(512),
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        completed_at DATETIME,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
    """,
)


def _run_alembic(*args: str, db_url: str) -> None:
    env = os.environ.copy()
    env["DATABASE_URL"] = db_url
    result = subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND_DIR,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"alembic {' '.join(args)} failed: {result.stderr}"


def _build_legacy_db(db_path: Path) -> str:
    """构造上一代 head（7f1f4d9a2c10）等价的遗留 schema 并写入三教师世界数据。"""
    db_url = f"sqlite:///{db_path.as_posix()}"
    engine = create_engine(db_url)
    with engine.begin() as conn:
        for statement in LEGACY_DDL_STATEMENTS:
            conn.execute(text(statement))
        conn.execute(text("CREATE INDEX ix_agent_runs_user_id ON agent_runs (user_id)"))
        conn.execute(text("CREATE INDEX ix_agent_runs_status ON agent_runs (status)"))
        conn.execute(
            text(
                "insert into users (id, username, hashed_password, is_active, role, created_at) values "
                "(1, 'teacher-a', 'x', 1, 'teacher', CURRENT_TIMESTAMP), "
                "(2, 'teacher-b', 'x', 1, 'teacher', CURRENT_TIMESTAMP)"
            )
        )
        conn.execute(
            text(
                "insert into students (id, user_id, name, grade, class_name, tags, performance_score, created_at) values "
                "(10, 1, '学生A', '高一', '1班', '[]', 60, CURRENT_TIMESTAMP), "
                "(20, 2, '学生B', '高一', '2班', '[]', 60, CURRENT_TIMESTAMP)"
            )
        )
        conn.execute(
            text(
                "insert into agent_runs (id, user_id, goal, status, context_snapshot_json, created_at, updated_at) "
                "values (1, 1, 'legacy practice prompt', 'completed', '{\"student\":\"context\"}', "
                "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            )
        )
        for table in ("questions", "question_bank", "exams"):
            student_ids = (10, 20, None, 999999)
            for index, student_id in enumerate(student_ids, start=1):
                if table == "questions":
                    conn.execute(
                        text(
                            "insert into questions (student_id, content, options, answer, analysis, "
                            "knowledge_point, difficulty, question_type, source, created_at) values "
                            "(:sid, :content, '[]', '答案', '', 'kp', 'L3', '解答', 'test', CURRENT_TIMESTAMP)"
                        ),
                        {"sid": student_id, "content": f"{table}-{index}"},
                    )
                elif table == "question_bank":
                    conn.execute(
                        text(
                            "insert into question_bank (student_id, content, options, answer, analysis, "
                            "question_type, difficulty, knowledge_point, source, tags, images, content_hash, created_at) "
                            "values (:sid, :content, '[]', '答案', '', '解答', 'L3', 'kp', 'test', '[]', '[]', :ch, CURRENT_TIMESTAMP)"
                        ),
                        {"sid": student_id, "content": f"{table}-{index}", "ch": f"{table}-{index}"},
                    )
                else:
                    conn.execute(
                        text(
                            "insert into exams (title, student_id, questions, created_at) values "
                            "(:title, :sid, :questions, CURRENT_TIMESTAMP)"
                        ),
                        {"title": f"{table}-{index}", "sid": student_id, "questions": json.dumps([])},
                    )
    engine.dispose()
    return db_url


def _owner_columns(inspector, table: str) -> bool:
    return "owner_user_id" in {column["name"] for column in inspector.get_columns(table)}


def test_resource_owner_migration_upgrade_backfill_downgrade_reupgrade(request):
    if TEST_TMP_DIR.exists():
        shutil.rmtree(TEST_TMP_DIR, ignore_errors=True)
    TEST_TMP_DIR.mkdir(parents=True)
    request.addfinalizer(lambda: shutil.rmtree(TEST_TMP_DIR, ignore_errors=True))
    db_path = TEST_TMP_DIR / "owner_migration.sqlite"
    db_url = _build_legacy_db(db_path)

    # 遗留库标记为上一代 head 后升级到新 head
    _run_alembic("stamp", AGENT_RUNS_REVISION, db_url=db_url)
    _run_alembic("upgrade", "head", db_url=db_url)

    engine = create_engine(db_url)
    inspector = inspect(engine)
    for table in OWNER_TABLES:
        assert _owner_columns(inspector, table), f"{table}.owner_user_id 缺失"
        assert f"ix_{table}_owner_user_id" in {idx["name"] for idx in inspector.get_indexes(table)}
        foreign_keys = inspector.get_foreign_keys(table)
        assert any(
            fk["referred_table"] == "users" and fk["referred_columns"] == ["id"]
            and "owner_user_id" in fk["constrained_columns"]
            for fk in foreign_keys
        ), f"{table} 缺少 owner_user_id -> users.id 的 FK 元数据"

    with engine.connect() as conn:
        # 确定性回填：学生存在且有归属教师 -> owner = Student.user_id
        assert conn.execute(text("select owner_user_id from questions where id = 1")).scalar_one() == 1
        assert conn.execute(text("select owner_user_id from questions where id = 2")).scalar_one() == 2
        assert conn.execute(text("select owner_user_id from question_bank where id = 1")).scalar_one() == 1
        assert conn.execute(text("select owner_user_id from question_bank where id = 2")).scalar_one() == 2
        assert conn.execute(text("select owner_user_id from exams where id = 1")).scalar_one() == 1
        assert conn.execute(text("select owner_user_id from exams where id = 2")).scalar_one() == 2
        # NULL 学生 / 孤儿学生引用 -> 保持 NULL（不猜测归属）
        for table in OWNER_TABLES:
            for row_id in (3, 4):
                value = conn.execute(
                    text(f"select owner_user_id from {table} where id = {row_id}")
                ).scalar_one()
                assert value is None, f"{table}#{row_id} 的 owner 应保持 NULL"
        # 原始业务数据保留
        assert conn.execute(text("select count(*) from questions")).scalar_one() == 4
        assert conn.execute(text("select count(*) from question_bank")).scalar_one() == 4
        assert conn.execute(text("select count(*) from exams")).scalar_one() == 4
        assert conn.execute(text("select content from questions where id = 1")).scalar_one() == "questions-1"
        assert conn.execute(text("select goal from agent_runs where id = 1")).scalar_one() == "legacy practice prompt"
    engine.dispose()

    # 幂等：重复 upgrade 无变化、无失败
    _run_alembic("upgrade", "head", db_url=db_url)

    # 降级回上一代 head：owner 列移除、核心业务数据保留
    _run_alembic("downgrade", AGENT_RUNS_REVISION, db_url=db_url)
    engine = create_engine(db_url)
    inspector = inspect(engine)
    for table in OWNER_TABLES:
        assert not _owner_columns(inspector, table)
        assert f"ix_{table}_owner_user_id" not in {idx["name"] for idx in inspector.get_indexes(table)}
    with engine.connect() as conn:
        assert conn.execute(text("select count(*) from questions")).scalar_one() == 4
        assert conn.execute(text("select title from exams where id = 3")).scalar_one() == "exams-3"
    engine.dispose()

    # 再次升级：PASS
    _run_alembic("upgrade", "head", db_url=db_url)
    engine = create_engine(db_url)
    inspector = inspect(engine)
    assert all(_owner_columns(inspector, table) for table in OWNER_TABLES)
    engine.dispose()


def test_fresh_metadata_schema_contains_owner_columns():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    inspector = inspect(engine)
    for table in OWNER_TABLES:
        assert _owner_columns(inspector, table)
        assert f"ix_{table}_owner_user_id" in {idx["name"] for idx in inspector.get_indexes(table)}
        foreign_keys = inspector.get_foreign_keys(table)
        assert any(
            fk["referred_table"] == "users" and fk["referred_columns"] == ["id"]
            and "owner_user_id" in fk["constrained_columns"]
            for fk in foreign_keys
        )
    engine.dispose()


# b7e2c94f6a15 迁移创建/删除的 owner FK 约束名；fresh create_all schema 必须使用同名约束，
# 否则 stamp head 后 downgrade 会因 batch drop_constraint 找不到具名 FK 而失败。
FRESH_OWNER_FK_NAMES = {
    "questions": "fk_questions_owner_user_id_users",
    "question_bank": "fk_question_bank_owner_user_id_users",
    "exams": "fk_exams_owner_user_id_users",
}


def _named_owner_fk(inspector, table: str) -> bool:
    return any(
        fk.get("name") == FRESH_OWNER_FK_NAMES[table]
        and fk.get("referred_table") == "users"
        and fk.get("referred_columns") == ["id"]
        and fk.get("constrained_columns") == ["owner_user_id"]
        for fk in inspector.get_foreign_keys(table)
    )


def test_fresh_create_all_schema_is_migration_compatible(request):
    """Fresh 建库（create_all -> stamp head）必须与迁移历史双向兼容。

    遗留路径（7f -> upgrade b7 -> downgrade）之外，本测试覆盖另一条到达 head 的路径：
    Base.metadata.create_all -> stamp b7e2c94f6a15 -> downgrade 7f1f4d9a2c10 -> upgrade head。

    说明：downgrade 会删除 owner_user_id 列，owner 归属值不承诺保留（也不应断言保留）；
    兼容性断言是 schema 可降可升，且核心资源数据在两次迁移间保持不变。
    re-upgrade 的 owner 值由确定性回填恢复（student 存在且有归属教师 -> owner=Student.user_id）。
    """
    if TEST_TMP_DIR.exists():
        shutil.rmtree(TEST_TMP_DIR, ignore_errors=True)
    TEST_TMP_DIR.mkdir(parents=True)
    request.addfinalizer(lambda: shutil.rmtree(TEST_TMP_DIR, ignore_errors=True))
    db_path = TEST_TMP_DIR / "fresh_compat.sqlite"
    db_url = f"sqlite:///{db_path.as_posix()}"

    engine = create_engine(db_url)
    Base.metadata.create_all(engine)
    # 后代 revision（e4f7a1b9c2d8）新增的表必须剔除：stamp 点是 b7e2c94f6a15，
    # 否则 upgrade head 时 create_table 与 create_all 产物冲突。
    from app.models.agent_artifact import AgentAction as _LegacyAgentAction
    from app.models.agent_artifact import AgentArtifact as _LegacyAgentArtifact

    Base.metadata.drop_all(engine, tables=[_LegacyAgentAction.__table__, _LegacyAgentArtifact.__table__])
    with engine.begin() as conn:
        conn.execute(text("DROP INDEX ix_users_auth_subject"))
        conn.execute(text("ALTER TABLE users DROP COLUMN auth_subject"))
        conn.execute(
            text(
                "insert into users (id, username, hashed_password, is_active, role, created_at) values "
                "(1, 'fresh-admin', 'x', 1, 'admin', CURRENT_TIMESTAMP)"
            )
        )
        conn.execute(
            text(
                "insert into students (id, user_id, name, grade, class_name, tags, performance_score, created_at) "
                "values (10, 1, '学生A', '高一', '1班', '[]', 60, CURRENT_TIMESTAMP)"
            )
        )
        conn.execute(
            text(
                "insert into questions (student_id, content, options, answer, analysis, "
                "knowledge_point, difficulty, question_type, source, created_at) values "
                "(10, 'fresh-q1', '[]', '答案', '', 'kp', 'L3', '解答', 'test', CURRENT_TIMESTAMP)"
            )
        )
        conn.execute(
            text(
                "insert into question_bank (student_id, content, options, answer, analysis, "
                "question_type, difficulty, knowledge_point, source, tags, images, content_hash, created_at) "
                "values (10, 'fresh-b1', '[]', '答案', '', '解答', 'L3', 'kp', 'test', '[]', '[]', 'fresh-b1', CURRENT_TIMESTAMP)"
            )
        )
        conn.execute(
            text(
                "insert into exams (title, student_id, questions, created_at) values "
                "('fresh-e1', 10, '[]', CURRENT_TIMESTAMP)"
            )
        )
    engine.dispose()

    # stamp 为 head：owner FK 必须带迁移同名约束（batch drop_constraint 按名定位）
    _run_alembic("stamp", OWNER_REVISION, db_url=db_url)
    engine = create_engine(db_url)
    inspector = inspect(engine)
    for table in OWNER_TABLES:
        assert _named_owner_fk(inspector, table), (
            f"{table} 的 owner FK 未按迁移命名（{FRESH_OWNER_FK_NAMES[table]}）"
        )
    engine.dispose()

    # downgrade 到上一代 head：必须 PASS；owner 列移除，核心数据保留
    _run_alembic("downgrade", AGENT_RUNS_REVISION, db_url=db_url)
    engine = create_engine(db_url)
    inspector = inspect(engine)
    for table in OWNER_TABLES:
        assert not _owner_columns(inspector, table), f"downgrade 后 {table}.owner_user_id 应被移除"
    with engine.connect() as conn:
        assert conn.execute(text("select content from questions where student_id = 10")).scalar_one() == "fresh-q1"
        assert conn.execute(text("select content from question_bank where student_id = 10")).scalar_one() == "fresh-b1"
        assert conn.execute(text("select title from exams where student_id = 10")).scalar_one() == "fresh-e1"
        assert conn.execute(text("select count(*) from questions")).scalar_one() == 1
    engine.dispose()

    # 再升级回 head：owner 列/索引/FK 元数据恢复，回填按确定性规则生效
    _run_alembic("upgrade", "head", db_url=db_url)
    engine = create_engine(db_url)
    inspector = inspect(engine)
    for table in OWNER_TABLES:
        assert _owner_columns(inspector, table), f"re-upgrade 后 {table}.owner_user_id 应恢复"
        assert f"ix_{table}_owner_user_id" in {idx["name"] for idx in inspector.get_indexes(table)}
        assert _named_owner_fk(inspector, table), f"re-upgrade 后 {table} 的 owner FK 元数据应恢复"
    with engine.connect() as conn:
        assert conn.execute(text("select count(*) from questions")).scalar_one() == 1
        assert conn.execute(text("select count(*) from question_bank")).scalar_one() == 1
        assert conn.execute(text("select count(*) from exams")).scalar_one() == 1
        # 确定性回填：学生 10 归属教师 1
        for table in OWNER_TABLES:
            owner = conn.execute(text(f"select owner_user_id from {table} where student_id = 10")).scalar_one()
            assert owner == 1, f"{table} re-upgrade 回填后 owner 应为 1"
    engine.dispose()
