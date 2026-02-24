"""
RAG 本地知识库：ChromaDB 向量存储，Embedding 支持设置里所有服务商（与请求头 x-llm-* 一致）。
支持文档导入、列表、按来源删除与检索。列表/删除不依赖 API Key。
- 文档列表使用本地 JSON 注册表，不访问 ChromaDB，避免列表接口阻塞或导致连接重置。
- 存入时每个 chunk 带元数据：source, knowledge_point, type, chunk_index。
- 按来源删除/预览：where={"source": "文件名"}，预览按 chunk_index 排序拼回。
- 智能出题/组卷：知识点作 where 硬过滤，用固定描述性 query 匹配完整题目。
- AI 对话：知识点作 where 过滤，用用户问题作 query 匹配相关段落。
"""
import json
import logging
import os
import re
from collections import Counter
from pathlib import Path
from typing import Any

import chromadb
from langchain_chroma import Chroma
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_openai import OpenAIEmbeddings

from app.core.config import (
    AI_REQUEST_TIMEOUT,
    BASE_DIR,
    DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL,
    DEEPSEEK_EMBED_MODEL,
    LLM_API_KEY,
    LLM_BASE_URL,
    LLM_PROVIDER,
)
from app.core.deps import LLMConfig

logger = logging.getLogger(__name__)

COLLECTION_NAME = "math_tutor_knowledge"
PERSIST_DIR = BASE_DIR / "data" / "vector_store"
REGISTRY_FILE = PERSIST_DIR / "documents_registry.json"
DEFAULT_K = 3
# 智能出题/组卷时用的固定描述，用于向量匹配「完整题目」类 chunk，不把知识点当 query
QUERY_FOR_GENERATION = "题干清晰、包含标准答案和解析的完整数学题目"
# 单块最大字符数，超过则按段落再切
MAX_CHUNK_CHARS = 2000
# 无效 chunk 过滤：最短长度、有效字符（CJK/字母数字）占比下限
MIN_CHUNK_LEN = 30
MIN_MEANINGFUL_RATIO = 0.25
# 知识点宽松匹配时，无 where 检索的候选条数
RELAXED_SEARCH_K = 15
# 混合检索（向量 + 关键词）：先多召候选再 RRF 重排
HYBRID_CANDIDATES = 20
RRF_K = 60

# 各服务商默认 Embedding 模型（OpenAI 兼容 /v1/embeddings；Gemini 用 Google 专用）
# 部分服务商若无独立 Embedding 接口，可改用 OpenRouter（openai/text-embedding-3-small）
EMBED_MODEL_BY_PROVIDER: dict[str, str] = {
    "deepseek": "deepseek-embedding-v2",
    "openai": "text-embedding-3-small",
    "openrouter": "openai/text-embedding-3-small",
    "moonshot": "text-embedding-3-small",
    "zhipu": "text-embedding-3-small",
    "qwen": "text-embedding-3-small",
    "anthropic": "openai/text-embedding-3-small",
    "custom": "text-embedding-3-small",
    "gemini": "",
}


def _is_valid_chunk(text: str) -> bool:
    """过滤过短或几乎无有效内容的块（纯符号/空白），减少噪声。"""
    if not text or len(text) < MIN_CHUNK_LEN:
        return False
    meaningful = sum(1 for c in text if "\u4e00" <= c <= "\u9fff" or c.isalnum())
    return (meaningful / len(text)) >= MIN_MEANINGFUL_RATIO


def _knowledge_point_match(query_kp: str, chunk_kp: str) -> bool:
    """
    宽松匹配：查询知识点与 chunk 知识点互为子串即视为匹配。
    chunk_kp 支持逗号分隔多标签（如 "勾股定理,勾股定理的应用"），任一段与 query_kp 匹配即返回 True。
    """
    if not query_kp or not chunk_kp:
        return False
    segments = [s.strip() for s in chunk_kp.split(",") if s.strip()]
    if not segments:
        return False
    for seg in segments:
        if query_kp in seg or seg in query_kp:
            return True
    return False


def _keyword_score(text: str, query: str) -> float:
    """
    简单关键词相关性：查询串出现得越多、越完整则分越高。用于 RRF 中的关键词侧。
    """
    if not text or not query:
        return 0.0
    score = 0.0
    if query.strip() in text:
        score += 2.0
    for part in re.split(r"[\s,，、]+", query.strip()):
        if len(part) >= 2 and part in text:
            score += 1.0
    return score


