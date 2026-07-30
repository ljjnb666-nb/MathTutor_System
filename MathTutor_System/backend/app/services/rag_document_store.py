"""Document registry and no-auth ChromaDB operations for the local RAG store."""
from __future__ import annotations

import json
import logging
import threading
import uuid
from pathlib import Path

from app.core.config import BASE_DIR

logger = logging.getLogger(__name__)

COLLECTION_NAME = "math_tutor_knowledge"
PERSIST_DIR = BASE_DIR / "data" / "vector_store"
REGISTRY_FILE = PERSIST_DIR / "documents_registry.json"
_REGISTRY_LOCK = threading.RLock()


class DocumentRegistryError(RuntimeError):
    pass


def get_collection_only():
    """Get the Chroma collection without initializing embeddings."""
    import chromadb

    PERSIST_DIR.mkdir(parents=True, exist_ok=True)
    path_str = str(PERSIST_DIR)
    try:
        from chromadb.config import DEFAULT_DATABASE, DEFAULT_TENANT, Settings  # noqa: F401

        client = chromadb.PersistentClient(
            path=path_str,
            settings=Settings(),
            tenant=DEFAULT_TENANT,
            database=DEFAULT_DATABASE,
        )
    except Exception as first_error:
        try:
            client = chromadb.PersistentClient(path=path_str)
        except Exception:
            logger.warning("ChromaDB PersistentClient(path) fallback failed: %s", first_error)
            raise first_error
    return client.get_or_create_collection(COLLECTION_NAME)


def read_documents_registry(registry_file: Path | None = None, *, strict: bool = False) -> list[dict]:
    """Read the local document registry without touching ChromaDB."""
    target = registry_file or REGISTRY_FILE
    try:
        if not target.exists():
            return []
        data = json.loads(target.read_text(encoding="utf-8"))
        items = data.get("documents")
        return list(items) if isinstance(items, list) else []
    except Exception as exc:
        if strict:
            raise DocumentRegistryError("Document registry is unavailable.") from exc
        logger.debug("read document registry failed: %s", exc)
        return []


