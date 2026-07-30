import shutil
from pathlib import Path

from app.services import rag_document_store as store

TEST_TMP_DIR = Path(__file__).resolve().parent / ".tmp_rag_document_store"


class FakeCollection:
    def __init__(self, payload):
        self.payload = payload
        self.deleted_ids = None

    def get(self, **kwargs):
        return self.payload

    def delete(self, ids):
        self.deleted_ids = ids


def _fresh_registry(name: str, request) -> Path:
    TEST_TMP_DIR.mkdir(exist_ok=True)
    request.addfinalizer(lambda: shutil.rmtree(TEST_TMP_DIR, ignore_errors=True))
    registry = TEST_TMP_DIR / name
    if registry.exists():
        registry.unlink()
    return registry


def test_registry_add_replaces_existing_source(monkeypatch, request):
    registry = _fresh_registry("registry_add.json", request)
    monkeypatch.setattr(store, "REGISTRY_FILE", registry)

    store.registry_add("a.pdf", 2, ["勾股定理"])
    store.registry_add("a.pdf", 3, ["一次函数", "勾股定理"])

    assert store.read_documents_registry() == [
        {
            "source": "a.pdf",
            "chunk_count": 3,
            "knowledge_points": ["一次函数", "勾股定理"],
        }
    ]


def test_owned_upload_same_source_preserves_ownerless_legacy(monkeypatch, request):
    registry = _fresh_registry("registry_add_preserves_legacy.json", request)
    monkeypatch.setattr(store, "REGISTRY_FILE", registry)
    store.write_documents_registry([{"source": "legacy.pdf", "chunk_count": 2, "knowledge_points": ["legacy"]}])

    store.registry_add("legacy.pdf", 1, ["owned"], owner_user_id=1, document_id="owned-1")

    items = store.read_documents_registry()
    assert items == [
        {"source": "legacy.pdf", "chunk_count": 2, "knowledge_points": ["legacy"]},
        {
            "document_id": "owned-1",
            "owner_user_id": 1,
            "source": "legacy.pdf",
            "knowledge_point": "",
            "chunk_type": "",
            "created_at": "",
            "chunk_count": 1,
            "knowledge_points": ["owned"],
        },
    ]


def test_owned_upload_same_source_does_not_affect_other_teacher(monkeypatch, request):
    registry = _fresh_registry("registry_add_preserves_other_teacher.json", request)
    monkeypatch.setattr(store, "REGISTRY_FILE", registry)
    store.write_documents_registry(
        [
            {"source": "legacy.pdf", "chunk_count": 2, "knowledge_points": ["legacy"]},
            {
                "document_id": "teacher-b",
                "owner_user_id": 2,
                "source": "legacy.pdf",
                "knowledge_point": "",
                "chunk_type": "",
                "created_at": "",
                "chunk_count": 1,
                "knowledge_points": ["b"],
            },
        ]
    )

    store.registry_add("legacy.pdf", 1, ["a"], owner_user_id=1, document_id="teacher-a")

    items = store.read_documents_registry()
    assert [item.get("document_id") for item in items] == [None, "teacher-b", "teacher-a"]
    assert [item.get("owner_user_id") for item in items] == [None, 2, 1]


def test_owned_reupload_replaces_only_same_teacher_record(monkeypatch, request):
    registry = _fresh_registry("registry_add_replaces_same_teacher_only.json", request)
    monkeypatch.setattr(store, "REGISTRY_FILE", registry)
    store.write_documents_registry(
        [
            {"source": "legacy.pdf", "chunk_count": 2, "knowledge_points": ["legacy"]},
            {
                "document_id": "teacher-a-old",
                "owner_user_id": 1,
                "source": "legacy.pdf",
                "knowledge_point": "",
                "chunk_type": "",
                "created_at": "",
                "chunk_count": 1,
                "knowledge_points": ["old"],
            },
            {
                "document_id": "teacher-b",
                "owner_user_id": 2,
                "source": "legacy.pdf",
                "knowledge_point": "",
                "chunk_type": "",
                "created_at": "",
                "chunk_count": 1,
                "knowledge_points": ["b"],
            },
        ]
    )

    store.registry_add("legacy.pdf", 3, ["new"], owner_user_id=1, document_id="teacher-a-new")

    items = store.read_documents_registry()
    assert [item.get("document_id") for item in items] == [None, "teacher-b", "teacher-a-new"]
    assert items[0]["knowledge_points"] == ["legacy"]
    assert items[1]["knowledge_points"] == ["b"]
    assert items[2]["knowledge_points"] == ["new"]


def test_registry_remove_ignores_blank_source(monkeypatch, request):
    registry = _fresh_registry("registry_remove.json", request)
    monkeypatch.setattr(store, "REGISTRY_FILE", registry)
    store.write_documents_registry([{"source": "a.pdf", "chunk_count": 1}])

    store.registry_remove("")

    assert store.read_documents_registry() == [{"source": "a.pdf", "chunk_count": 1}]


def test_rag_list_documents_no_auth_groups_metadata(monkeypatch):
    collection = FakeCollection(
        {
            "metadatas": [
                {"source": "a.pdf", "knowledge_point": "勾股定理"},
                {"source": "a.pdf", "knowledge_point": "一次函数"},
                {"source": "b.pdf", "knowledge_point": ""},
            ]
        }
    )
    monkeypatch.setattr(store, "get_collection_only", lambda: collection)

    assert store.rag_list_documents_no_auth() == [
        {"source": "a.pdf", "chunk_count": 2, "knowledge_points": ["一次函数", "勾股定理"]},
        {"source": "b.pdf", "chunk_count": 1, "knowledge_points": []},
    ]


def test_rag_get_chunks_by_source_no_auth_sorts_by_chunk_index(monkeypatch):
    collection = FakeCollection(
        {
            "documents": ["第二块", "第一块", ""],
            "metadatas": [{"chunk_index": 2}, {"chunk_index": 1}, {"chunk_index": 3}],
        }
    )
    monkeypatch.setattr(store, "get_collection_only", lambda: collection)

    assert store.rag_get_chunks_by_source_no_auth("a.pdf") == ["第一块", "第二块"]


def test_rag_delete_by_source_no_auth_removes_registry_entry(monkeypatch, request):
    registry = _fresh_registry("registry_delete.json", request)
    monkeypatch.setattr(store, "REGISTRY_FILE", registry)
    store.write_documents_registry([{"source": "a.pdf", "chunk_count": 2}])
    collection = FakeCollection({"ids": ["1", "2"]})
    monkeypatch.setattr(store, "get_collection_only", lambda: collection)

    deleted_count = store.rag_delete_by_source_no_auth("a.pdf")

    assert deleted_count == 2
    assert collection.deleted_ids == ["1", "2"]
    assert store.read_documents_registry() == []