def _rrf_rerank(
    docs_with_vector_rank: list[tuple[Any, int]],
    keyword_query: str,
    n_results: int,
    get_content=lambda doc: getattr(doc, "page_content", None) or "",
) -> list[Any]:
    """
    对 (doc, vector_rank) 按关键词得分排序得到 keyword_rank，再 RRF 合并后取 top n_results。
    """
    if not docs_with_vector_rank or not keyword_query.strip():
        return [d for d, _ in docs_with_vector_rank[:n_results]]
    # 关键词排序（得分高在前）
    with_kw_score = [
        (doc, v_rank, _keyword_score(get_content(doc), keyword_query))
        for doc, v_rank in docs_with_vector_rank
    ]
    with_kw_score.sort(key=lambda x: -x[2])
    kw_rank_by_content: dict[str, int] = {}
    for i, (doc, _, _) in enumerate(with_kw_score):
        c = get_content(doc)
        if c not in kw_rank_by_content:
            kw_rank_by_content[c] = i
    # RRF: 1/(K+vector_rank) + 1/(K+keyword_rank)
    rrf_scores: list[tuple[Any, float]] = []
    seen_content: set[str] = set()
    for doc, v_rank in docs_with_vector_rank:
        c = get_content(doc)
        if not c or c in seen_content:
            continue
        seen_content.add(c)
        kw_r = kw_rank_by_content.get(c, len(docs_with_vector_rank))
        rrf = 1.0 / (RRF_K + v_rank) + 1.0 / (RRF_K + kw_r)
        rrf_scores.append((doc, rrf))
    rrf_scores.sort(key=lambda x: -x[1])
    return [d for d, _ in rrf_scores[:n_results]]


def split_into_structured_chunks(text: str) -> list[str]:
    """
    按题号或段落切分，保证每个 chunk 是一道完整题或一段完整概念，避免从题目中间劈开。
    优先按数字题号（1. 2. 一、二、）、【选择题】等分段，其次按双换行分段；单块超长再按段落细分。
    """
    if not text or not text.strip():
        return []
    text = text.strip()
    # 题号/小节分隔：数字+点、中文序号、【小节名】
    pattern = re.compile(
        r"(?=\n\s*\d+[\.．、]\s)|(?=\n[一二三四五六七八九十]+[、．.]\s)|(?=\n【[^】]+】)"
    )
    parts = pattern.split(text)
    chunks: list[str] = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if len(p) <= MAX_CHUNK_CHARS:
            chunks.append(p)
            continue
        # 超长：按双换行拆成段落，再按段合并到不超过 MAX_CHUNK_CHARS
        for para in re.split(r"\n\s*\n", p):
            para = para.strip()
            if not para:
                continue
            if len(para) <= MAX_CHUNK_CHARS:
                chunks.append(para)
            else:
                # 单段仍超长，按单换行切（保底）
                for line in para.split("\n"):
                    line = line.strip()
                    if line:
                        chunks.append(line)
    return chunks


def _get_collection_only():
    """仅获取 Chroma 集合，不初始化 Embedding。用于列表/删除，无需 API Key。集合不存在则创建空集合。"""
    PERSIST_DIR.mkdir(parents=True, exist_ok=True)
    path_str = str(PERSIST_DIR)
    # 优先使用新版本 API（Settings + tenant/database），避免 "Could not connect to tenant default_tenant"
    # 旧版 ChromaDB 可能缺少 DEFAULT_TENANT/DEFAULT_DATABASE 或 PersistentClient 签名不同，统一回退
    try:
        from chromadb.config import Settings, DEFAULT_TENANT, DEFAULT_DATABASE  # noqa: F401
        client = chromadb.PersistentClient(
            path=path_str,
            settings=Settings(),
            tenant=DEFAULT_TENANT,
            database=DEFAULT_DATABASE,
        )
    except Exception as e1:
        err_msg = str(e1).lower()
        try:
            client = chromadb.PersistentClient(path=path_str)
        except Exception:
            logger.warning("ChromaDB PersistentClient(path) 回退失败: %s", e1)
            raise e1
    return client.get_or_create_collection(COLLECTION_NAME)


