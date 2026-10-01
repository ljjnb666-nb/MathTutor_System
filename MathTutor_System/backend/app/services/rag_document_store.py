"""Document registry and no-auth ChromaDB operations for the local RAG store."""
from __future__ import annotations

import json
import logging
import threading
import uuid
from collections.abc import Callable
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from app.core.config import BASE_DIR

logger = logging.getLogger(__name__)

COLLECTION_NAME = "math_tutor_knowledge"
PERSIST_DIR = BASE_DIR / "data" / "vector_store"
REGISTRY_FILE = PERSIST_DIR / "documents_registry.json"
_REGISTRY_LOCK = threading.RLock()
_RAG_MUTATION_LOCK = threading.RLock()


class DocumentRegistryError(RuntimeError):
    pass


class RAGTenantPurgeError(RuntimeError):
    pass


@dataclass(frozen=True)
class RAGTenantPurgeResult:
    owner_user_id: int
    deleted_chunk_count: int
    removed_registry_count: int
    remaining_chunk_count: int
    remaining_registry_count: int


@contextmanager
def rag_mutation_guard():
    """Fence storage mutations in the current single-process deployment.

    This is reentrant for upload cleanup; it is not a distributed lock.
    """
    with _RAG_MUTATION_LOCK:
        yield


def validate_owner_user_id(owner_user_id: int) -> None:
    if type(owner_user_id) is not int or owner_user_id <= 0:
        raise ValueError("owner_user_id must be a positive integer.")


def _is_ownerless(owner) -> bool:
    return owner is None or (type(owner) is str and owner == "") or (type(owner) is int and owner == 0)


def _validate_registry(items) -> None:
    if not isinstance(items, list) or any(not isinstance(item, dict) for item in items):
        raise DocumentRegistryError("Document registry has an invalid documents structure.")
    for item in items:
        owner = item.get("owner_user_id")
        if not _is_ownerless(owner) and not (type(owner) is int and owner > 0):
            raise DocumentRegistryError("Document registry has invalid owner metadata.")


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
            logger.warning("ChromaDB PersistentClient fallback failed external_error_type=%s", type(first_error).__name__)
            raise first_error
    return client.get_or_create_collection(COLLECTION_NAME)


def read_documents_registry(registry_file: Path | None = None, *, strict: bool = False) -> list[dict]:
    """Read the local document registry without touching ChromaDB."""
    target = registry_file or REGISTRY_FILE
    try:
        try:
            raw = target.read_text(encoding="utf-8")
        except FileNotFoundError:
            return []
        data = json.loads(raw)
        items = data.get("documents") if isinstance(data, dict) else None
        _validate_registry(items)
        return list(items)
    except Exception as exc:
        if strict:
            raise DocumentRegistryError("Document registry is unavailable.") from exc
        logger.debug("read document registry failed: %s", exc)
        return []


