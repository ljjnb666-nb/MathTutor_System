"""Local RAG service backed by ChromaDB and an owner-scoped document registry."""
import logging
from collections import Counter
from datetime import UTC, datetime
from typing import Any

from langchain_chroma import Chroma

from app.core.deps import LLMConfig
from app.services.rag_document_store import (
    COLLECTION_NAME,
    PERSIST_DIR,
    rag_delete_by_source_no_auth,
    rag_delete_document,
    rag_delete_owned_by_source,
    rag_get_chunks,
    rag_get_chunks_by_source_no_auth,
    rag_list_documents,
    rag_list_documents_from_registry,
    rag_list_documents_no_auth,
    registry_add as _registry_add,
)
from app.services.rag_embedding_factory import (
    create_embeddings as _create_embeddings,
    create_embeddings_from_config as _create_embeddings_from_config,
)
from app.services.rag_text_utils import (
    HYBRID_CANDIDATES,
    format_context_with_sources,
    is_valid_chunk as _is_valid_chunk,
    knowledge_point_match as _knowledge_point_match,
    rrf_rerank as _rrf_rerank,
    split_into_structured_chunks,
)

logger = logging.getLogger(__name__)

DEFAULT_K = 3
QUERY_FOR_GENERATION = "clear complete math questions with answer and analysis"
RELAXED_SEARCH_K = 15


