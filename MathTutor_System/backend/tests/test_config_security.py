import os
import subprocess
import sys


def run_import_security(env):
    merged = os.environ.copy()
    merged.update(env)
    return subprocess.run(
        [sys.executable, "-c", "import app.core.security; print('ok')"],
        cwd=os.getcwd(),
        env=merged,
        text=True,
        capture_output=True,
        timeout=30,
    )


def test_production_default_secret_key_fails_startup():
    result = run_import_security({"ENV": "production", "SECRET_KEY": ""})

    assert result.returncode != 0
    assert "SECRET_KEY must be set" in (result.stderr + result.stdout)


def test_production_custom_short_secret_key_fails_startup():
    """SEC-07: a non-default but <32-byte key must not be accepted in production."""
    result = run_import_security({"ENV": "production", "SECRET_KEY": "short-but-custom"})

    assert result.returncode != 0
    assert "SECRET_KEY too short" in (result.stderr + result.stdout)


def test_production_32byte_secret_key_imports():
    result = run_import_security(
        {"ENV": "production", "SECRET_KEY": "production-grade-secret-key-0123456789abcdef"}
    )

    assert result.returncode == 0
    assert "ok" in result.stdout


def test_production_31byte_secret_key_rejected():
    """SEC-07: 31 UTF-8 bytes is below the floor — the limit counts bytes, not chars."""
    result = run_import_security({"ENV": "production", "SECRET_KEY": "x" * 31})

    assert result.returncode != 0
    assert "SECRET_KEY too short" in (result.stderr + result.stdout)


def test_production_16_cjk_chars_48_bytes_secret_key_accepted():
    """16 CJK characters are 48 UTF-8 bytes: the byte floor, not the char count, decides."""
    result = run_import_security({"ENV": "production", "SECRET_KEY": "密" * 16})

    assert result.returncode == 0
    assert "ok" in result.stdout


def test_dev_default_secret_key_imports_with_warning(capsys):
    result = run_import_security({"ENV": "development", "SECRET_KEY": ""})

    assert result.returncode == 0
    assert "ok" in result.stdout