def write_documents_registry(items: list[dict], registry_file: Path | None = None) -> None:
    """Atomically write the local document registry."""
    target = registry_file or REGISTRY_FILE
    with _REGISTRY_LOCK:
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_name(f"{target.name}.{uuid.uuid4().hex}.tmp")
        tmp.write_text(json.dumps({"documents": items}, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(target)


def registry_add(
    source: str,
    chunk_count: int,
    knowledge_points: list[str],
    *,
    owner_user_id: int | None = None,
    document_id: str | None = None,
    knowledge_point: str = "",
    chunk_type: str = "",
    created_at: str = "",
) -> str:
    """Add or replace one document entry in the registry."""
    with _REGISTRY_LOCK:
        items = read_documents_registry()
        source_key = (source or "").strip()
        doc_id = (document_id or "").strip() or str(uuid.uuid4())
        if owner_user_id is None:
            items = [item for item in items if (item.get("source") or "").strip() != source_key]
        else:
            items = [
                item
                for item in items
                if not (
                    (item.get("source") or "").strip() == source_key
                    and int(item.get("owner_user_id") or -1) == int(owner_user_id)
                )
            ]
        clean_points = sorted(set(k.strip() for k in (knowledge_points or []) if (k or "").strip()))
        if owner_user_id is None:
            items.append({"source": source_key, "chunk_count": chunk_count, "knowledge_points": clean_points})
        else:
            items.append(
                {
                    "document_id": doc_id,
                    "owner_user_id": int(owner_user_id),
                    "source": source_key,
                    "knowledge_point": knowledge_point,
                    "chunk_type": chunk_type,
                    "created_at": created_at,
                    "chunk_count": chunk_count,
                    "knowledge_points": clean_points,
                }
            )
        write_documents_registry(items)
        return doc_id


def registry_remove(source: str, *, owner_user_id: int | None = None, document_id: str | None = None) -> None:
    """Remove one source or document id from the registry."""
    key = (source or "").strip()
    doc_id = (document_id or "").strip()
    if not key and not doc_id:
        return
    with _REGISTRY_LOCK:
        items = []
        for item in read_documents_registry():
            item_owner = item.get("owner_user_id")
            item_source = (item.get("source") or "").strip()
            item_doc_id = (item.get("document_id") or "").strip()
            matches_owner = owner_user_id is None or int(item_owner or -1) == int(owner_user_id)
            matches_source = bool(key) and item_source == key
            matches_doc_id = bool(doc_id) and item_doc_id == doc_id
            if matches_owner and (matches_doc_id or matches_source):
                continue
            items.append(item)
        write_documents_registry(items)


def rag_list_documents_from_registry() -> list[dict]:
    return read_documents_registry()


def rag_list_documents(owner_user_id: int) -> list[dict]:
    return [item for item in read_documents_registry(strict=True) if int(item.get("owner_user_id") or -1) == int(owner_user_id)]


def _owned_where(owner_user_id: int, document_id: str | None = None, source: str | None = None) -> dict:
    clauses: list[dict] = [{"owner_user_id": int(owner_user_id)}]
    if document_id:
        clauses.append({"document_id": document_id})
    if source:
        clauses.append({"source": source})
    return clauses[0] if len(clauses) == 1 else {"$and": clauses}


def rag_get_chunks(owner_user_id: int, document_id: str) -> list[str]:
    """Get chunks for one owned document by document_id."""
    doc_id = (document_id or "").strip()
    if not doc_id:
        return []
    try:
        coll = get_collection_only()
        data = coll.get(where=_owned_where(owner_user_id, document_id=doc_id), include=["documents", "metadatas"])
        docs = data.get("documents") or []
        metadatas = data.get("metadatas") or []
        indexed = []
        for metadata, doc in zip(metadatas, docs):
            meta = metadata or {}
            if int(meta.get("owner_user_id") or -1) != int(owner_user_id):
                continue
            indexed.append((meta.get("chunk_index", 999999), str(doc).strip() if doc else ""))
        indexed.sort(key=lambda item: (item[0], item[1]))
        return [text for _, text in indexed if text]
    except Exception as exc:
        logger.debug("rag_get_chunks failed: %s", exc)
        return []


def rag_delete_document(owner_user_id: int, document_id: str) -> int:
    """Delete one owned document by document_id."""
    doc_id = (document_id or "").strip()
    if not doc_id:
        return 0
    try:
        coll = get_collection_only()
        data = coll.get(where=_owned_where(owner_user_id, document_id=doc_id), include=["metadatas"])
        ids = data.get("ids") or []
        metadatas = data.get("metadatas") or []
        owned_ids = [
            row_id
            for row_id, metadata in zip(ids, metadatas)
            if int((metadata or {}).get("owner_user_id") or -1) == int(owner_user_id)
        ]
        if owned_ids:
            coll.delete(ids=owned_ids)
            registry_remove("", owner_user_id=owner_user_id, document_id=doc_id)
        return len(owned_ids)
    except Exception as exc:
        logger.warning("RAG delete_document failed: %s", exc)
        raise


def rag_delete_owned_by_source(owner_user_id: int, source: str) -> int:
    source_key = (source or "").strip()
    if not source_key:
        return 0
    coll = get_collection_only()
    data = coll.get(where=_owned_where(owner_user_id, source=source_key), include=["metadatas"])
    ids = data.get("ids") or []
    if ids:
        coll.delete(ids=ids)
    return len(ids)


def rag_list_documents_no_auth() -> list[dict]:
    """Legacy no-auth list for tests and migration tooling only."""
    try:
        coll = get_collection_only()
        data = coll.get(include=["metadatas"])
        metadatas = data.get("metadatas") or []
        by_source: dict[str, tuple[int, set[str]]] = {}
        for metadata in metadatas:
            meta = metadata or {}
            source = str(meta.get("source") or "unknown").strip() or "unknown"
            knowledge_point = str(meta.get("knowledge_point") or "").strip()
            if source not in by_source:
                by_source[source] = (0, set())
            count, knowledge_points = by_source[source]
            by_source[source] = (count + 1, knowledge_points)
            if knowledge_point:
                knowledge_points.add(knowledge_point)
        return [
            {"source": name, "chunk_count": count, "knowledge_points": sorted(knowledge_points)}
            for name, (count, knowledge_points) in by_source.items()
        ]
    except BaseException as exc:
        logger.warning("rag_list_documents_no_auth failed: %s", exc)
        return []


def rag_get_chunks_by_source_no_auth(source: str) -> list[str]:
    """Legacy no-auth source preview for tests and migration tooling only."""
    if not (source and str(source).strip()):
        return []
    try:
        coll = get_collection_only()
        data = coll.get(where={"source": source.strip()}, include=["documents", "metadatas"])
        docs = data.get("documents") or []
        metadatas = data.get("metadatas") or []
        indexed = [
            ((metadata or {}).get("chunk_index", 999999), str(doc).strip() if doc else "")
            for metadata, doc in zip(metadatas, docs)
        ]
        indexed.sort(key=lambda item: (item[0], item[1]))
        return [text for _, text in indexed if text]
    except Exception as exc:
        logger.debug("rag_get_chunks_by_source_no_auth failed: %s", exc)
        return []


def rag_delete_by_source_no_auth(source: str) -> int:
    """Legacy no-auth delete by source. Do not expose through user APIs."""
    if not (source and str(source).strip()):
        return 0
    try:
        coll = get_collection_only()
        data = coll.get(where={"source": source.strip()}, include=[])
        ids = data.get("ids") or []
        if ids:
            coll.delete(ids=ids)
            registry_remove(source.strip())
        return len(ids)
    except Exception as exc:
        logger.warning("RAG delete_by_source failed: %s", exc)
        raise
