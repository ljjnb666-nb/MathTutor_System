"""Tenant purge isolation, failure recovery, real Chroma and deterministic fencing."""
import copy
import json
import threading
from dataclasses import FrozenInstanceError
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.services import rag_document_store as store
from app.services import rag_service as service_module
from app.services.rag_service import RAGService


class FakeCollection:
    def __init__(self):
        self.rows = {}
        self.delete_calls = []
        self.get_calls = []
        self.failure = None
        self.bad_get = None

    def get(self, where=None, include=None):
        self.get_calls.append(where)
        if self.failure == "get":
            raise RuntimeError("get failure")
        if self.bad_get is not None:
            return self.bad_get
        clauses = (where or {}).get("$and", [where or {}])
        selected = {key: meta for key, meta in self.rows.items()
                    if all(all(meta.get(k) == v for k, v in clause.items()) for clause in clauses)}
        return {"ids": list(selected), "metadatas": list(selected.values())}

    def delete(self, ids):
        self.delete_calls.append(list(ids))
        if self.failure == "delete":
            raise RuntimeError("delete failure")
        if self.failure == "partial":
            self.rows.pop(ids[0], None)
            raise RuntimeError("partial failure")
        if self.failure != "noop":
            for row_id in ids:
                self.rows.pop(row_id, None)


@pytest.fixture
def storage(tmp_path, monkeypatch):
    path = tmp_path / "documents_registry.json"
    monkeypatch.setattr(store, "REGISTRY_FILE", path)
    collection = FakeCollection()
    monkeypatch.setattr(store, "get_collection_only", lambda: collection)
    return SimpleNamespace(path=path, collection=collection)


def seed(storage):
    entries = [
        {"owner_user_id": 1, "document_id": "same-doc", "source": "same.pdf", "chunk_count": 99},
        {"owner_user_id": 1, "document_id": "a2", "source": "other.pdf", "chunk_count": 0},
        {"owner_user_id": 2, "document_id": "same-doc", "source": "same.pdf", "chunk_count": 1},
    ]
    rows = {
        "a:0": {"owner_user_id": 1, "document_id": "same-doc", "source": "same.pdf"},
        "a:1": {"owner_user_id": 1, "document_id": "same-doc", "source": "same.pdf"},
        "a2:0": {"owner_user_id": 1, "document_id": "a2", "source": "other.pdf"},
        "b:0": {"owner_user_id": 2, "document_id": "same-doc", "source": "same.pdf"},
    }
    for index, owner in enumerate([None, "", 0, "missing"]):
        meta = {"source": "same.pdf", "document_id": "same-doc"}
        if owner != "missing":
            meta["owner_user_id"] = owner
        entries.append({**meta, "chunk_count": 1})
        rows[f"legacy:{index}"] = meta
    store.write_documents_registry(entries)
    storage.collection.rows = copy.deepcopy(rows)
    return entries, rows


def assert_preserved(storage, entries, rows):
    assert storage.collection.rows == {k: m for k, m in rows.items() if m.get("owner_user_id") != 1}
    assert store.read_documents_registry(strict=True) == [e for e in entries if e.get("owner_user_id") != 1]


def test_complete_purge_isolated_idempotent_and_stable(storage, monkeypatch):
    entries, rows = seed(storage)
    monkeypatch.setattr(RAGService, "__init__", lambda *a, **k: pytest.fail("initialized embeddings"))
    for key in ["LLM_API_KEY", "GOOGLE_API_KEY", "DEEPSEEK_API_KEY"]:
        monkeypatch.delenv(key, raising=False)
    result = store.rag_purge_owner(1)
    assert result == store.RAGTenantPurgeResult(1, 3, 2, 0, 0)
    with pytest.raises(FrozenInstanceError):
        result.owner_user_id = 2
    assert_preserved(storage, entries, rows)
    assert all(where == {"owner_user_id": 1} for where in storage.collection.get_calls)
    assert store.rag_purge_owner(1) == store.RAGTenantPurgeResult(1, 0, 0, 0, 0)
    assert_preserved(storage, entries, rows)


@pytest.mark.parametrize("owner", [0, -1, True, False, "12", None, 1.0, [], {}])
def test_invalid_owner_has_zero_storage_access(storage, owner):
    with pytest.raises(ValueError):
        store.rag_purge_owner(owner)
    assert not storage.collection.get_calls
    assert not storage.path.exists()


