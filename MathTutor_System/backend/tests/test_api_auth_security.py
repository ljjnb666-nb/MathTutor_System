from io import BytesIO

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_anonymous_rag_list_requires_auth():
    assert client.get("/api/rag/documents").status_code == 401


def test_anonymous_rag_upload_requires_auth():
    files = {"file": ("a.pdf", BytesIO(b"%PDF-1.4"), "application/pdf")}
    assert client.post("/api/rag/upload", files=files).status_code == 401


def test_anonymous_rag_status_requires_auth():
    assert client.get("/api/rag/upload/status/task-id").status_code == 401


def test_anonymous_upload_parse_requires_auth():
    files = {"file": ("a.docx", BytesIO(b"content"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    assert client.post("/api/upload/parse/word", files=files).status_code == 401


def test_anonymous_generate_analysis_requires_auth():
    assert client.post("/api/upload/generate-analysis", json={"questions": [{"content": "x"}]}).status_code == 401


def test_anonymous_generate_verify_requires_auth():
    assert client.post("/api/verify", json={"content": "x"}).status_code == 401


def test_anonymous_teacher_agent_requires_auth():
    assert client.post("/api/teacher-agent/runs", json={"goal": "plan a lesson"}).status_code == 401


def test_anonymous_teacher_agent_practice_artifact_requires_auth():
    assert client.post("/api/teacher-agent/runs/1/artifacts/practice-set", json={"question_count": 5}).status_code == 401
    assert client.get("/api/teacher-agent/artifacts/1").status_code == 401
    assert client.patch("/api/teacher-agent/artifacts/1", json={}).status_code == 401
    assert client.post("/api/teacher-agent/artifacts/1/prepare-save").status_code == 401
    assert client.post("/api/teacher-agent/actions/1/confirm", json={}).status_code == 401
    assert client.post("/api/teacher-agent/actions/1/cancel").status_code == 401
    assert client.get("/api/teacher-agent/actions/1").status_code == 401
