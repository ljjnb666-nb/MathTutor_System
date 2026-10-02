"""Unified password policy authority: >=8 chars and <=72 UTF-8 bytes for any new hash.

Attribute access (module.X) instead of from-imports: other suites legitimately
reload app.core.security to test the SECRET_KEY policy, and a from-imported
exception class would compare stale after such a reload.
"""
import inspect

import bcrypt
import pytest

import app.core.security as security


def test_minimum_eight_characters_enforced():
    with pytest.raises(security.PasswordPolicyError, match="至少"):
        security.validate_password_for_hash("a" * (security.MIN_PASSWORD_CHARS - 1))
    assert security.validate_password_for_hash("a" * security.MIN_PASSWORD_CHARS)


def test_bcrypt_72_utf8_byte_ceiling_enforced():
    assert security.validate_password_for_hash("x" * 72)
    with pytest.raises(security.PasswordPolicyError, match="72"):
        security.validate_password_for_hash("x" * 73)
    # 24 CJK characters are exactly 72 UTF-8 bytes: boundary accepted.
    assert security.validate_password_for_hash("密" * 24)
    # 25 CJK characters are 75 bytes: rejected despite only 25 characters.
    with pytest.raises(security.PasswordPolicyError, match="72"):
        security.validate_password_for_hash("密" * 25)


def test_empty_and_whitespace_rejected():
    for bad in ("", "   ", None):
        with pytest.raises(security.PasswordPolicyError):
            security.validate_password_for_hash(bad)


def test_get_password_hash_enforces_policy():
    with pytest.raises(security.PasswordPolicyError):
        security.get_password_hash("short")
    password = "-".join(["policy", "pass", "123"])
    hashed = security.get_password_hash(password)
    assert hashed.startswith("$2")
    assert security.verify_password(password, hashed)


def test_get_password_hash_delegates_to_policy_authority():
    assert "validate_password_for_hash" in inspect.getsource(security.get_password_hash)


def test_legacy_weak_hash_still_verifies():
    """Historical <8-char hashes keep verifying; the policy only gates NEW hashes."""
    weak_hash = bcrypt.hashpw(b"old6", bcrypt.gensalt()).decode("utf-8")
    assert security.verify_password("old6", weak_hash)
    assert len("old6") < security.MIN_PASSWORD_CHARS
