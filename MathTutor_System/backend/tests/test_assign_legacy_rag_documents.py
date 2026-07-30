import shutil
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.user import User
from app.services import rag_document_store as store
from scripts import assign_legacy_rag_documents as migration
from scripts.assign_legacy_rag_documents import (
    LegacyMigrationError,
    assign_legacy_rag_documents,
    find_target_user,
    ownerless_registry_entries,
)

TEST_TMP_DIR = Path(__file__).resolve().parent / ".tmp_legacy_rag"


class FakeCollection:
    def __init__(self, *, fail_add=False, fail_legacy_delete=False):
        self.records = {
            "legacy-1": {"metadata": {"source": "legacy.pdf", "chunk_index": 0}, "document": "a"},
            "legacy-2": {"metadata": {"source": "legacy.pdf", "chunk_index": 1}, "document": "b"},
        }
        self.fail_add = fail_add
        self.fail_legacy_delete = fail_legacy_delete
        self.add_calls = 0
        self.delete_calls = []

    def get(self, where=None, include=None):
        rows = []
        where = where or {}
        for row_id, row in self.records.items():
            metadata = row["metadata"]
            if all(metadata.get(key) == value for key, value in where.items()):
                rows.append((row_id, row))
        return {
            "ids": [row_id for row_id, _ in rows],
            "metadatas": [row["metadata"] for _, row in rows],
            "documents": [row["document"] for _, row in rows],
        }

    def add(self, ids, documents, metadatas):
        self.add_calls += 1
        if self.fail_add:
            if ids:
                self.records[ids[0]] = {"metadata": metadatas[0], "document": documents[0]}
            raise RuntimeError("copy failed")
        for row_id, document, metadata in zip(ids, documents, metadatas):
            self.records[row_id] = {"metadata": metadata, "document": document}

    def delete(self, ids):
        self.delete_calls.append(list(ids))
        if self.fail_legacy_delete and any(str(row_id).startswith("legacy-") for row_id in ids):
            raise RuntimeError("legacy delete failed")
        for row_id in ids:
            self.records.pop(row_id, None)

    def ownerless_legacy_ids(self):
        return [
            row_id
            for row_id, row in self.records.items()
            if row["metadata"].get("source") == "legacy.pdf" and row["metadata"].get("owner_user_id") in (None, "", 0)
        ]

    def owned_ids(self):
        return [
            row_id
            for row_id, row in self.records.items()
            if row["metadata"].get("source") == "legacy.pdf" and row["metadata"].get("owner_user_id") == 7
        ]


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


def _patch_store(monkeypatch, registry, collection):
    monkeypatch.setattr(store, "REGISTRY_FILE", registry)
    monkeypatch.setattr(migration.store, "REGISTRY_FILE", registry)
    monkeypatch.setattr(store, "get_collection_only", lambda: collection)
    monkeypatch.setattr(migration.store, "get_collection_only", lambda: collection)


def _seed_registry():
    store.write_documents_registry([{"source": "legacy.pdf", "chunk_count": 2, "knowledge_points": ["functions"]}])


def test_legacy_migration_dry_run_does_not_modify(monkeypatch, request):
    db = make_db()
    registry = _registry_path("dry_run.json", request)
    collection = FakeCollection()
    _patch_store(monkeypatch, registry, collection)
    _seed_registry()

    result = assign_legacy_rag_documents(db, username="teacher-a")

    assert result["dry_run"] is True
    assert result["documents"][0]["chunk_count"] == 2
    assert collection.add_calls == 0
    assert collection.ownerless_legacy_ids() == ["legacy-1", "legacy-2"]
    assert store.read_documents_registry()[0].get("owner_user_id") is None


def test_legacy_document_remains_discoverable_for_migration(monkeypatch, request):
    registry = _registry_path("discover.json", request)
    collection = FakeCollection()
    _patch_store(monkeypatch, registry, collection)
    _seed_registry()

    assert ownerless_registry_entries() == [{"source": "legacy.pdf", "chunk_count": 2, "knowledge_points": ["functions"]}]


