"""
PHASE 2B-2B：Docker entrypoint 启动迁移回归测试。

覆盖部署路径：
  fresh DB（无文件/空文件/仅无关表）+ 无 bootstrap 密码 -> bootstrap 失败、不建应用 schema、不启动 uvicorn（fail closed）
  fresh DB（无文件/空文件）+ 合法密码                  -> 管理员创建 -> 数据库 bootstrap（建库/标记 head/种子） -> 启动 uvicorn
  已有 DB + 无密码                                     -> 数据库 bootstrap 正常执行迁移/标记 -> 启动 uvicorn

“未初始化”以 schema 状态为准（是否存在应用表），而非数据库文件是否存在。
沿用 SEC-BOOT 的 entrypoint 沙箱模式（stub python/uvicorn）。
"""
import os
import secrets
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text

from app.models.base import Base
from tests.test_bootstrap_admin_security import _prepare_entrypoint_sandbox, _resolve_bash, _fixture_password  # noqa: F401

BACKEND_DIR = Path(__file__).resolve().parents[1]
TEST_TMP_DIR = Path(__file__).resolve().parent / ".tmp_entrypoint_migration"
def _current_head_revision() -> str:
    """Current alembic head so head assertions survive new migrations."""
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    return ScriptDirectory.from_config(cfg).get_current_head()


OWNER_TABLES = ("questions", "question_bank", "exams")
BASH_EXE = _resolve_bash()


def _run_entrypoint(entrypoint_copy: Path, stub_dir: Path, marker_path: Path, db_path: Path, *, password: str):
    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite:///{db_path.as_posix()}"
    env["ENV"] = "development"
    env["DEBUG"] = "1"
    env["SECRET_KEY"] = "entrypoint-migration-tests-only"
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    env["BOOTSTRAP_ADMIN_USERNAME"] = ""
    env["BOOTSTRAP_ADMIN_PASSWORD"] = password
    env["PATH"] = f"{stub_dir.as_posix()}{os.pathsep}{env['PATH']}"
    env["UVICORN_MARKER"] = marker_path.as_posix()
    return subprocess.run(
        [BASH_EXE, entrypoint_copy.as_posix()],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=180,
    )


def _table_names(db_path: Path) -> list[str]:
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    try:
        return inspect(engine).get_table_names()
    finally:
        engine.dispose()


def _alembic_version(db_path: Path) -> str | None:
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    try:
        with engine.connect() as conn:
            return conn.execute(text("select version_num from alembic_version")).scalar_one()
    finally:
        engine.dispose()


def _application_table_names(db_path: Path) -> set[str]:
    """库中属于 TutorPro 应用 schema 的表名集合（与 Base.metadata 求交集）。"""
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    try:
        return set(inspect(engine).get_table_names()) & set(Base.metadata.tables)
    finally:
        engine.dispose()


def _sandbox_case(request) -> tuple[Path, Path, Path, Path]:
    if TEST_TMP_DIR.exists():
        shutil.rmtree(TEST_TMP_DIR, ignore_errors=True)
    TEST_TMP_DIR.mkdir(parents=True, exist_ok=True)
    request.addfinalizer(lambda: shutil.rmtree(TEST_TMP_DIR, ignore_errors=True))
    case_dir = Path(tempfile.mkdtemp(dir=TEST_TMP_DIR))
    entrypoint_copy, stub_dir, marker = _prepare_entrypoint_sandbox(case_dir)
    db_path = entrypoint_copy.parent / "math_tutor.db"
    return entrypoint_copy, stub_dir, marker, db_path


