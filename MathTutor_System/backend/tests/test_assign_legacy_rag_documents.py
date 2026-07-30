import shutil
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.user import User
from scripts import assign_legacy_rag_documents as migration
from scripts.assign_legacy_rag_documents import (
    LegacyMigrationError,
    assign_legacy_rag_documents,
    find_target_user,
)
from app.services import rag_document_store as store

TEST_TMP_DIR = Path(__file__).resolve().parent / ".tmp_legacy_rag"


class FakeCollection:
    def __init__(self):
        self.metadatas = [{"source": "legacy.pdf", "chunk_index": 0}, {"source": "legacy.pdf", "chunk_index": 1}]
        self.ids = ["id-1", "id-2"]
        self.documents = ["a", "b"]
        self.updated = None

    def get(self, where=None, include=None):
        return {"ids": self.ids, "metadatas": self.metadatas, "documents": self.documents}

    def update(self, ids, metadatas):
        self.updated = {"ids": ids, "metadatas": metadatas}
        self.metadatas = metadatas


def make_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine, tables=[User.__table__])
    db = sessionmaker(bind=engine)()
    db.add(User(id=7, username="teacher-a", hashed_password="x", role="teacher", is_active=True))
    db.commit()
    return db


def test_legacy_migration_requires_user():
    db = make_db()
    try:
        find_target_user(db)
    except LegacyMigrationError:
        pass
    else:
        raise AssertionError("expected LegacyMigrationError")


def test_legacy_migration_rejects_missing_user():
    db = make_db()
    try:
        find_target_user(db, username="missing")
    except LegacyMigrationError:
        pass
    else:
        raise AssertionError("expected LegacyMigrationError")


def _registry_path(name: str, request):
    TEST_TMP_DIR.mkdir(exist_ok=True)
    request.addfinalizer(lambda: shutil.rmtree(TEST_TMP_DIR, ignore_errors=True))
    return TEST_TMP_DIR / name


def test_legacy_migration_dry_run_does_not_modify(monkeypatch, request):
    db = make_db()
    registry = _registry_path("dry_run.json", request)
    monkeypatch.setattr(store, "REGISTRY_FILE", registry)
    monkeypatch.setattr(migration.store, "REGISTRY_FILE", registry)
    store.write_documents_registry([{"source": "legacy.pdf", "chunk_count": 2, "knowledge_points": ["函数"]}])
    collection = FakeCollection()
    monkeypatch.setattr(store, "get_collection_only", lambda: collection)
    monkeypatch.setattr(migration.store, "get_collection_only", lambda: collection)

    result = assign_legacy_rag_documents(db, username="teacher-a")

    assert result["dry_run"] is True
    assert result["documents"][0]["chunk_count"] == 2
    assert collection.updated is None
    assert store.read_documents_registry()[0].get("owner_user_id") is None


def test_legacy_migration_assigns_registry_and_chroma_metadata(monkeypatch, request):
    db = make_db()
    registry = _registry_path("assign.json", request)
    monkeypatch.setattr(store, "REGISTRY_FILE", registry)
    monkeypatch.setattr(migration.store, "REGISTRY_FILE", registry)
    store.write_documents_registry([{"source": "legacy.pdf", "chunk_count": 2, "knowledge_points": ["函数"]}])
    collection = FakeCollection()
    monkeypatch.setattr(store, "get_collection_only", lambda: collection)
    monkeypatch.setattr(migration.store, "get_collection_only", lambda: collection)

    result = assign_legacy_rag_documents(db, user_id=7, dry_run=False)

    assert result["dry_run"] is False
    assert all(meta["owner_user_id"] == 7 for meta in collection.updated["metadatas"])
    registry_items = store.read_documents_registry()
    assert registry_items == [
        {
            "document_id": registry_items[0]["document_id"],
            "owner_user_id": 7,
            "source": "legacy.pdf",
            "knowledge_point": "",
            "chunk_type": "legacy",
            "created_at": registry_items[0]["created_at"],
            "chunk_count": 2,
            "knowledge_points": ["函数"],
        }
    ]


def test_legacy_migration_is_idempotent_after_assignment(monkeypatch, request):
    db = make_db()
    registry = _registry_path("idempotent.json", request)
    monkeypatch.setattr(store, "REGISTRY_FILE", registry)
    monkeypatch.setattr(migration.store, "REGISTRY_FILE", registry)
    store.write_documents_registry([{"source": "legacy.pdf", "chunk_count": 2, "knowledge_points": ["函数"]}])
    collection = FakeCollection()
    monkeypatch.setattr(store, "get_collection_only", lambda: collection)
    monkeypatch.setattr(migration.store, "get_collection_only", lambda: collection)

    assign_legacy_rag_documents(db, user_id=7, dry_run=False)
    collection.updated = None
    second = assign_legacy_rag_documents(db, user_id=7, dry_run=False)

    assert second["documents"] == []
    assert collection.updated is None