def test_legacy_migration_copies_switches_registry_and_deletes_old_chunks(monkeypatch, request):
    db = make_db()
    registry = _registry_path("assign.json", request)
    collection = FakeCollection()
    _patch_store(monkeypatch, registry, collection)
    _seed_registry()

    result = assign_legacy_rag_documents(db, user_id=7, dry_run=False)

    assert result["dry_run"] is False
    assert result["migrated"] == 1
    assert result["warnings"] == []
    assert collection.ownerless_legacy_ids() == []
    owned_ids = collection.owned_ids()
    assert len(owned_ids) == 2
    assert all(row_id.startswith(store.read_documents_registry()[0]["document_id"]) for row_id in owned_ids)
    assert store.read_documents_registry() == [
        {
            "document_id": store.read_documents_registry()[0]["document_id"],
            "owner_user_id": 7,
            "source": "legacy.pdf",
            "knowledge_point": "",
            "chunk_type": "legacy",
            "created_at": store.read_documents_registry()[0]["created_at"],
            "chunk_count": 2,
            "knowledge_points": ["functions"],
        }
    ]


def test_new_chunk_write_failure_leaves_legacy_unchanged(monkeypatch, request):
    db = make_db()
    registry = _registry_path("add_fail.json", request)
    collection = FakeCollection(fail_add=True)
    _patch_store(monkeypatch, registry, collection)
    _seed_registry()

    try:
        assign_legacy_rag_documents(db, user_id=7, dry_run=False)
    except RuntimeError as exc:
        assert "copy failed" in str(exc)
    else:
        raise AssertionError("expected copy failure")

    assert collection.ownerless_legacy_ids() == ["legacy-1", "legacy-2"]
    assert collection.owned_ids() == []
    assert store.read_documents_registry() == [{"source": "legacy.pdf", "chunk_count": 2, "knowledge_points": ["functions"]}]


def test_registry_failure_cleans_new_chunks_and_can_retry(monkeypatch, request):
    db = make_db()
    registry = _registry_path("registry_fail.json", request)
    collection = FakeCollection()
    _patch_store(monkeypatch, registry, collection)
    _seed_registry()
    original_write = migration.store.write_documents_registry
    calls = {"count": 0}

    def fail_once(items):
        calls["count"] += 1
        if calls["count"] == 1:
            raise RuntimeError("registry failed")
        original_write(items)

    monkeypatch.setattr(migration.store, "write_documents_registry", fail_once)

    try:
        assign_legacy_rag_documents(db, user_id=7, dry_run=False)
    except RuntimeError as exc:
        assert "registry failed" in str(exc)
    else:
        raise AssertionError("expected registry failure")

    assert collection.ownerless_legacy_ids() == ["legacy-1", "legacy-2"]
    assert collection.owned_ids() == []
    assert store.read_documents_registry() == [{"source": "legacy.pdf", "chunk_count": 2, "knowledge_points": ["functions"]}]

    result = assign_legacy_rag_documents(db, user_id=7, dry_run=False)

    assert result["migrated"] == 1
    assert collection.ownerless_legacy_ids() == []
    assert len(collection.owned_ids()) == 2


def test_legacy_delete_failure_keeps_owned_doc_and_warns(monkeypatch, request):
    db = make_db()
    registry = _registry_path("delete_fail.json", request)
    collection = FakeCollection(fail_legacy_delete=True)
    _patch_store(monkeypatch, registry, collection)
    _seed_registry()

    result = assign_legacy_rag_documents(db, user_id=7, dry_run=False)

    assert result["warnings"][0]["source"] == "legacy.pdf"
    assert result["warnings"][0]["legacy_chunk_ids"] == ["legacy-1", "legacy-2"]
    assert collection.ownerless_legacy_ids() == ["legacy-1", "legacy-2"]
    assert len(collection.owned_ids()) == 2
    assert store.read_documents_registry()[0]["owner_user_id"] == 7


def test_legacy_migration_is_idempotent_after_assignment(monkeypatch, request):
    db = make_db()
    registry = _registry_path("idempotent.json", request)
    collection = FakeCollection(fail_legacy_delete=True)
    _patch_store(monkeypatch, registry, collection)
    _seed_registry()

    assign_legacy_rag_documents(db, user_id=7, dry_run=False)
    first_owned_ids = set(collection.owned_ids())
    second = assign_legacy_rag_documents(db, user_id=7, dry_run=False)

    assert second["documents"] == []
    assert set(collection.owned_ids()) == first_owned_ids
    assert collection.add_calls == 1