@pytest.mark.skipif(BASH_EXE is None, reason="需要 POSIX shell 执行 entrypoint smoke test")
def test_fresh_db_without_password_fails_closed_and_never_runs_migration(request):
    if TEST_TMP_DIR.exists():
        shutil.rmtree(TEST_TMP_DIR, ignore_errors=True)
    TEST_TMP_DIR.mkdir(parents=True, exist_ok=True)
    request.addfinalizer(lambda: shutil.rmtree(TEST_TMP_DIR, ignore_errors=True))
    case_dir = Path(tempfile.mkdtemp(dir=TEST_TMP_DIR))
    entrypoint_copy, stub_dir, marker = _prepare_entrypoint_sandbox(case_dir)
    db_path = entrypoint_copy.parent / "math_tutor.db"

    proc = _run_entrypoint(entrypoint_copy, stub_dir, marker, db_path, password="")

    assert proc.returncode != 0
    assert "Bootstrap admin password is required" in proc.stderr
    assert not marker.exists(), "bootstrap 失败后 uvicorn 不得被启动"
    assert not db_path.exists(), "凭证校验失败时不得创建数据库文件"
    assert "Database bootstrap complete" not in (proc.stdout or ""), "迁移流程不得绕过 bootstrap 安全检查"


@pytest.mark.skipif(BASH_EXE is None, reason="需要 POSIX shell 执行 entrypoint smoke test")
def test_fresh_db_with_valid_password_bootstraps_migrates_and_starts(request):
    if TEST_TMP_DIR.exists():
        shutil.rmtree(TEST_TMP_DIR, ignore_errors=True)
    TEST_TMP_DIR.mkdir(parents=True, exist_ok=True)
    request.addfinalizer(lambda: shutil.rmtree(TEST_TMP_DIR, ignore_errors=True))
    case_dir = Path(tempfile.mkdtemp(dir=TEST_TMP_DIR))
    entrypoint_copy, stub_dir, marker = _prepare_entrypoint_sandbox(case_dir)
    db_path = entrypoint_copy.parent / "math_tutor.db"
    password = _fixture_password()

    proc = _run_entrypoint(entrypoint_copy, stub_dir, marker, db_path, password=password)

    assert proc.returncode == 0, proc.stderr
    assert marker.exists(), "bootstrap 成功后 uvicorn 应被启动"
    assert "Database bootstrap complete" in proc.stdout
    assert "alembic_version" in _table_names(db_path)
    assert _alembic_version(db_path) == _current_head_revision()
    assert all(
        "owner_user_id" in {c["name"] for c in inspect(create_engine(f"sqlite:///{db_path.as_posix()}")).get_columns(t)}
        for t in OWNER_TABLES
    )
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    try:
        with engine.connect() as conn:
            roles = [row[0] for row in conn.execute(text("select role from users")).fetchall()]
        assert roles == ["admin"]
    finally:
        engine.dispose()


@pytest.mark.skipif(BASH_EXE is None, reason="需要 POSIX shell 执行 entrypoint smoke test")
def test_existing_db_without_password_runs_bootstrap_migration_and_starts(request):
    if TEST_TMP_DIR.exists():
        shutil.rmtree(TEST_TMP_DIR, ignore_errors=True)
    TEST_TMP_DIR.mkdir(parents=True, exist_ok=True)
    request.addfinalizer(lambda: shutil.rmtree(TEST_TMP_DIR, ignore_errors=True))
    case_dir = Path(tempfile.mkdtemp(dir=TEST_TMP_DIR))
    entrypoint_copy, stub_dir, marker = _prepare_entrypoint_sandbox(case_dir)
    db_path = entrypoint_copy.parent / "math_tutor.db"

    # 首次部署（带密码）产生 admin 与最新 schema；随后模拟重启：已有 DB + 无密码
    first = _run_entrypoint(entrypoint_copy, stub_dir, marker, db_path, password=_fixture_password())
    assert first.returncode == 0, first.stderr

    rerun = _run_entrypoint(entrypoint_copy, stub_dir, marker, db_path, password="")

    assert rerun.returncode == 0, rerun.stderr
    assert marker.exists(), "已有数据库时 uvicorn 必须能继续启动"
    assert "Database bootstrap complete" in rerun.stdout
    assert _alembic_version(db_path) == _current_head_revision()
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    try:
        with engine.connect() as conn:
            users = conn.execute(text("select username, role from users")).fetchall()
        assert users == [("admin", "admin")], "重启迁移不得重复/改动管理员"
    finally:
        engine.dispose()


