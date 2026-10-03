"""External-review fix round 01 boundaries: RB04 / RB05 / RB06."""
import os
import subprocess
import sys

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models.base import Base, get_db
from app.models.user import User

# --- RB04: generation contract regression ------------------------------------

def test_design_logic_survives_real_question_json_parser():
    """design_logic 是既有 API contract：真实 parser 输出必须原样保留该字段。"""
    from app.services.question_json_parser import parse_questions

    raw = '''
    [
      {"content": "已知一次函数 y=kx+b 过点 (1,2)。", "options": [], "answer": "k=1",
       "analysis": "代入即可", "design_logic": "重点考查待定系数法", "type_tag": "巩固题",
       "question_type": "解答"}
    ]
    '''
    questions = parse_questions(raw)
    assert len(questions) == 1
    item = questions[0]
    assert item.design_logic == "重点考查待定系数法"
    assert "design_logic" in item.model_dump()


def test_generate_request_default_question_type_is_unchanged():
    from app.schemas.generation import GenerateRequest

    request = GenerateRequest(knowledge_point="一次函数", difficulty="L3")
    assert request.question_type == "选择"


# --- RB05: admin user creation password boundary ------------------------------

def _api_client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    from app.core.security import get_password_hash

    db.add(User(id=1, username="admin", hashed_password=get_password_hash("admin-password-9"), role="admin", is_active=True))
    db.commit()
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = lambda: db
    client = TestClient(app)
    return client, db, lambda: (app.dependency_overrides.clear(), app.dependency_overrides.update(previous))


def _admin_headers(client):
    response = client.post("/api/token", data={"username": "admin", "password": "admin-password-9"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_admin_create_user_multibyte_over_72_bytes_returns_400_not_500():
    client, _db, restore = _api_client()
    try:
        response = client.post("/api/users/", headers=_admin_headers(client), json={
            "username": "overbyte", "password": "密" * 25,  # 25 chars = 75 UTF-8 bytes
        })
        assert response.status_code == 400
        assert "72" in response.json()["detail"]
        body = response.text
        assert "PasswordPolicyError" not in body and "bcrypt" not in body.lower()
    finally:
        restore()


def test_admin_create_user_blank_password_returns_400_not_500():
    client, _db, restore = _api_client()
    try:
        response = client.post("/api/users/", headers=_admin_headers(client), json={
            "username": "blankpw", "password": " " * 8,
        })
        assert response.status_code == 400
        assert "密码" in response.json()["detail"]
    finally:
        restore()


def test_admin_create_user_valid_password_succeeds():
    client, db, restore = _api_client()
    try:
        response = client.post("/api/users/", headers=_admin_headers(client), json={
            "username": "goodteacher", "password": "good-pass-123",
        })
        assert response.status_code == 201
        assert db.query(User).filter(User.username == "goodteacher").one() is not None
    finally:
        restore()


# --- RB06: production CORS wildcard contract ----------------------------------

def _run_config_import(env):
    merged = os.environ.copy()
    merged.update(env)
    return subprocess.run(
        [sys.executable, "-c", "import app.core.config; print('ok')"],
        cwd=os.getcwd(), env=merged, text=True, capture_output=True, timeout=30,
    )


def test_production_wildcard_cors_fails_startup():
    result = _run_config_import({"ENV": "production", "DEBUG": "false", "CORS_ORIGINS": "*"})
    assert result.returncode != 0
    assert "wildcard CORS origin is not allowed in production" in (result.stderr + result.stdout)
    # No config values are echoed.
    assert "CORS_ORIGINS=*" not in (result.stderr + result.stdout)


def test_production_explicit_cors_origin_passes():
    result = _run_config_import({
        "ENV": "production", "DEBUG": "false",
        "CORS_ORIGINS": "https://teacher.example.com,https://student.example.com",
    })
    assert result.returncode == 0
    assert "ok" in result.stdout


def test_development_cors_defaults_unaffected():
    result = _run_config_import({"ENV": "development", "DEBUG": "true", "CORS_ORIGINS": ""})
    assert result.returncode == 0
    assert "ok" in result.stdout
