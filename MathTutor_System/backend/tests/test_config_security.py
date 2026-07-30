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
        timeout=20,
    )


def test_production_default_secret_key_fails_startup():
    result = run_import_security({"ENV": "production", "SECRET_KEY": ""})

    assert result.returncode != 0
    assert "SECRET_KEY must be set" in (result.stderr + result.stdout)


def test_production_custom_secret_key_imports():
    result = run_import_security({"ENV": "production", "SECRET_KEY": "custom-non-default-secret"})

    assert result.returncode == 0
    assert "ok" in result.stdout