@pytest.mark.parametrize("orphan", ["chroma", "registry", "missing-both"])
def test_orphans_converge(storage, orphan):
    if orphan == "chroma":
        storage.collection.rows = {"a:0": {"owner_user_id": 1}}
    elif orphan == "registry":
        store.write_documents_registry([{"owner_user_id": 1, "document_id": "a", "chunk_count": 100}])
    assert store.rag_purge_owner(1) == store.RAGTenantPurgeResult(1, int(orphan == "chroma"), int(orphan == "registry"), 0, 0)
    assert not storage.collection.rows
    assert not store.read_documents_registry(strict=True)


@pytest.mark.parametrize("raw", ["{", "[]", '{}', '{"documents": {}}', '{"documents": [null]}', '{"documents": [12]}'])
def test_corrupt_structure_fails_before_chroma_access(storage, raw):
    _, rows = seed(storage)
    storage.path.write_text(raw, encoding="utf-8")
    original = storage.path.read_bytes()
    with pytest.raises(store.DocumentRegistryError):
        store.rag_purge_owner(1)
    assert not storage.collection.get_calls
    assert not storage.collection.delete_calls
    assert storage.collection.rows == rows
    assert storage.path.read_bytes() == original


@pytest.mark.parametrize("owner", ["not-an-id", "1", [], {}, -1, True, False, 1.0])
def test_invalid_registry_owner_fails_closed(storage, owner):
    _, rows = seed(storage)
    storage.path.write_text(json.dumps({"documents": [{"owner_user_id": owner}]}), encoding="utf-8")
    original = storage.path.read_bytes()
    with pytest.raises(store.DocumentRegistryError):
        store.rag_purge_owner(1)
    assert not storage.collection.get_calls
    assert storage.collection.rows == rows
    assert storage.path.read_bytes() == original


def test_unreadable_registry_fails_before_chroma_access(storage, monkeypatch):
    original_read = Path.read_text
    def unavailable(path, *args, **kwargs):
        if path == storage.path:
            raise PermissionError("unavailable")
        return original_read(path, *args, **kwargs)
    monkeypatch.setattr(Path, "read_text", unavailable)
    with pytest.raises(store.DocumentRegistryError):
        store.rag_purge_owner(1)
    assert not storage.collection.get_calls


@pytest.mark.parametrize("failure", ["get", "delete", "partial", "noop"])
def test_chroma_failure_preserves_registry_then_retry_converges(storage, failure):
    entries, rows = seed(storage)
    original = storage.path.read_bytes()
    storage.collection.failure = failure
    with pytest.raises(store.RAGTenantPurgeError if failure == "noop" else RuntimeError):
        store.rag_purge_owner(1)
    assert storage.path.read_bytes() == original
    if failure == "partial":
        assert "a:0" not in storage.collection.rows
        assert "a:1" in storage.collection.rows
    else:
        assert storage.collection.rows == rows
    storage.collection.failure = None
    result = store.rag_purge_owner(1)
    assert result.deleted_chunk_count == (2 if failure == "partial" else 3)
    assert result.removed_registry_count == 2
    assert_preserved(storage, entries, rows)


@pytest.mark.parametrize("bad_payload", [
    {"ids": ["b"], "metadatas": [{"owner_user_id": 2}]},
    {"ids": ["legacy"], "metadatas": [{}]},
    {"ids": ["a"], "metadatas": [{"owner_user_id": True}]},
    {"ids": ["a"], "metadatas": []},
    {"ids": ["a"], "metadatas": [None]},
    {"ids": ["a", "a"], "metadatas": [{"owner_user_id": 1}] * 2},
    {},
])
def test_chroma_scope_mismatch_has_zero_mutation(storage, bad_payload):
    seed(storage)
    original = storage.path.read_bytes()
    storage.collection.bad_get = bad_payload
    with pytest.raises(store.RAGTenantPurgeError):
        store.rag_purge_owner(1)
    assert not storage.collection.delete_calls
    assert storage.path.read_bytes() == original


def test_registry_write_failure_after_chroma_delete_converges(storage, monkeypatch):
    entries, rows = seed(storage)
    original = storage.path.read_bytes()
    real_write = store.write_documents_registry
    def fail_write(*args, **kwargs):
        raise OSError("write failure")
    monkeypatch.setattr(store, "write_documents_registry", fail_write)
    with pytest.raises(OSError):
        store.rag_purge_owner(1)
    assert not any(m.get("owner_user_id") == 1 for m in storage.collection.rows.values())
    assert storage.path.read_bytes() == original
    monkeypatch.setattr(store, "write_documents_registry", real_write)
    assert store.rag_purge_owner(1) == store.RAGTenantPurgeResult(1, 0, 2, 0, 0)
    assert_preserved(storage, entries, rows)


