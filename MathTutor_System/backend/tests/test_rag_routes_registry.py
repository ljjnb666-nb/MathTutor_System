import shutil
from pathlib import Path

from fastapi import HTTPException

from app.api.endpoints import rag as rag_routes
from app.models.user import User
from app.services import rag_document_store as store

TEST_TMP_DIR = Path(__file__).resolve().parent / ".tmp_rag_routes"


class FakeCollection:
    def __init__(self):
        self.deleted_ids = []

    def get(self, where=None, include=None):
        where = where or {}
        clauses = where.get("$and") if "$and" in where else [where]
        merged = {}
        for clause in clauses:
            merged.update(clause or {})
        if merged.get("document_id") == "doc-a" and merged.get("owner_user_id") == 1:
            return {
                "ids": ["doc-a:0", "doc-a:1"],
                "documents": ["chunk a", "chunk b"],
                "metadatas": [
                    {"owner_user_id": 1, "document_id": "doc-a", "chunk_index": 1},
                    {"owner_user_id": 1, "document_id": "doc-a", "chunk_index": 0},
                ],
            }
        return {"ids": [], "documents": [], "metadatas": []}

    def delete(self, ids):
        self.deleted_ids.extend(ids)


def _registry_path(name: str, request) -> Path:
    TEST_TMP_DIR.mkdir(exist_ok=True)
    request.addfinalizer(lambda: shutil.rmtree(TEST_TMP_DIR, ignore_errors=True))
    return TEST_TMP_DIR / name


def _patch_route_auth(monkeypatch):
    monkeypatch.setattr(rag_routes, "_require_rag", lambda current_user, db: None)


def test_rag_list_uses_registry_without_embedding_service(monkeypatch, request):
    registry = _registry_path("documents.json", request)
    monkeypatch.setattr(store, "REGISTRY_FILE", registry)
    monkeypatch.setattr(rag_routes, "get_rag_service", lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("embedding initialized")))
    _patch_route_auth(monkeypatch)
    store.write_documents_registry(
        [
            {"document_id": "doc-a", "owner_user_id": 1, "source": "same.pdf", "chunk_count": 2, "knowledge_points": ["a"]},
            {"document_id": "doc-b", "owner_user_id": 2, "source": "same.pdf", "chunk_count": 1, "knowledge_points": ["b"]},
            {"source": "legacy.pdf", "chunk_count": 1, "knowledge_points": ["legacy"]},
        ]
    )

    result = rag_routes.rag_list_documents(db=None, current_user=User(id=1, username="teacher-a"))

    assert result == {
        "documents": [
            {"document_id": "doc-a", "owner_user_id": 1, "source": "same.pdf", "chunk_count": 2, "knowledge_points": ["a"]}
        ]
    }


def test_rag_list_missing_registry_returns_empty_list(monkeypatch, request):
    registry = _registry_path("missing.json", request)
    monkeypatch.setattr(store, "REGISTRY_FILE", registry)
    _patch_route_auth(monkeypatch)

    assert rag_routes.rag_list_documents(db=None, current_user=User(id=1, username="teacher-a")) == {"documents": []}


def test_rag_list_corrupt_registry_returns_safe_500(monkeypatch, request):
    registry = _registry_path("corrupt.json", request)
    registry.write_text("{", encoding="utf-8")
    monkeypatch.setattr(store, "REGISTRY_FILE", registry)
    _patch_route_auth(monkeypatch)

    try:
        rag_routes.rag_list_documents(db=None, current_user=User(id=1, username="teacher-a"))
    except HTTPException as exc:
        assert exc.status_code == 500
        assert exc.detail == "Document registry is unavailable"
    else:
        raise AssertionError("expected HTTPException")


def test_rag_preview_and_delete_use_document_id_without_embedding(monkeypatch, request):
    registry = _registry_path("preview_delete.json", request)
    collection = FakeCollection()
    monkeypatch.setattr(store, "REGISTRY_FILE", registry)
    monkeypatch.setattr(store, "get_collection_only", lambda: collection)
    _patch_route_auth(monkeypatch)
    user = User(id=1, username="teacher-a")

    import asyncio

    preview_result = asyncio.run(rag_routes.rag_get_document_chunks(document_id="doc-a", db=None, current_user=user))
    assert preview_result == {"document_id": "doc-a", "chunks": ["chunk b", "chunk a"]}

    delete_result = asyncio.run(rag_routes.rag_delete_document(source="doc-a", db=None, current_user=user))
    assert delete_result == {"message": "Deleted", "document_id": "doc-a", "chunk_count": 2}
    assert collection.deleted_ids == ["doc-a:0", "doc-a:1"]
