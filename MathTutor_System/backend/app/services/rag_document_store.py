"""Document registry and no-auth ChromaDB operations for the local RAG store."""
import json
import logging
from pathlib import Path

from app.core.config import BASE_DIR

logger = logging.getLogger(__name__)

COLLECTION_NAME = "math_tutor_knowledge"
PERSIST_DIR = BASE_DIR / "data" / "vector_store"
REGISTRY_FILE = PERSIST_DIR / "documents_registry.json"


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
            logger.warning("ChromaDB PersistentClient(path) 回退失败: %s", first_error)
            raise first_error
    return client.get_or_create_collection(COLLECTION_NAME)


def read_documents_registry(registry_file: Path | None = None) -> list[dict]:
    """Read the local document registry without touching ChromaDB."""
    target = registry_file or REGISTRY_FILE
    try:
        if not target.exists():
            return []
        raw = target.read_text(encoding="utf-8")
        data = json.loads(raw)
        items = data.get("documents")
        return list(items) if isinstance(items, list) else []
    except Exception as exc:
        logger.debug("读取文档注册表失败: %s", exc)
        return []


def write_documents_registry(items: list[dict], registry_file: Path | None = None) -> None:
    """Atomically write the local document registry."""
    target = registry_file or REGISTRY_FILE
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_suffix(".tmp")
        tmp.write_text(
            json.dumps({"documents": items}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        tmp.replace(target)
    except Exception as exc:
        logger.warning("写入文档注册表失败: %s", exc)


def registry_add(source: str, chunk_count: int, knowledge_points: list[str]) -> None:
    """Add or replace one document entry in the registry."""
    items = read_documents_registry()
    source_key = (source or "").strip()
    items = [item for item in items if (item.get("source") or "").strip() != source_key]
    items.append(
        {
            "source": source_key,
            "chunk_count": chunk_count,
            "knowledge_points": sorted(set(k for k in (knowledge_points or []) if (k or "").strip())),
        }
    )
    write_documents_registry(items)


def registry_remove(source: str) -> None:
    """Remove one source from the registry."""
    key = (source or "").strip()
    if not key:
        return
    items = [item for item in read_documents_registry() if (item.get("source") or "").strip() != key]
    write_documents_registry(items)


def rag_list_documents_from_registry() -> list[dict]:
    """
    Read the local JSON registry only. This avoids ChromaDB access for fast,
    stable document lists.
    """
    return read_documents_registry()


def rag_list_documents_no_auth() -> list[dict]:
    """
    List documents in ChromaDB without initializing the RAG service or API key.
    Return [] on ChromaDB path/init failures to avoid endpoint 500s.
    """
    try:
        coll = get_collection_only()
        data = coll.get(include=["metadatas"])
        metadatas = data.get("metadatas") or []
        by_source: dict[str, tuple[int, set[str]]] = {}
        for metadata in metadatas:
            meta = metadata or {}
            source = str(meta.get("source") or "未知").strip() or "未知"
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
        logger.warning("rag_list_documents_no_auth 失败（返回空列表）: %s", exc)
        return []


def rag_get_chunks_by_source_no_auth(source: str) -> list[str]:
    """Get source chunks ordered by chunk_index without initializing embeddings."""
    if not (source and str(source).strip()):
        return []
    try:
        coll = get_collection_only()
        data = coll.get(
            where={"source": source.strip()},
            include=["documents", "metadatas"],
        )
        docs = data.get("documents") or []
        metadatas = data.get("metadatas") or []
        indexed = [
            ((metadata or {}).get("chunk_index", 999999), str(doc).strip() if doc else "")
            for metadata, doc in zip(metadatas, docs)
        ]
        indexed.sort(key=lambda item: (item[0], item[1]))
        return [text for _, text in indexed if text]
    except Exception as exc:
        logger.debug("rag_get_chunks_by_source_no_auth: %s", exc)
        return []


def rag_delete_by_source_no_auth(source: str) -> int:
    """Delete all chunks for a source without initializing embeddings."""
    if not (source and str(source).strip()):
        return 0
    try:
        coll = get_collection_only()
        data = coll.get(where={"source": source.strip()}, include=[])
        ids = data.get("ids") or []
        if ids:
            coll.delete(ids=ids)
            registry_remove(source.strip())
            logger.info("RAG 已按来源删除: %s, 共 %d 块", source, len(ids))
        return len(ids)
    except Exception as exc:
        logger.warning("RAG delete_by_source 异常: %s", exc)
        raise