def test_registry_atomic_replace_failure_preserves_bytes_and_retry(storage, monkeypatch):
    seed(storage)
    original = storage.path.read_bytes()
    real_replace = Path.replace
    def fail_replace(path, target):
        if target == storage.path:
            raise OSError("replace failure")
        return real_replace(path, target)
    monkeypatch.setattr(Path, "replace", fail_replace)
    with pytest.raises(OSError):
        store.rag_purge_owner(1)
    assert storage.path.read_bytes() == original
    assert not list(storage.path.parent.glob("*.tmp"))
    monkeypatch.setattr(Path, "replace", real_replace)
    assert store.rag_purge_owner(1).removed_registry_count == 2


def test_final_registry_verification_rejects_noop_write(storage, monkeypatch):
    seed(storage)
    monkeypatch.setattr(store, "write_documents_registry", lambda *a, **k: None)
    with pytest.raises(store.RAGTenantPurgeError, match="Registry"):
        store.rag_purge_owner(1)


def test_final_chroma_verification_rejects_recreated_chunk(storage, monkeypatch):
    seed(storage)
    real_write = store.write_documents_registry
    def recreate(items):
        real_write(items)
        storage.collection.rows["late"] = {"owner_user_id": 1}
    monkeypatch.setattr(store, "write_documents_registry", recreate)
    with pytest.raises(store.RAGTenantPurgeError, match="after registry"):
        store.rag_purge_owner(1)
    monkeypatch.setattr(store, "write_documents_registry", real_write)
    assert store.rag_purge_owner(1) == store.RAGTenantPurgeResult(1, 1, 0, 0, 0)


@pytest.mark.parametrize("scope", ["document", "source"])
@pytest.mark.parametrize("with_chunks", [True, False])
def test_scoped_delete_cleans_registry_preserving_colliding_other_owner(storage, scope, with_chunks):
    entries, rows = seed(storage)
    if not with_chunks:
        storage.collection.rows.pop("a:0")
        storage.collection.rows.pop("a:1")
    result = store.rag_delete_document(1, "same-doc") if scope == "document" else store.rag_delete_owned_by_source(1, "same.pdf")
    assert result == (2 if with_chunks else 0)
    assert store.read_documents_registry(strict=True) == [e for e in entries if not (e.get("owner_user_id") == 1 and e["document_id"] == "same-doc")]
    assert storage.collection.rows == {k: m for k, m in rows.items() if k not in ("a:0", "a:1")}


@pytest.mark.parametrize("service_path", [False, True])
@pytest.mark.parametrize("with_chunks", [False, True])
def test_legacy_deletion_is_ownerless_only_in_both_paths(storage, service_path, with_chunks):
    entries, rows = seed(storage)
    owned_rows = {k: m for k, m in rows.items() if k.startswith("a") or k.startswith("b")}
    if not with_chunks:
        storage.collection.rows = copy.deepcopy(owned_rows)
    service = object.__new__(RAGService)
    service.vector_store = SimpleNamespace(_collection=storage.collection)
    result = service.delete_by_source("same.pdf") if service_path else store.rag_delete_by_source_no_auth("same.pdf")
    assert result == (4 if with_chunks else 0)
    assert storage.collection.rows == owned_rows
    assert store.read_documents_registry(strict=True) == entries[:3]


@pytest.mark.parametrize("mutation", ["add", "remove", "ownerless", "write", "document", "source", "legacy"])
def test_all_registry_mutations_fail_closed(storage, mutation):
    seed(storage)
    storage.path.write_text("{broken", encoding="utf-8")
    original = storage.path.read_bytes()
    operations = {
        "add": lambda: store.registry_add("same.pdf", 1, []),
        "remove": lambda: store.registry_remove("same.pdf", owner_user_id=1),
        "ownerless": lambda: store.registry_remove_ownerless_source("same.pdf"),
        "write": lambda: store.write_documents_registry([]),
        "document": lambda: store.rag_delete_document(1, "same-doc"),
        "source": lambda: store.rag_delete_owned_by_source(1, "same.pdf"),
        "legacy": lambda: store.rag_delete_by_source_no_auth("same.pdf"),
    }
    with pytest.raises(store.DocumentRegistryError):
        operations[mutation]()
    assert storage.path.read_bytes() == original
    assert not storage.collection.get_calls


def test_legacy_registry_add_remove_never_treat_none_as_wildcard(storage):
    entries, _ = seed(storage)
    store.registry_add("same.pdf", 7, [])
    assert store.read_documents_registry(strict=True)[:3] == entries[:3]
    store.registry_remove("same.pdf")
    assert store.read_documents_registry(strict=True) == entries[:3]