# --------------------------------------------- ENTRYPOINT-FRESH-EMPTY / UNRELATED


@pytest.mark.skipif(BASH_EXE is None, reason="需要 POSIX shell 执行 entrypoint smoke test")
def test_entrypoint_fresh_empty_01_empty_db_file_requires_bootstrap_password(request):
    """ENTRYPOINT-FRESH-EMPTY-01：已存在但为空的 SQLite 文件仍是未初始化数据库。

    文件存在不等于已初始化：必须要求 bootstrap 密码，凭证缺失时
    不建应用 schema、不启动 uvicorn（空文件本身允许保留）。
    """
    entrypoint_copy, stub_dir, marker, db_path = _sandbox_case(request)
    db_path.touch()  # 0 字节文件：对 SQLite 而言是合法的空库

    proc = _run_entrypoint(entrypoint_copy, stub_dir, marker, db_path, password="")

    assert proc.returncode != 0
    assert "Bootstrap admin password is required" in proc.stderr
    assert not marker.exists(), "fresh bootstrap 失败后 uvicorn 不得被启动"
    assert _application_table_names(db_path) == set(), "凭证缺失时不得创建应用 schema"


@pytest.mark.skipif(BASH_EXE is None, reason="需要 POSIX shell 执行 entrypoint smoke test")
def test_entrypoint_fresh_empty_02_empty_db_file_with_valid_password_bootstraps(request):
    """ENTRYPOINT-FRESH-EMPTY-02：空文件 + 合法 bootstrap 密码 -> 正常初始化并启动。"""
    entrypoint_copy, stub_dir, marker, db_path = _sandbox_case(request)
    db_path.touch()

    proc = _run_entrypoint(entrypoint_copy, stub_dir, marker, db_path, password=_fixture_password())

    assert proc.returncode == 0, proc.stderr
    assert marker.exists(), "bootstrap 成功后 uvicorn 应被启动"
    assert "Database bootstrap complete" in proc.stdout
    assert _alembic_version(db_path) == _current_head_revision()
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    try:
        with engine.connect() as conn:
            roles = [row[0] for row in conn.execute(text("select role from users")).fetchall()]
        assert roles == ["admin"]
    finally:
        engine.dispose()
    assert _application_table_names(db_path), "初始化后应存在完整应用 schema"


@pytest.mark.skipif(BASH_EXE is None, reason="需要 POSIX shell 执行 entrypoint smoke test")
def test_entrypoint_fresh_unrelated_03_unrelated_only_db_requires_bootstrap_password(request):
    """ENTRYPOINT-FRESH-UNRELATED-03：仅含无关表的 SQLite 库仍是未初始化数据库。

    非空文件也可能没有 TutorPro schema：必须要求 bootstrap 密码，
    且不得动原有无关表、不得启动 uvicorn。
    """
    entrypoint_copy, stub_dir, marker, db_path = _sandbox_case(request)
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE unrelated (id INTEGER PRIMARY KEY, note TEXT)"))
    engine.dispose()

    proc = _run_entrypoint(entrypoint_copy, stub_dir, marker, db_path, password="")

    assert proc.returncode != 0
    assert "Bootstrap admin password is required" in proc.stderr
    assert not marker.exists(), "fresh bootstrap 失败后 uvicorn 不得被启动"
    tables = inspect(create_engine(f"sqlite:///{db_path.as_posix()}")).get_table_names()
    assert "unrelated" in tables, "无关表必须原样保留"
    assert not (set(tables) & set(Base.metadata.tables)), "凭证缺失时不得创建应用 schema"
