"""
SEC-BOOT：首次部署管理员 bootstrap 安全回归测试。

覆盖：
  SEC-BOOT-01  生产源码不存在固定密码 123456
  SEC-BOOT-02  fresh DB + 未配置密码 → bootstrap 失败且不留任何中间状态
  SEC-BOOT-03  fresh DB + 合法配置密码 → 管理员创建成功
  SEC-BOOT-04  配置的密码可登录，旧默认 123456 不可登录
  SEC-BOOT-05  已存在同名管理员 → 重跑跳过且不修改密码
  SEC-BOOT-06  弱/超长 bootstrap 密码 → fail closed
  SEC-BOOT-07  stdout/stderr 不包含 bootstrap 密码明文
  SEC-BOOT-08  entrypoint bootstrap 失败 → uvicorn 不得启动（shell smoke test）
  SEC-BOOT-09  已有数据库 + 已有 admin + 未设置密码 → 正常启动且不改动 admin
"""
import os
import secrets
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text

from app.core.security import verify_password

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = BACKEND_DIR.parent
ENTRYPOINT = BACKEND_DIR / "docker-entrypoint.sh"
TEST_TMP_DIR = Path(__file__).resolve().parent / ".tmp_bootstrap_admin"

REQUIRED_PASSWORD_MESSAGE = "Bootstrap admin password is required for first deployment"
LENGTH_MESSAGE = "12-128 characters long"

# 旧默认凭证：仅用于断言它不再有效（SEC-BOOT-01 源码扫描已确保生产代码不含该值）
OLD_DEFAULT_PASSWORD = "123456"


def _fixture_password() -> str:
    """Randomized test fixture password：每次测试运行随机生成，仅作为测试夹具值。

    生产 contract 不变：bootstrap 密码必须通过环境变量显式提供，
    系统本身不生成、不打印、不落盘任何密码。
    """
    return "bt-" + secrets.token_urlsafe(18)


@pytest.fixture
def bootstrap_tmp(request):
    """每个测试一个独立临时目录（避免依赖系统 %TEMP% 的 pytest tmp_path 根目录权限）。"""
    if TEST_TMP_DIR.exists():
        shutil.rmtree(TEST_TMP_DIR, ignore_errors=True)
    TEST_TMP_DIR.mkdir(parents=True)
    case_dir = Path(tempfile.mkdtemp(dir=TEST_TMP_DIR))
    request.addfinalizer(lambda: shutil.rmtree(TEST_TMP_DIR, ignore_errors=True))
    return case_dir


def _bootstrap_env(db_path: Path, *, username: str = "", password: str = "") -> dict:
    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite:///{db_path.as_posix()}"
    # 隔离可能继承自本机的部署型环境变量，保证测试确定性
    env["ENV"] = "development"
    env["DEBUG"] = "1"
    env["SECRET_KEY"] = "bootstrap-tests-only"
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    # 空字符串等价于未设置（脚本将其视为缺失）
    env["BOOTSTRAP_ADMIN_USERNAME"] = username
    env["BOOTSTRAP_ADMIN_PASSWORD"] = password
    return env


def _run_create_superuser(
    db_path: Path, *, username: str = "", password: str = ""
) -> subprocess.CompletedProcess:
    proc = subprocess.run(
        [sys.executable, "scripts/create_superuser.py"],
        cwd=BACKEND_DIR,
        env=_bootstrap_env(db_path, username=username, password=password),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=180,
    )
    # SEC-BOOT-07：任何执行路径的输出都不得包含密码明文
    if password:
        assert password not in (proc.stdout or ""), "bootstrap 密码泄漏到 stdout"
        assert password not in (proc.stderr or ""), "bootstrap 密码泄漏到 stderr"
    return proc


def _fetch_users(db_path: Path) -> list[dict]:
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text("select username, hashed_password, role, is_active from users")
            ).mappings().all()
            return [dict(row) for row in rows]
    finally:
        engine.dispose()


# ---------------------------------------------------------------- SEC-BOOT-01