def write_documents_registry(items: list[dict], registry_file: Path | None = None) -> None:
    """Atomically write the local document registry."""
    target = registry_file or REGISTRY_FILE
    with rag_mutation_guard(), _REGISTRY_LOCK:
        read_documents_registry(target, strict=True)
        _validate_registry(items)
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_name(f"{target.name}.{uuid.uuid4().hex}.tmp")
        try:
            tmp.write_text(json.dumps({"documents": items}, ensure_ascii=False, indent=2), encoding="utf-8")
            tmp.replace(target)
        finally:
            tmp.unlink(missing_ok=True)


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
    if owner_user_id is not None:
        validate_owner_user_id(owner_user_id)
    with rag_mutation_guard(), _REGISTRY_LOCK:
        items = read_documents_registry(strict=True)
        source_key = (source or "").strip()
        doc_id = (document_id or "").strip() or str(uuid.uuid4())
        if owner_user_id is None:
            items = [item for item in items if not (
                (item.get("source") or "").strip() == source_key and _is_ownerless(item.get("owner_user_id"))
            )]
        else:
            items = [
                item
                for item in items
                if not (
                    (item.get("source") or "").strip() == source_key
                    and item.get("owner_user_id") == owner_user_id
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
    """Remove a document (preferred) or source for one owner; None means ownerless only."""
    if owner_user_id is not None:
        validate_owner_user_id(owner_user_id)
    key = (source or "").strip()
    doc_id = (document_id or "").strip()
    if not key and not doc_id:
        return
    def matches(item):
        matches_owner = _is_ownerless(item.get("owner_user_id")) if owner_user_id is None else item.get("owner_user_id") == owner_user_id
        matches_key = (item.get("document_id") or "").strip() == doc_id if doc_id else (item.get("source") or "").strip() == key
        return matches_owner and matches_key

    _registry_remove_matching(matches)


def _registry_remove_matching(matches: Callable[[dict], bool]) -> int:
    with rag_mutation_guard(), _REGISTRY_LOCK:
        items = read_documents_registry(strict=True)
        preserved = [item for item in items if not matches(item)]
        removed = len(items) - len(preserved)
        if removed:
            write_documents_registry(preserved)
        return removed


def registry_remove_ownerless_source(source: str) -> int:
    key = (source or "").strip()
    return _registry_remove_matching(
        lambda item: bool(key)
        and _is_ownerless(item.get("owner_user_id"))
        and (item.get("source") or "").strip() == key
    )


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


def _matching_chunk_ids(coll, where: dict, matches: Callable[[dict], bool], *, ownerless_only: bool = False) -> list[str]:
    data = coll.get(where=where, include=["metadatas"])
    ids = data.get("ids")
    metadatas = data.get("metadatas")
    if not isinstance(ids, list) or not isinstance(metadatas, list) or len(ids) != len(metadatas):
        raise RAGTenantPurgeError("Chroma returned incomplete chunk metadata.")
    if any(not isinstance(row_id, str) or not row_id for row_id in ids) or len(set(ids)) != len(ids):
        raise RAGTenantPurgeError("Chroma returned invalid chunk IDs.")
    selected = []
    for row_id, meta in zip(ids, metadatas):
        if not isinstance(meta, dict):
            raise RAGTenantPurgeError("Chroma returned invalid chunk metadata.")
        if not matches(meta):
            raise RAGTenantPurgeError("Chroma returned metadata outside the requested scope.")
        if not ownerless_only or _is_ownerless(meta.get("owner_user_id")):
            selected.append(row_id)
    return selected


def _delete_and_verify(coll, where: dict, matches: Callable[[dict], bool], *, ownerless_only: bool = False) -> int:
    ids = _matching_chunk_ids(coll, where, matches, ownerless_only=ownerless_only)
    if ids:
        coll.delete(ids=ids)
    if _matching_chunk_ids(coll, where, matches, ownerless_only=ownerless_only):
        raise RAGTenantPurgeError("Chroma deletion did not empty the requested scope.")
    return len(ids)


def _delete_storage_scope(
    where: dict, matches: Callable[[dict], bool], *, collection=None, ownerless_only: bool = False,
) -> tuple[int, int]:
    """Chroma first, then registry, with verification and retry convergence."""
    with rag_mutation_guard(), _REGISTRY_LOCK:
        items = read_documents_registry(strict=True)
        def registry_matches(item):
            return matches(item) and (not ownerless_only or _is_ownerless(item.get("owner_user_id")))
        preserved = [item for item in items if not registry_matches(item)]
        removed = len(items) - len(preserved)
        coll = collection if collection is not None else get_collection_only()
        deleted = _delete_and_verify(coll, where, matches, ownerless_only=ownerless_only)
        if removed:
            write_documents_registry(preserved)
        if any(registry_matches(item) for item in read_documents_registry(strict=True)):
            raise RAGTenantPurgeError("Registry deletion did not empty the requested scope.")
        if _matching_chunk_ids(coll, where, matches, ownerless_only=ownerless_only):
            raise RAGTenantPurgeError("Chroma scope is nonempty after registry cleanup.")
        return deleted, removed


def rag_purge_owner(owner_user_id: int) -> RAGTenantPurgeResult:
    """Purge only this numeric owner, without embeddings or account lifecycle changes.

    PHASE_2B_5D_MUST_CLOSE: SQL deletion must wait for verified RAG purge,
    and fence in-flight uploads to prevent numeric User.id reuse leaking data.
    """
    validate_owner_user_id(owner_user_id)
    def matches(meta):
        return type(meta.get("owner_user_id")) is int and meta["owner_user_id"] == owner_user_id

    deleted, removed = _delete_storage_scope(_owned_where(owner_user_id), matches)
    return RAGTenantPurgeResult(owner_user_id, deleted, removed, 0, 0)


def rag_delete_document(owner_user_id: int, document_id: str) -> int:
    """Delete and verify an owned document, including registry-only remnants."""
    validate_owner_user_id(owner_user_id)
    doc_id = (document_id or "").strip()
    if not doc_id:
        return 0
    def matches(meta):
        return (
            type(meta.get("owner_user_id")) is int
            and meta["owner_user_id"] == owner_user_id
            and meta.get("document_id") == doc_id
        )

    deleted, _ = _delete_storage_scope(_owned_where(owner_user_id, document_id=doc_id), matches)
    return deleted


def rag_delete_owned_by_source(owner_user_id: int, source: str) -> int:
    validate_owner_user_id(owner_user_id)
    source_key = (source or "").strip()
    if not source_key:
        return 0
    def matches(meta):
        return (
            type(meta.get("owner_user_id")) is int
            and meta["owner_user_id"] == owner_user_id
            and meta.get("source") == source_key
        )

    deleted, _ = _delete_storage_scope(_owned_where(owner_user_id, source=source_key), matches)
    return deleted


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
        logger.warning("rag_list_documents_no_auth failed external_error_type=%s", type(exc).__name__)
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
    """Legacy ownerless-only mutation; never delete owned tenant data."""
    if not (source and str(source).strip()):
        return 0
    return rag_delete_ownerless_source(source.strip())


def rag_delete_ownerless_source(source: str, *, collection=None) -> int:
    """Shared storage implementation for low-level and service legacy deletion."""
    source_key = (source or "").strip()
    if not source_key:
        return 0
    deleted, _ = _delete_storage_scope(
        {"source": source_key}, lambda meta: meta.get("source") == source_key,
        collection=collection, ownerless_only=True,
    )
    return deleted