def _read_documents_registry() -> list[dict]:
    """仅读 JSON 注册表，不访问 ChromaDB。文件不存在或异常时返回 []。"""
    try:
        if not REGISTRY_FILE.exists():
            return []
        raw = REGISTRY_FILE.read_text(encoding="utf-8")
        data = json.loads(raw)
        items = data.get("documents")
        return list(items) if isinstance(items, list) else []
    except Exception as e:
        logger.debug("读取文档注册表失败: %s", e)
        return []


def _write_documents_registry(items: list[dict]) -> None:
    """写入文档注册表。"""
    try:
        PERSIST_DIR.mkdir(parents=True, exist_ok=True)
        tmp = REGISTRY_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps({"documents": items}, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(REGISTRY_FILE)
    except Exception as e:
        logger.warning("写入文档注册表失败: %s", e)


def _registry_add(source: str, chunk_count: int, knowledge_points: list[str]) -> None:
    """在注册表中新增或更新一条文档记录。"""
    items = _read_documents_registry()
    items = [x for x in items if (x.get("source") or "").strip() != (source or "").strip()]
    items.append({
        "source": (source or "").strip(),
        "chunk_count": chunk_count,
        "knowledge_points": sorted(set(k for k in (knowledge_points or []) if (k or "").strip())),
    })
    _write_documents_registry(items)


def _registry_remove(source: str) -> None:
    """从注册表中移除指定来源的文档。"""
    key = (source or "").strip()
    if not key:
        return
    items = [x for x in _read_documents_registry() if (x.get("source") or "").strip() != key]
    _write_documents_registry(items)


def rag_list_documents_from_registry() -> list[dict]:
    """
    仅从本地 JSON 注册表读取文档列表，不访问 ChromaDB，避免阻塞或连接重置。
    每项含 source、chunk_count、knowledge_points。与 rag_list_documents_no_auth 返回格式一致。
    """
    return _read_documents_registry()


def rag_list_documents_no_auth() -> list[dict]:
    """
    列出知识库文档（不依赖 RAG 服务与 API Key）。集合不存在或为空时返回 []。
    每项含 source、chunk_count、knowledge_points（该来源下 chunk 的非空知识点去重列表）。
    ChromaDB 未初始化或路径异常时也返回 []，不向上抛出，避免 500。
    """
    try:
        coll = _get_collection_only()
        data = coll.get(include=["metadatas"])
        metadatas = data.get("metadatas") or []
        # 按 source 聚合：计数 + 收集知识点
        by_source: dict[str, tuple[int, set[str]]] = {}
        for m in metadatas:
            meta = m or {}
            src = str(meta.get("source") or "未知").strip() or "未知"
            kp = str(meta.get("knowledge_point") or "").strip()
            if src not in by_source:
                by_source[src] = (0, set())
            count, kps = by_source[src]
            by_source[src] = (count + 1, kps)
            if kp:
                kps.add(kp)
        return [
            {"source": name, "chunk_count": count, "knowledge_points": sorted(kps)}
            for name, (count, kps) in by_source.items()
        ]
    except BaseException as e:
        logger.warning("rag_list_documents_no_auth 失败（返回空列表）: %s", e)
        return []


def rag_get_chunks_by_source_no_auth(source: str) -> list[str]:
    """
    按来源获取文档的文本块列表（用于预览），按 chunk_index 排序拼回原文档顺序。不依赖 Embedding API Key。
    """
    if not (source and str(source).strip()):
        return []
    try:
        coll = _get_collection_only()
        data = coll.get(
            where={"source": source.strip()},
            include=["documents", "metadatas"],
        )
        docs = data.get("documents") or []
        metadatas = data.get("metadatas") or []
        # 按 chunk_index 排序后返回文档内容
        indexed = [
            ((m or {}).get("chunk_index", 999999), str(d).strip() if d else "")
            for m, d in zip(metadatas, docs)
        ]
        indexed.sort(key=lambda x: (x[0], x[1]))
        return [t for _, t in indexed if t]
    except Exception as e:
        logger.debug("rag_get_chunks_by_source_no_auth: %s", e)
        return []


def rag_delete_by_source_no_auth(source: str) -> int:
    """
    按来源删除文档（不依赖 RAG 服务与 API Key）。返回删除的块数。
    """
    if not (source and str(source).strip()):
        return 0
    try:
        coll = _get_collection_only()
        data = coll.get(where={"source": source.strip()}, include=[])
        ids = data.get("ids") or []
        if ids:
            coll.delete(ids=ids)
            _registry_remove(source.strip())
            logger.info("RAG 已按来源删除: %s, 共 %d 块", source, len(ids))
        return len(ids)
    except Exception as e:
        logger.warning("RAG delete_by_source 异常: %s", e)
        raise


def _use_deepseek_embedding() -> bool:
    """是否使用 DeepSeek 做 RAG Embedding（仅用于无 llm_config 时的回退）。"""
    if DEEPSEEK_API_KEY:
        return True
    if (LLM_PROVIDER or "").strip().lower() == "deepseek" and (LLM_API_KEY or "").strip():
        return True
    return False


def _get_embedding_key() -> str:
    """仅用于无 llm_config 时：DeepSeek 优先，否则 Gemini。"""
    if _use_deepseek_embedding():
        return (DEEPSEEK_API_KEY or LLM_API_KEY or "").strip()
    return (
        (os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY") or LLM_API_KEY or "").strip()
    )


def _normalize_embed_base_url(base_url: str) -> str:
    """OpenAI 兼容接口通常需要 /v1 后缀。"""
    u = (base_url or "").strip()
    if u and not u.endswith("/v1"):
        u = u.rstrip("/") + "/v1"
    return u


def _create_embeddings_from_config(provider: str, api_key: str, base_url: str, model: str) -> Any:
    """
    根据设置中的服务商创建 Embedding。Gemini 用 Google；其余用 OpenAI 兼容接口。
    """
    prov = (provider or "").strip().lower()
    key = (api_key or "").strip()
    if not key:
        raise ValueError("未配置 API Key。请在「设置」中选择服务商并填写 API Key。")

    if prov == "gemini":
        return GoogleGenerativeAIEmbeddings(
            model="models/gemini-embedding-001",
            google_api_key=key,
        )
    # OpenAI 兼容：DeepSeek / OpenRouter / OpenAI / Moonshot / 智谱 / 通义 / Anthropic(经 OpenRouter) / Custom
    embed_model = EMBED_MODEL_BY_PROVIDER.get(prov) or "text-embedding-3-small"
    if prov == "deepseek":
        embed_model = (DEEPSEEK_EMBED_MODEL or "deepseek-embedding-v2").strip() or "deepseek-embedding-v2"
    url = _normalize_embed_base_url(
        base_url or (DEEPSEEK_BASE_URL if prov == "deepseek" else "") or "https://api.openai.com/v1"
    )
    return OpenAIEmbeddings(
        openai_api_key=key,
        openai_api_base=url,
        model=embed_model,
        request_timeout=min(60, max(30, AI_REQUEST_TIMEOUT)),
    )


def _create_embeddings():
    """
    无请求配置时的回退：优先 DeepSeek，否则 Gemini（与原有逻辑一致）。
    """
    if _use_deepseek_embedding():
        api_key = (DEEPSEEK_API_KEY or LLM_API_KEY or "").strip()
        if not api_key:
            raise ValueError(
                "未配置 DeepSeek API Key。请设置 DEEPSEEK_API_KEY 或 LLM_PROVIDER=deepseek 并设置 LLM_API_KEY。"
            )
        base_url = (
            (DEEPSEEK_BASE_URL or LLM_BASE_URL or "").strip() or "https://api.deepseek.com"
        )
        url = _normalize_embed_base_url(base_url)
        return OpenAIEmbeddings(
            openai_api_key=api_key,
            openai_api_base=url,
            model=(DEEPSEEK_EMBED_MODEL or "deepseek-embedding-v2").strip() or "deepseek-embedding-v2",
            request_timeout=min(60, max(30, AI_REQUEST_TIMEOUT)),
        )
    api_key = _get_embedding_key()
    if not api_key:
        raise ValueError(
            "未配置 Embedding API Key。请在「设置」中选择服务商并填写 API Key，或设置 DEEPSEEK_API_KEY / GOOGLE_API_KEY / LLM_API_KEY。"
        )
    return GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-001",
        google_api_key=api_key,
    )


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
        if not items:
            return "", []
        parts = [f"【来源：{source}】\n{content}" for content, source in items]
        sources = list(dict.fromkeys(s for _, s in items))
        return "\n\n".join(parts), sources

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