def test_sec_boot_01_no_hardcoded_default_password_in_production_sources():
    production_paths = [
        BACKEND_DIR / "app",
        BACKEND_DIR / "scripts",
        BACKEND_DIR / "docker-entrypoint.sh",
        BACKEND_DIR / "Dockerfile",
        BACKEND_DIR / ".env.example",
        REPO_DIR / "docker-compose.yml",
        REPO_DIR / "README.md",
    ]
    offenders = []
    for path in production_paths:
        files = sorted(path.rglob("*")) if path.is_dir() else [path]
        for file_path in files:
            if not file_path.is_file() or file_path.suffix not in {
                ".py",
                ".sh",
                ".yml",
                ".yaml",
                ".md",
                ".example",
                "",
            }:
                continue
            content = file_path.read_text(encoding="utf-8", errors="replace")
            if OLD_DEFAULT_PASSWORD in content:
                offenders.append(str(file_path.relative_to(REPO_DIR)))
    assert offenders == [], f"生产源码中出现固定密码: {offenders}"


# ---------------------------------------------------------------- SEC-BOOT-02


def test_sec_boot_02_missing_password_fails_closed_on_fresh_db(bootstrap_tmp):
    db_path = bootstrap_tmp / "fresh_missing_password.sqlite"
    proc = _run_create_superuser(db_path, password="")

    assert proc.returncode != 0, "缺少 bootstrap 密码时必须以非零码退出"
    assert REQUIRED_PASSWORD_MESSAGE in proc.stderr
    # fail-closed：凭证校验失败时不得建库建表，避免留下“空库无管理员”状态
    assert not db_path.exists()


# ---------------------------------------------------------------- SEC-BOOT-03


def test_sec_boot_03_valid_password_creates_admin(bootstrap_tmp):
    db_path = bootstrap_tmp / "fresh_valid.sqlite"
    password = _fixture_password()
    proc = _run_create_superuser(db_path, password=password)

    assert proc.returncode == 0
    users = _fetch_users(db_path)
    assert len(users) == 1
    assert users[0]["username"] == "admin"
    assert users[0]["role"] == "admin"
    assert users[0]["is_active"] in (1, True)
    assert users[0]["hashed_password"].startswith(("$2a$", "$2b$", "$2y$"))


# ---------------------------------------------------------------- SEC-BOOT-04


def test_sec_boot_04_configured_password_works_old_default_rejected(bootstrap_tmp):
    db_path = bootstrap_tmp / "fresh_credential_check.sqlite"
    password = _fixture_password()
    proc = _run_create_superuser(db_path, password=password)
    assert proc.returncode == 0

    users = _fetch_users(db_path)
    stored_hash = users[0]["hashed_password"]
    assert verify_password(password, stored_hash) is True
    assert verify_password(OLD_DEFAULT_PASSWORD, stored_hash) is False


# ---------------------------------------------------------------- SEC-BOOT-05


def test_sec_boot_05_existing_admin_is_not_mutated_on_rerun(bootstrap_tmp):
    db_path = bootstrap_tmp / "rerun_idempotent.sqlite"
    first_password = _fixture_password()
    second_password = _fixture_password()

    first = _run_create_superuser(db_path, password=first_password)
    assert first.returncode == 0
    users_before = _fetch_users(db_path)
    assert len(users_before) == 1

    second = _run_create_superuser(db_path, password=second_password)
    assert second.returncode == 0  # 幂等跳过，不报错
    assert "已存在" in second.stdout

    users_after = _fetch_users(db_path)
    assert len(users_after) == 1
    assert users_after[0]["hashed_password"] == users_before[0]["hashed_password"]
    assert verify_password(first_password, users_after[0]["hashed_password"]) is True
    assert verify_password(second_password, users_after[0]["hashed_password"]) is False


# ---------------------------------------------------------------- SEC-BOOT-06