def make_upload_service(storage, monkeypatch):
    service = object.__new__(RAGService)
    def add_texts(texts, metadatas, ids):
        storage.collection.rows.update(dict(zip(ids, metadatas)))
    service.vector_store = SimpleNamespace(_collection=storage.collection, add_texts=add_texts)
    monkeypatch.setattr(service_module, "split_into_structured_chunks", lambda text: [text])
    monkeypatch.setattr(service_module, "_is_valid_chunk", lambda chunk: True)
    return service


def test_reupload_preserves_other_tenants_and_cleans_old_document(storage, monkeypatch):
    entries, rows = seed(storage)
    service = make_upload_service(storage, monkeypatch)
    assert service.add_document("new text", "same.pdf", owner_user_id=1, document_id="new-a") == "new-a"
    assert "a:0" not in storage.collection.rows and "a:1" not in storage.collection.rows
    assert storage.collection.rows["new-a:0"]["owner_user_id"] == 1
    for key, meta in rows.items():
        if key not in ("a:0", "a:1"):
            assert storage.collection.rows[key] == meta
    assert [e for e in store.read_documents_registry(strict=True) if e.get("owner_user_id") != 1] == entries[2:]


def test_upload_registry_corruption_before_write_rolls_back_new_chunks(storage, monkeypatch):
    seed(storage)
    service = make_upload_service(storage, monkeypatch)
    real_add = service.vector_store.add_texts
    original_rows = copy.deepcopy(storage.collection.rows)
    def corrupt_then_add(**kwargs):
        real_add(**kwargs)
        storage.path.write_text("{corrupt", encoding="utf-8")
    service.vector_store.add_texts = corrupt_then_add
    with pytest.raises(store.DocumentRegistryError):
        service.add_document("new text", "same.pdf", owner_user_id=1, document_id="new-a")
    assert storage.collection.rows == original_rows
    assert storage.path.read_text(encoding="utf-8") == "{corrupt"


def test_corrupt_registry_blocks_upload_before_chroma_write(storage, monkeypatch):
    seed(storage)
    service = make_upload_service(storage, monkeypatch)
    rows = copy.deepcopy(storage.collection.rows)
    storage.path.write_text("{corrupt", encoding="utf-8")
    with pytest.raises(store.DocumentRegistryError):
        service.add_document("new text", "same.pdf", owner_user_id=1, document_id="new-a")
    assert storage.collection.rows == rows


def test_old_cleanup_failure_warns_without_removing_other_owner(storage, monkeypatch, caplog):
    entries, rows = seed(storage)
    service = make_upload_service(storage, monkeypatch)
    storage.collection.failure = "delete"
    service.add_document("new text", "same.pdf", owner_user_id=1, document_id="new-a")
    assert "old document cleanup failed" in caplog.text
    assert storage.collection.rows["b:0"] == rows["b:0"]
    assert storage.collection.rows["new-a:0"]["owner_user_id"] == 1
    assert any(e.get("document_id") == "new-a" for e in store.read_documents_registry(strict=True))
    storage.collection.failure = None
    store.rag_purge_owner(1)
    assert_preserved(storage, entries, rows)


def test_mutation_guard_is_reentrant_rlock():
    assert isinstance(store._RAG_MUTATION_LOCK, type(threading.RLock()))
    with store.rag_mutation_guard():
        with store.rag_mutation_guard():
            assert store._RAG_MUTATION_LOCK._is_owned()


@pytest.mark.parametrize("operation", ["upload", "purge", "document", "source", "legacy", "service-legacy"])
def test_mutations_wait_for_same_guard_without_sleeps(storage, monkeypatch, operation):
    seed(storage)
    service = make_upload_service(storage, monkeypatch)
    requested = threading.Event()
    entered = threading.Event()
    errors = []
    real_lock = threading.RLock()
    class ObservedRLock:
        def __enter__(self):
            requested.set()
            real_lock.acquire()
            entered.set()
            return self
        def __exit__(self, *args):
            real_lock.release()
    monkeypatch.setattr(store, "_RAG_MUTATION_LOCK", ObservedRLock())
    operations = {
        "upload": lambda: service.add_document("text", "same.pdf", owner_user_id=1, document_id="new-a"),
        "purge": lambda: store.rag_purge_owner(1),
        "document": lambda: store.rag_delete_document(1, "same-doc"),
        "source": lambda: store.rag_delete_owned_by_source(1, "same.pdf"),
        "legacy": lambda: store.rag_delete_by_source_no_auth("same.pdf"),
        "service-legacy": lambda: service.delete_by_source("same.pdf"),
    }
    def work():
        try:
            operations[operation]()
        except BaseException as exc:
            errors.append(exc)
    rows = copy.deepcopy(storage.collection.rows)
    original = storage.path.read_bytes()
    with real_lock:
        thread = threading.Thread(target=work)
        thread.start()
        assert requested.wait(5), "worker never requested shared mutation lock"
        assert not entered.is_set()
        assert storage.collection.rows == rows
        assert storage.path.read_bytes() == original
    thread.join(5)
    assert not thread.is_alive()
    assert not errors
    assert entered.is_set()


