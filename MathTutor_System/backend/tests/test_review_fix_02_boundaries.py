"""External-review fix round 02 boundaries: bounded exam read + admin batch error path."""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.endpoints import upload
from app.models.base import Base
from app.models.plan import Plan
from app.models.subscription import Subscription
from app.models.subscription_history import SubscriptionHistory
from app.models.user import User
from app.services import user_admin_service


# ---- RF02-03: exam upload bounded read ---------------------------------------

class RecordingExamUpload:
    filename = "big.pdf"
    content_type = "application/pdf"

    def __init__(self):
        self.sizes = []

    async def read(self, size=None):
        self.sizes.append(size)
        return b"x" * (upload.MAX_UPLOAD_BYTES + 1)


def _fail(name):
    return lambda *a, **k: pytest.fail(f"{name} must not run for an oversized upload")


def test_exam_oversized_upload_413_before_any_processing(monkeypatch):
    monkeypatch.setattr(upload, "preflight_document", _fail("preflight"))
    monkeypatch.setattr(upload, "convert_docx_to_pdf", _fail("LibreOffice conversion"))
    monkeypatch.setattr(upload, "pdf_pages_to_images", _fail("PDF render"))
    monkeypatch.setattr(upload, "parse_with_deepseek", _fail("LLM parse"))
    monkeypatch.setattr(upload, "_extract_text_from_pdf_bytes", _fail("pdf text fallback"))

    fake = RecordingExamUpload()
    llm_config = SimpleNamespace(api_key="", base_url="", model="", provider="openai")
    user = User(id=1, username="t", hashed_password="x", role="teacher", is_active=True)

    with pytest.raises(HTTPException) as exc:
        import asyncio

        asyncio.run(upload.parse_word_exam(file=fake, llm_config=llm_config, current_user=user))
    assert exc.value.status_code == 413
    assert fake.sizes == [upload.MAX_UPLOAD_BYTES + 1]


def test_exam_normal_upload_reads_within_bound(monkeypatch):
    seen = {}

    class NormalUpload:
        filename = "small.pdf"
        content_type = "application/pdf"

        async def read(self, size=None):
            seen["size"] = size
            return b"%PDF-1.4 tiny"

    monkeypatch.setattr(upload, "preflight_document", lambda *a, **k: None)
    monkeypatch.setattr(upload, "pdf_pages_to_images", lambda *a, **k: [])
    monkeypatch.setattr(
        upload, "_extract_text_from_pdf_bytes",
        lambda *a, **k: pytest.fail("fallback only runs when text is empty"),
    )

    import asyncio

    # The endpoint falls back to text extraction, which we stub to a fixed question list.
    monkeypatch.setattr(upload, "parse_with_deepseek", lambda *a, **k: [{"content": "q"}])
    real_extract = upload._extract_text_from_pdf_bytes
    monkeypatch.setattr(upload, "_extract_text_from_pdf_bytes", lambda *a, **k: "题目文本")

    llm_config = SimpleNamespace(api_key="", base_url="", model="", provider="openai")
    user = User(id=1, username="t", hashed_password="x", role="teacher", is_active=True)
    result = asyncio.run(upload.parse_word_exam(file=NormalUpload(), llm_config=llm_config, current_user=user))
    assert seen["size"] == upload.MAX_UPLOAD_BYTES + 1
    assert result == {"questions": [{"content": "q"}]}


# ---- RF02-04: admin batch unexpected errors ----------------------------------

def make_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            Plan.__table__,
            Subscription.__table__,
            SubscriptionHistory.__table__,
        ],
    )
    return sessionmaker(bind=engine)()


def seed_batch_fixture(db):
    plan = Plan(id=1, code="pro", name="专业版", max_students=10, features={})
    user = User(id=1, username="teacher", hashed_password="x", role="teacher", is_active=True)
    db.add_all([plan, user])
    db.flush()
    db.add(Subscription(user_id=1, plan_id=1, status="active"))
    db.commit()


SECRET_SHAPED = "postgres://tutor:tutor-pw@10.0.0.9:5432/db SECRET[..]"


def test_batch_err_01_plan_apply_failure_returns_fixed_reason(monkeypatch):
    db = make_db()
    seed_batch_fixture(db)

    def explode(*a, **k):
        raise RuntimeError(f"driver exploded: {SECRET_SHAPED}")

    monkeypatch.setattr(user_admin_service, "_apply_plan_to_user", explode)
    result = user_admin_service.batch_set_or_extend_subscriptions(db, [1], "pro", None)
    assert result["updated"] == 0
    assert result["failed"] == [{"user_id": 1, "reason": "订阅操作失败，请稍后重试"}]
    assert SECRET_SHAPED not in str(result)


def test_batch_err_02_extend_failure_returns_fixed_reason(monkeypatch):
    db = make_db()
    seed_batch_fixture(db)
    from datetime import UTC, datetime, timedelta

    from app.models.subscription import Subscription

    sub = db.query(Subscription).first()
    sub.period_end = datetime.now(UTC).replace(tzinfo=None) + timedelta(days=3)
    db.commit()

    def explode(*a, **k):
        raise RuntimeError(f"write failed: {SECRET_SHAPED}")

    monkeypatch.setattr(user_admin_service, "_append_subscription_history", explode)
    result = user_admin_service.batch_set_or_extend_subscriptions(db, [1], None, 30)
    assert result["updated"] == 0
    assert result["failed"] == [{"user_id": 1, "reason": "续期操作失败，请稍后重试"}]
    assert SECRET_SHAPED not in str(result)