@pytest.mark.parametrize(
    "weak_password",
    [
        OLD_DEFAULT_PASSWORD,  # 旧默认密码不得再被 bootstrap 接受
        "a" * 11,  # 低于最小长度
        "x" * 129,  # 超过最大长度
    ],
)
def test_sec_boot_06_weak_password_fails_closed(bootstrap_tmp, weak_password):
    db_path = bootstrap_tmp / "weak_password.sqlite"
    proc = _run_create_superuser(db_path, password=weak_password)

    assert proc.returncode != 0
    assert LENGTH_MESSAGE in proc.stderr or REQUIRED_PASSWORD_MESSAGE in proc.stderr
    assert not db_path.exists(), "弱密码被拒绝时不得创建数据库"


def test_sec_boot_06_minimum_length_boundary_accepted(bootstrap_tmp):
    db_path = bootstrap_tmp / "boundary_password.sqlite"
    proc = _run_create_superuser(db_path, password="a" * 12)

    assert proc.returncode == 0
    assert len(_fetch_users(db_path)) == 1


# ---------------------------------------------------------------- SEC-BOOT-07


def test_sec_boot_07_outputs_never_contain_bootstrap_secret(bootstrap_tmp):
    password = _fixture_password()

    missing = _run_create_superuser(bootstrap_tmp / "s7_missing.sqlite", password="")
    weak = _run_create_superuser(bootstrap_tmp / "s7_weak.sqlite", password="a" * 11)
    created = _run_create_superuser(bootstrap_tmp / "s7_valid.sqlite", password=password)
    rerun = _run_create_superuser(bootstrap_tmp / "s7_valid.sqlite", password=password)

    for proc in (missing, weak, created, rerun):
        assert password not in proc.stdout
        assert password not in proc.stderr
    # 错误文案为固定内容，可安全展示给运维
    assert REQUIRED_PASSWORD_MESSAGE in missing.stderr
    assert "已存在" in rerun.stdout


# ---------------------------------------------------------------- SEC-BOOT-08


