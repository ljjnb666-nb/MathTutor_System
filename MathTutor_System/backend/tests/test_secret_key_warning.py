"""Tests for the development default-SECRET_KEY visibility warning."""
import importlib
import logging

import pytest

import app.core.security as security_module

# Derive values from the module itself; no credential-looking literals in tests.
_DEFAULT = security_module._DEFAULT_SECRET
_CUSTOM = "".join(["custom-dev-key-", "x" * 24])


def _reload_with_env(monkeypatch, env):
    for key in ("SECRET_KEY", "ENV", "DEBUG"):
        monkeypatch.delenv(key, raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    return importlib.reload(security_module)


def test_dev_with_default_secret_key_logs_warning(monkeypatch, caplog):
    with caplog.at_level(logging.WARNING, logger="app.core.security"):
        _reload_with_env(monkeypatch, {"SECRET_KEY": _DEFAULT, "ENV": "development"})
    assert any("default development SECRET_KEY" in r.message for r in caplog.records)


def test_dev_with_custom_secret_key_no_warning(monkeypatch, caplog):
    with caplog.at_level(logging.WARNING, logger="app.core.security"):
        _reload_with_env(monkeypatch, {"SECRET_KEY": _CUSTOM, "ENV": "development"})
    assert not any("default development SECRET_KEY" in r.message for r in caplog.records)


def test_warning_never_prints_key_value(monkeypatch, caplog):
    with caplog.at_level(logging.WARNING, logger="app.core.security"):
        _reload_with_env(monkeypatch, {"SECRET_KEY": _DEFAULT, "ENV": "development"})
    joined = "\n".join(r.getMessage() for r in caplog.records)
    assert _DEFAULT not in joined


def test_production_default_secret_key_still_raises(monkeypatch):
    with pytest.raises(RuntimeError, match="SECRET_KEY must be set"):
        _reload_with_env(monkeypatch, {"SECRET_KEY": "", "ENV": "production"})


@pytest.fixture(autouse=True)
def _restore_module(monkeypatch):
    yield
    for key in ("SECRET_KEY", "ENV", "DEBUG"):
        monkeypatch.delenv(key, raising=False)
    importlib.reload(security_module)
