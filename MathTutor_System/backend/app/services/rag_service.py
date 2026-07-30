"""
RAG 本地知识库：ChromaDB 向量存储，Embedding 支持设置里所有服务商（与请求头 x-llm-* 一致）。
支持文档导入、列表、按来源删除与检索。列表/删除不依赖 API Key。
- 文档列表使用本地 JSON 注册表，不访问 ChromaDB，避免列表接口阻塞或导致连接重置。
- 存入时每个 chunk 带元数据：source, knowledge_point, type, chunk_index。
- 按来源删除/预览：where={"source": "文件名"}，预览按 chunk_index 排序拼回。
- 智能出题/组卷：知识点作 where 硬过滤，用固定描述性 query 匹配完整题目。
- AI 对话：知识点作 where 过滤，用用户问题作 query 匹配相关段落。
"""
import logging
from collections import Counter

from langchain_chroma import Chroma

from app.core.deps import LLMConfig
from app.services.rag_document_store import (
    COLLECTION_NAME,
    PERSIST_DIR,
    get_collection_only as _get_collection_only,
    rag_delete_by_source_no_auth,
    rag_get_chunks_by_source_no_auth,
    rag_list_documents_from_registry,
    rag_list_documents_no_auth,
    read_documents_registry as _read_documents_registry,
    registry_add as _registry_add,
    registry_remove as _registry_remove,
    write_documents_registry as _write_documents_registry,
)
from app.services.rag_embedding_factory import (
    EMBED_MODEL_BY_PROVIDER,
    create_embeddings as _create_embeddings,
    create_embeddings_from_config as _create_embeddings_from_config,
    get_embedding_key as _get_embedding_key,
    normalize_embed_base_url as _normalize_embed_base_url,
    use_deepseek_embedding as _use_deepseek_embedding,
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
# 智能出题/组卷时用的固定描述，用于向量匹配「完整题目」类 chunk，不把知识点当 query
QUERY_FOR_GENERATION = "题干清晰、包含标准答案和解析的完整数学题目"
# 知识点宽松匹配时，无 where 检索的候选条数
RELAXED_SEARCH_K = 15


class RAGService:
    """本地知识库：结构化切块、元数据、向量化存入 ChromaDB；支持按来源删/预览、按知识点硬过滤检索。"""

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
        knowledge_point: str = "",
        chunk_type: str = "题目",
        metadata: dict | None = None,
    ) -> None:
        """
        将长文本按题号/段落结构化切块后写入向量库，每个 chunk 带元数据。
        :param text: 纯文本内容
        :param source: 来源（如文件名），用于按来源删除/预览
        :param knowledge_point: 可选，知识点标签，用于检索时 where 硬过滤
        :param chunk_type: 可选，如 "题目" / "概念"，默认 "题目"
        :param metadata: 可选，额外键值会合并进每条 chunk 的 metadata（Chroma 仅支持 str/int/float/bool）
        """
        if not (text and text.strip()) or not (source and str(source).strip()):
            return
        source = str(source).strip()
        kp = (knowledge_point or "").strip()
        ct = (chunk_type or "题目").strip() or "题目"
        raw_chunks = split_into_structured_chunks(text.strip())
        chunks = [c for c in raw_chunks if _is_valid_chunk(c)]
        if not chunks:
            logger.warning("RAG: 过滤后无有效块 (source=%s, 原始块数=%d)", source, len(raw_chunks))
            return
        # 同 source 覆盖：先删再写，避免重复
        self.delete_by_source(source)
        base = dict(metadata or {})
        base["source"] = source
        base["knowledge_point"] = kp
        base["type"] = ct
        metadatas = [{**base, "chunk_index": i} for i in range(len(chunks))]
        self.vector_store.add_texts(texts=chunks, metadatas=metadatas)
        _registry_add(source, len(chunks), [kp] if kp else [])
        logger.info(
            "RAG: 已写入 %d 个文本块 (source=%s, knowledge_point=%s)",
            len(chunks), source, kp or "(未填)",
        )

    def search_context(self, query: str, n_results: int = DEFAULT_K) -> str:
        """
        兼容旧用法：仅按 query 检索，无 where。新逻辑请用 search_context_for_generation / search_context_for_chat。
        """
        if not (query and query.strip()):
            return ""
        try:
            docs = self.vector_store.similarity_search(query.strip(), k=n_results)
            return "\n\n".join(doc.page_content for doc in docs if doc.page_content)
        except Exception as e:
            logger.warning("RAG 检索异常: %s", e)
            return ""

    def _retrieve_with_relaxed_kp(
        self,
        query: str,
        knowledge_point: str | None,
        n_results: int,
    ) -> list[tuple[str, str]]:
        """
        先按知识点精确 where 检索；若不足 n_results 条，再无 where 召回更多并在内存中按知识点子串匹配补足。
        主检索使用混合策略：向量多召候选 + 关键词 RRF 重排，再取 top n。返回 [(content, source), ...]。
        """
        kp = (knowledge_point or "").strip()
        seen: set[str] = set()
        out: list[tuple[str, str]] = []

        def _source(doc: Any) -> str:
            return str((doc.metadata or {}).get("source") or "未知").strip() or "未知"

        def _to_out(docs: list[Any]) -> None:
            for doc in docs:
                if doc.page_content and doc.page_content not in seen:
                    seen.add(doc.page_content)
                    out.append((doc.page_content, _source(doc)))

        try:
            # 1) 主检索：多召候选 + RRF 重排（向量 + 关键词）
            k_fetch = min(HYBRID_CANDIDATES, n_results * 4)
            keyword_query = kp if kp else query
            if kp:
                docs_and_scores = self.vector_store.similarity_search_with_score(
                    query,
                    k=k_fetch,
                    filter={"knowledge_point": kp},
                )
            else:
                docs_and_scores = self.vector_store.similarity_search_with_score(
                    query,
                    k=k_fetch,
                )
            docs_only = [d for d, _ in docs_and_scores]
            if docs_and_scores and keyword_query.strip():
                reranked = _rrf_rerank(
                    [(d, i) for i, (d, _) in enumerate(docs_and_scores)],
                    keyword_query,
                    n_results,
                    get_content=lambda d: getattr(d, "page_content", None) or "",
                )
                _to_out(reranked)
            else:
                _to_out(docs_only[:n_results])

            if not kp:
                # 无知识点时只做一次检索，已 RRF 取够
                out_final = out[:n_results]
                sources = list(dict.fromkeys(s for _, s in out_final))
                logger.info(
                    "RAG 检索 query_len=%s kp=(无) n_requested=%s 返回=%s 来源=%s",
                    len(query), n_results, len(out_final), sources,
                )
                return out_final

            # 2) 不足时放宽：无 where 多召，再按知识点子串过滤
            if len(out) < n_results:
                extra = self.vector_store.similarity_search(
                    query,
                    k=min(RELAXED_SEARCH_K, n_results * 4),
                )
                for doc in extra:
                    if len(out) >= n_results:
                        break
                    if not doc.page_content or doc.page_content in seen:
                        continue
                    chunk_kp = (doc.metadata or {}).get("knowledge_point") or ""
                    if _knowledge_point_match(kp, chunk_kp):
                        seen.add(doc.page_content)
                        out.append((doc.page_content, _source(doc)))
        except Exception as e:
            logger.warning("RAG _retrieve_with_relaxed_kp 异常: %s", e)
        sources = list(dict.fromkeys(s for _, s in out))
        logger.info(
            "RAG 检索 query_len=%s kp=%s n_requested=%s 返回=%s 来源=%s",
            len(query), kp or "(无)", n_results, len(out), sources,
        )
        return out[:n_results]

    def _format_context_with_sources(self, items: list[tuple[str, str]]) -> tuple[str, list[str]]:
        """将 [(content, source), ...] 拼成带「来源」的上下文字符串，并返回去重后的来源列表。"""
        return format_context_with_sources(items)

    def search_context_for_generation(self, knowledge_point: str, n_results: int = DEFAULT_K) -> str:
        """
        智能出题/组卷用：用固定描述性 query 匹配「完整题目」类向量，知识点先精确再宽松匹配。
        返回的上下文中每段带【来源：文件名】，便于模型引用。
        """
        kp = (knowledge_point or "").strip()
        if not kp:
            return ""
        items = self._retrieve_with_relaxed_kp(QUERY_FOR_GENERATION, kp, n_results)
        context, _ = self._format_context_with_sources(items)
        return context

    def search_context_for_chat(
        self,
        user_message: str,
        knowledge_point: str | None = None,
        n_results: int = DEFAULT_K,
    ) -> str:
        """AI 对话用，仅返回带【来源】的上下文字符串。需要来源列表时用 search_context_for_chat_with_sources。"""
        msg = (user_message or "").strip()
        if not msg:
            return ""
        kp = (knowledge_point or "").strip() or None
        items = self._retrieve_with_relaxed_kp(msg, kp, n_results)
        context, _ = self._format_context_with_sources(items)
        return context

    def search_context_for_chat_with_sources(
        self,
        user_message: str,
        knowledge_point: str | None = None,
        n_results: int = DEFAULT_K,
    ) -> tuple[str, list[str]]:
        """
        AI 对话用：返回 (带【来源】的上下文字符串, 去重后的来源列表)。
        用于在响应中标注 rag_used / rag_sources。
        """
        msg = (user_message or "").strip()
        if not msg:
            return "", []
        kp = (knowledge_point or "").strip() or None
        items = self._retrieve_with_relaxed_kp(msg, kp, n_results)
        return self._format_context_with_sources(items)

    def list_documents(self) -> list[dict]:
        """
        列出知识库中按来源（source）聚合的文档信息。
        :return: [{"source": "文件名.pdf", "chunk_count": 10}, ...]
        """
        try:
            coll = getattr(self.vector_store, "_collection", None)
            if coll is None:
                return []
            data = coll.get(include=["metadatas"])
            metadatas = data.get("metadatas") or []
            sources = [str((m or {}).get("source") or "未知").strip() or "未知" for m in metadatas]
            counter = Counter(sources)
            return [{"source": name, "chunk_count": count} for name, count in counter.items()]
        except Exception as e:
            logger.warning("RAG list_documents 异常: %s", e)
            return []

    def delete_by_source(self, source: str) -> int:
        """
        按来源删除知识库中该文档对应的所有向量块。
        :param source: 文档来源（与上传时的 filename 一致）
        :return: 删除的块数量
        """
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
                logger.info("RAG 已按来源删除: %s, 共 %d 块", source, len(ids))
            return len(ids)
        except Exception as e:
            logger.warning("RAG delete_by_source 异常: %s", e)
            raise


# 无配置时的单例（仅用 .env 回退）
_rag_service: RAGService | None = None


def get_rag_service(llm_config: LLMConfig | None = None) -> RAGService:
    """
    获取 RAG 服务。若传入 llm_config（与「设置」中服务商一致），则用该配置创建 Embedding；
    否则使用单例（.env 回退）。上传/检索时建议传入请求头的配置以支持设置里所有服务商。
    """
    global _rag_service
    if llm_config is not None and (llm_config.api_key or "").strip():
        return RAGService(llm_config=llm_config)
    if _rag_service is None:
        _rag_service = RAGService()
    return _rag_service