def _write_executable(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8", newline="\n")
    path.chmod(0o755)


def _prepare_entrypoint_sandbox(case_dir: Path) -> tuple[Path, Path, Path]:
    """复制 entrypoint 并把容器内 /app/data 路径替换到临时目录，用于可重复的本地 smoke test。"""
    sandbox_dir = case_dir / "entrypoint_sandbox"
    stub_dir = sandbox_dir / "stub_bin"
    stub_dir.mkdir(parents=True)

    db_path = sandbox_dir / "math_tutor.db"
    vector_dir = sandbox_dir / "vector_store"

    source = ENTRYPOINT.read_text(encoding="utf-8")
    assert "set -e" in source, "entrypoint 必须保持 set -e"
    assert source.index("create_superuser.py") < source.index("exec uvicorn"), (
        "bootstrap 必须在 uvicorn 启动之前执行"
    )
    script = source.replace("/app/data/math_tutor.db", db_path.as_posix())
    script = script.replace("/app/data/vector_store", vector_dir.as_posix())
    entrypoint_copy = sandbox_dir / "docker-entrypoint.sh"
    entrypoint_copy.write_text(script, encoding="utf-8", newline="\n")
    entrypoint_copy.chmod(0o755)

    # uvicorn 桩：被调用时留下标记文件（证明应用服务器已被启动）
    uvicorn_marker = sandbox_dir / "uvicorn_launched.marker"
    _write_executable(
        stub_dir / "uvicorn",
        "#!/bin/sh\ntouch \"$UVICORN_MARKER\"\n",
    )
    # python 桩：固定解析到当前测试解释器，避免 PATH 上出现不可用的 python
    python_exe = Path(sys.executable).as_posix()
    _write_executable(
        stub_dir / "python",
        f"#!/bin/sh\nexec '{python_exe}' \"$@\"\n",
    )
    return entrypoint_copy, stub_dir, uvicorn_marker


def _run_entrypoint(
    entrypoint_copy: Path,
    stub_dir: Path,
    db_path: Path,
    marker_path: Path,
    *,
    password: str,
) -> subprocess.CompletedProcess:
    env = _bootstrap_env(db_path, password=password)
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


def _resolve_bash() -> str | None:
    """解析可执行本脚本的 POSIX shell；Windows 上排除 WSL 的 bash.exe（无法访问 MSYS 语义）。"""
    bash = shutil.which("bash")
    if bash and "system32" not in bash.lower().replace("\\", "/"):
        return bash
    git = shutil.which("git")
    if git:
        git_root = Path(git).resolve().parent.parent  # <Git>/cmd/git.exe -> <Git>
        for candidate in (git_root / "bin" / "bash.exe", git_root / "usr" / "bin" / "bash.exe"):
            if candidate.is_file():
                return str(candidate)
    for candidate in (
        r"C:\Program Files\Git\bin\bash.exe",
        r"C:\Program Files\Git\usr\bin\bash.exe",
    ):
        if Path(candidate).is_file():
            return candidate
    return bash


BASH_EXE = _resolve_bash()


@pytest.mark.skipif(BASH_EXE is None, reason="需要 POSIX shell 执行 entrypoint smoke test")
def test_sec_boot_08_entrypoint_failure_never_launches_server(bootstrap_tmp):
    entrypoint_copy, stub_dir, marker = _prepare_entrypoint_sandbox(bootstrap_tmp)
    db_path = entrypoint_copy.parent / "math_tutor.db"

    failed = _run_entrypoint(entrypoint_copy, stub_dir, db_path, marker, password="")
    assert failed.returncode != 0, "bootstrap 失败时 entrypoint 必须以非零码退出"
    assert REQUIRED_PASSWORD_MESSAGE in failed.stderr
    assert not marker.exists(), "bootstrap 失败后 uvicorn 不得被启动"

    success = _run_entrypoint(entrypoint_copy, stub_dir, db_path, marker, password=_fixture_password())
    assert success.returncode == 0
    assert marker.exists(), "bootstrap 成功后 uvicorn 应被启动"
    users = _fetch_users(db_path)
    assert len(users) == 1 and users[0]["role"] == "admin"


# ---------------------------------------------------------------- SEC-BOOT-09


def test_sec_boot_09_existing_db_without_bootstrap_password_starts_normally(bootstrap_tmp):
    """已有数据库 + 已有 admin + 未设置 BOOTSTRAP_ADMIN_PASSWORD → 必须正常启动。

    生命周期 contract：bootstrap 密码仅在 fresh DB 时必需；
    是否必需由 entrypoint（DB 文件状态）决定，而非 compose 插值层。
    """
    # compose 层不得无条件强制 bootstrap 密码（不得使用 :? 语法），只做 pass-through
    compose_text = (REPO_DIR / "docker-compose.yml").read_text(encoding="utf-8")
    for line in compose_text.splitlines():
        if "BOOTSTRAP_ADMIN_PASSWORD" in line:
            assert ":?" not in line, f"compose 层不得无条件强制 bootstrap 密码: {line.strip()}"

    entrypoint_copy, stub_dir, marker = _prepare_entrypoint_sandbox(bootstrap_tmp)
    db_path = entrypoint_copy.parent / "math_tutor.db"

    # 准备“已有数据库 + 已有 admin”状态（首次 bootstrap 用随机 fixture 密码完成）
    existing_password = _fixture_password()
    first = _run_create_superuser(db_path, password=existing_password)
    assert first.returncode == 0
    users_before = _fetch_users(db_path)
    assert len(users_before) == 1

    # 已存在 DB + 未设置密码（环境变量为空串，等同 compose 未配置时的 pass-through 值）
    # → 启动流程不得因缺失 bootstrap secret 失败，且 server 进入启动路径
    rerun = _run_entrypoint(entrypoint_copy, stub_dir, db_path, marker, password="")
    assert rerun.returncode == 0, f"已有数据库时缺失 bootstrap 密码不得阻止启动: {rerun.stderr}"
    assert marker.exists(), "已有数据库时应用服务器必须能继续进入启动路径"

    # bootstrap 不重建 admin，existing admin 的 hash 与密码保持不变
    users_after = _fetch_users(db_path)
    assert len(users_after) == 1, "不得重复创建管理员"
    assert users_after[0]["hashed_password"] == users_before[0]["hashed_password"]
    assert verify_password(existing_password, users_after[0]["hashed_password"]) is True