class RAGService:
    def __init__(self, llm_config: LLMConfig | None = None) -> None:
        if llm_config is not None and (llm_config.api_key or "").strip():
            self.embeddings = _create_embeddings_from_config(
                llm_config.provider,
                llm_config.api_key,
                llm_config.base_url,
                llm_config.model,
            )
        else:
            self.embeddings = _create_embeddings()
        PERSIST_DIR.mkdir(parents=True, exist_ok=True)
        self.vector_store = Chroma(
            collection_name=COLLECTION_NAME,
            embedding_function=self.embeddings,
            persist_directory=str(PERSIST_DIR),
        )

    def add_document(
        self,
        text: str,
        source: str,
        *,
        owner_user_id: int | None = None,
        document_id: str | None = None,
        knowledge_point: str = "",
        chunk_type: str = "题目",
        metadata: dict | None = None,
    ) -> str | None:
        if not (text and text.strip()) or not (source and str(source).strip()):
            return None
        source = str(source).strip()
        kp = (knowledge_point or "").strip()
        ct = (chunk_type or "题目").strip() or "题目"
        doc_id = (document_id or "").strip()
        raw_chunks = split_into_structured_chunks(text.strip())
        chunks = [chunk for chunk in raw_chunks if _is_valid_chunk(chunk)]
        if not chunks:
            logger.warning("RAG: no valid chunks after filtering source=%s", source)
            return None

        old_document_ids = []
        if owner_user_id is not None:
            old_document_ids = [
                item.get("document_id") or ""
                for item in rag_list_documents(owner_user_id)
                if (item.get("source") or "").strip() == source
            ]
        else:
            self.delete_by_source(source)

        if not doc_id:
            import uuid

            doc_id = str(uuid.uuid4())
        base = dict(metadata or {})
        base.update(
            {
                "document_id": doc_id,
                "source": source,
                "knowledge_point": kp,
                "chunk_type": ct,
                "type": ct,
            }
        )
        if owner_user_id is not None:
            base["owner_user_id"] = int(owner_user_id)
        metadatas = [{**base, "chunk_index": index} for index in range(len(chunks))]
        ids = [f"{doc_id}:{index}" for index in range(len(chunks))]
        try:
            self.vector_store.add_texts(texts=chunks, metadatas=metadatas, ids=ids)
            if owner_user_id is not None:
                _registry_add(
                    source,
                    len(chunks),
                    [kp] if kp else [],
                    owner_user_id=owner_user_id,
                    document_id=doc_id,
                    knowledge_point=kp,
                    chunk_type=ct,
                    created_at=datetime.now(UTC).isoformat(),
                )
                for old_id in old_document_ids:
                    if old_id and old_id != doc_id:
                        try:
                            self.delete_document(owner_user_id, old_id)
                        except Exception as exc:
                            logger.warning("RAG: old document cleanup failed source=%s old_document_id=%s: %s", source, old_id, exc)
            else:
                _registry_add(source, len(chunks), [kp] if kp else [])
        except Exception:
            if owner_user_id is not None:
                self._delete_document_chunks_only(owner_user_id, doc_id)
            raise
        logger.info("RAG: wrote %d chunks source=%s owner=%s", len(chunks), source, owner_user_id)
        return doc_id

    def search_context(self, query: str, n_results: int = DEFAULT_K) -> str:
        if not (query and query.strip()):
            return ""
        try:
            docs = self.vector_store.similarity_search(query.strip(), k=n_results)
            return "\n\n".join(doc.page_content for doc in docs if doc.page_content)
        except Exception as exc:
            logger.warning("RAG search failed: %s", exc)
            return ""

    def _retrieve_with_relaxed_kp(
        self,
        query: str,
        knowledge_point: str | None,
        n_results: int,
        *,
        owner_user_id: int | None = None,
    ) -> list[tuple[str, str]]:
        kp = (knowledge_point or "").strip()
        seen: set[str] = set()
        out: list[tuple[str, str]] = []

        def source_of(doc: Any) -> str:
            return str((doc.metadata or {}).get("source") or "unknown").strip() or "unknown"

        def is_owned(doc: Any) -> bool:
            if owner_user_id is None:
                return True
            return int((doc.metadata or {}).get("owner_user_id") or -1) == int(owner_user_id)

        def add_docs(docs: list[Any]) -> None:
            for doc in docs:
                if not is_owned(doc):
                    continue
                if doc.page_content and doc.page_content not in seen:
                    seen.add(doc.page_content)
                    out.append((doc.page_content, source_of(doc)))

        try:
            k_fetch = min(HYBRID_CANDIDATES, n_results * 4)
            keyword_query = kp or query
            base_filter = _owner_filter(owner_user_id, kp)
            if kp:
                docs_and_scores = self.vector_store.similarity_search_with_score(
                    query,
                    k=k_fetch,
                    filter=base_filter,
                )
            else:
                docs_and_scores = self.vector_store.similarity_search_with_score(query, k=k_fetch, filter=base_filter)
            if docs_and_scores and keyword_query.strip():
                reranked = _rrf_rerank(
                    [(doc, index) for index, (doc, _) in enumerate(docs_and_scores)],
                    keyword_query,
                    n_results,
                    get_content=lambda doc: getattr(doc, "page_content", None) or "",
                )
                add_docs(reranked)
            else:
                add_docs([doc for doc, _ in docs_and_scores][:n_results])

            if kp and len(out) < n_results:
                relaxed_filter = _owner_filter(owner_user_id, None)
                for doc in self.vector_store.similarity_search(
                    query,
                    k=min(RELAXED_SEARCH_K, n_results * 4),
                    filter=relaxed_filter,
                ):
                    if len(out) >= n_results:
                        break
                    if not is_owned(doc) or not doc.page_content or doc.page_content in seen:
                        continue
                    chunk_kp = (doc.metadata or {}).get("knowledge_point") or ""
                    if _knowledge_point_match(kp, chunk_kp):
                        seen.add(doc.page_content)
                        out.append((doc.page_content, source_of(doc)))
        except Exception as exc:
            logger.warning("RAG retrieve failed: %s", exc)
        return out[:n_results]

    def _format_context_with_sources(self, items: list[tuple[str, str]]) -> tuple[str, list[str]]:
        return format_context_with_sources(items)

    def search_context_for_generation(self, knowledge_point: str, n_results: int = DEFAULT_K) -> str:
        kp = (knowledge_point or "").strip()
        if not kp:
            return ""
        context, _ = self._format_context_with_sources(
            self._retrieve_with_relaxed_kp(QUERY_FOR_GENERATION, kp, n_results)
        )
        return context

    def search_context_for_generation_owned(
        self,
        owner_user_id: int,
        knowledge_point: str,
        n_results: int = DEFAULT_K,
    ) -> str:
        kp = (knowledge_point or "").strip()
        if not kp:
            return ""
        context, _ = self._format_context_with_sources(
            self._retrieve_with_relaxed_kp(QUERY_FOR_GENERATION, kp, n_results, owner_user_id=owner_user_id)
        )
        return context

    def search_context_for_chat(
        self,
        user_message: str,
        knowledge_point: str | None = None,
        n_results: int = DEFAULT_K,
    ) -> str:
        context, _ = self.search_context_for_chat_with_sources(user_message, knowledge_point, n_results)
        return context

    def search_context_for_chat_with_sources(
        self,
        user_message: str,
        knowledge_point: str | None = None,
        n_results: int = DEFAULT_K,
    ) -> tuple[str, list[str]]:
        msg = (user_message or "").strip()
        if not msg:
            return "", []
        kp = (knowledge_point or "").strip() or None
        return self._format_context_with_sources(self._retrieve_with_relaxed_kp(msg, kp, n_results))

    def search_context_for_chat_with_sources_owned(
        self,
        owner_user_id: int,
        user_message: str,
        knowledge_point: str | None = None,
        n_results: int = DEFAULT_K,
    ) -> tuple[str, list[str]]:
        msg = (user_message or "").strip()
        if not msg:
            return "", []
        kp = (knowledge_point or "").strip() or None
        return self._format_context_with_sources(
            self._retrieve_with_relaxed_kp(msg, kp, n_results, owner_user_id=owner_user_id)
        )

    def list_documents(self) -> list[dict]:
        try:
            coll = getattr(self.vector_store, "_collection", None)
            if coll is None:
                return []
            data = coll.get(include=["metadatas"])
            sources = [str((meta or {}).get("source") or "unknown").strip() or "unknown" for meta in data.get("metadatas") or []]
            return [{"source": name, "chunk_count": count} for name, count in Counter(sources).items()]
        except Exception as exc:
            logger.warning("RAG list_documents failed: %s", exc)
            return []

    def list_owned_documents(self, owner_user_id: int) -> list[dict]:
        return rag_list_documents(owner_user_id)

    def get_owned_chunks(self, owner_user_id: int, document_id: str) -> list[str]:
        return rag_get_chunks(owner_user_id, document_id)

    def delete_document(self, owner_user_id: int, document_id: str) -> int:
        return rag_delete_document(owner_user_id, document_id)

    def delete_owned_by_source(self, owner_user_id: int, source: str) -> int:
        return rag_delete_owned_by_source(owner_user_id, source)

    def _delete_document_chunks_only(self, owner_user_id: int, document_id: str) -> int:
        try:
            coll = getattr(self.vector_store, "_collection", None)
            if coll is None:
                return 0
            data = coll.get(
                where={"$and": [{"owner_user_id": int(owner_user_id)}, {"document_id": document_id}]},
                include=["metadatas"],
            )
            ids = data.get("ids") or []
            if ids:
                coll.delete(ids=ids)
            return len(ids)
        except Exception as exc:
            logger.warning("RAG temporary document cleanup failed: %s", exc)
            return 0

    def delete_by_source(self, source: str) -> int:
        if not (source and str(source).strip()):
            return 0
        try:
            coll = getattr(self.vector_store, "_collection", None)
            if coll is None:
                return 0
            data = coll.get(where={"source": source.strip()}, include=[])
            ids = data.get("ids") or []
            if ids:
                coll.delete(ids=ids)
            return len(ids)
        except Exception as exc:
            logger.warning("RAG delete_by_source failed: %s", exc)
            raise


_rag_service: RAGService | None = None


def _owner_filter(owner_user_id: int | None, knowledge_point: str | None) -> dict | None:
    clauses = []
    if owner_user_id is not None:
        clauses.append({"owner_user_id": int(owner_user_id)})
    kp = (knowledge_point or "").strip()
    if kp:
        clauses.append({"knowledge_point": kp})
    if not clauses:
        return None
    return clauses[0] if len(clauses) == 1 else {"$and": clauses}


def get_rag_service(llm_config: LLMConfig | None = None) -> RAGService:
    global _rag_service
    if llm_config is not None and (llm_config.api_key or "").strip():
        return RAGService(llm_config=llm_config)
    if _rag_service is None:
        _rag_service = RAGService()
    return _rag_service