def test_upload_and_purge_critical_sections_do_not_interleave(storage, monkeypatch):
    seed(storage)
    service = make_upload_service(storage, monkeypatch)
    upload_inside = threading.Event()
    release_upload = threading.Event()
    purge_requested = threading.Event()
    failures = []
    real_lock = threading.RLock()
    class ObservedRLock:
        def __enter__(self):
            if threading.current_thread().name == "purge":
                purge_requested.set()
            real_lock.acquire()
            return self
        def __exit__(self, *args):
            real_lock.release()
    monkeypatch.setattr(store, "_RAG_MUTATION_LOCK", ObservedRLock())
    real_add = service.vector_store.add_texts
    def blocked_add(**kwargs):
        upload_inside.set()
        assert release_upload.wait(5)
        real_add(**kwargs)
    service.vector_store.add_texts = blocked_add
    def run(action):
        try:
            action()
        except BaseException as exc:
            failures.append(exc)
    upload = threading.Thread(target=run, args=(lambda: service.add_document("text", "same.pdf", owner_user_id=1, document_id="new-a"),), name="upload")
    purge = threading.Thread(target=run, args=(lambda: store.rag_purge_owner(1),), name="purge")
    upload.start()
    try:
        assert upload_inside.wait(5)
        purge.start()
        assert purge_requested.wait(5)
        assert not storage.collection.delete_calls
    finally:
        release_upload.set()
        upload.join(5)
        if purge.ident is not None:
            purge.join(5)
    assert not upload.is_alive() and not purge.is_alive()
    assert not failures
    assert not any(m.get("owner_user_id") == 1 for m in storage.collection.rows.values())
    assert not any(e.get("owner_user_id") == 1 for e in store.read_documents_registry(strict=True))


def test_real_chroma_persistent_owner_purge(tmp_path, monkeypatch):
    chromadb = pytest.importorskip("chromadb")
    client = chromadb.PersistentClient(path=str(tmp_path / "chroma"))
    collection = client.get_or_create_collection(store.COLLECTION_NAME)
    monkeypatch.setattr(store, "PERSIST_DIR", tmp_path / "chroma")
    monkeypatch.setattr(store, "REGISTRY_FILE", tmp_path / "chroma" / "documents_registry.json")
    metadata = [
        {"owner_user_id": 1, "document_id": "same-doc", "source": "same.pdf"},
        {"owner_user_id": 1, "document_id": "a2", "source": "same.pdf"},
        {"owner_user_id": 2, "document_id": "same-doc", "source": "same.pdf"},
        {"document_id": "same-doc", "source": "same.pdf"},
        {"owner_user_id": 0, "source": "same.pdf"},
        {"owner_user_id": "", "source": "same.pdf"},
    ]
    ids = ["a", "a2", "b", "legacy-missing", "legacy-zero", "legacy-empty"]
    # Explicit vectors bypass default embedding downloads and API keys.
    collection.add(ids=ids, metadatas=metadata, documents=["text"] * 6, embeddings=[[1.0, 0.0]] * 6)
    store.write_documents_registry(metadata)
    assert store.rag_purge_owner(1) == store.RAGTenantPurgeResult(1, 2, 2, 0, 0)
    assert collection.get(where={"owner_user_id": 1})["ids"] == []
    remaining = collection.get(include=["metadatas", "documents", "embeddings"])
    assert dict(zip(remaining["ids"], remaining["metadatas"])) == dict(zip(ids[2:], metadata[2:]))
    assert remaining["documents"] == ["text"] * 4
    assert remaining["embeddings"].tolist() == [[1.0, 0.0]] * 4
    assert store.read_documents_registry(strict=True) == metadata[2:]
    assert store.rag_purge_owner(1) == store.RAGTenantPurgeResult(1, 0, 0, 0, 0)
    assert store.rag_delete_by_source_no_auth("same.pdf") == 3
    assert collection.get()["ids"] == ["b"]
    assert store.read_documents_registry(strict=True) == [metadata[2]]
