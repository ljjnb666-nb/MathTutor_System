"""
Pure text utilities for RAG chunking, filtering, reranking, and formatting.

This module intentionally avoids ChromaDB/LangChain imports so it can be tested
without vector-store or embedding dependencies.
"""
import re
from typing import Any, Callable

# Single chunk maximum; longer sections are split by paragraph/line.
MAX_CHUNK_CHARS = 2000
# Invalid chunk filter: minimum length and meaningful CJK/alnum ratio.
MIN_CHUNK_LEN = 30
MIN_MEANINGFUL_RATIO = 0.25
# Hybrid retrieval constants.
HYBRID_CANDIDATES = 20
RRF_K = 60


def is_valid_chunk(text: str) -> bool:
    """Filter out chunks that are too short or mostly symbols/whitespace."""
    if not text or len(text) < MIN_CHUNK_LEN:
        return False
    meaningful = sum(1 for c in text if "\u4e00" <= c <= "\u9fff" or c.isalnum())
    return (meaningful / len(text)) >= MIN_MEANINGFUL_RATIO


def knowledge_point_match(query_kp: str, chunk_kp: str) -> bool:
    """
    Loose match: query knowledge point and chunk knowledge-point tags may contain
    each other. Chunk tags may be comma-separated.
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


def keyword_score(text: str, query: str) -> float:
    """Simple keyword relevance used as the keyword side of RRF ranking."""
    if not text or not query:
        return 0.0
    score = 0.0
    if query.strip() in text:
        score += 2.0
    for part in re.split(r"[\s,，、]+", query.strip()):
        if len(part) >= 2 and part in text:
            score += 1.0
    return score


def rrf_rerank(
    docs_with_vector_rank: list[tuple[Any, int]],
    keyword_query: str,
    n_results: int,
    get_content: Callable[[Any], str] = lambda doc: getattr(doc, "page_content", None) or "",
) -> list[Any]:
    """Merge vector rank and keyword rank with Reciprocal Rank Fusion."""
    if not docs_with_vector_rank or not keyword_query.strip():
        return [d for d, _ in docs_with_vector_rank[:n_results]]

    with_kw_score = [
        (doc, v_rank, keyword_score(get_content(doc), keyword_query))
        for doc, v_rank in docs_with_vector_rank
    ]
    with_kw_score.sort(key=lambda x: -x[2])

    kw_rank_by_content: dict[str, int] = {}
    for i, (doc, _, _) in enumerate(with_kw_score):
        content = get_content(doc)
        if content not in kw_rank_by_content:
            kw_rank_by_content[content] = i

    rrf_scores: list[tuple[Any, float]] = []
    seen_content: set[str] = set()
    for doc, v_rank in docs_with_vector_rank:
        content = get_content(doc)
        if not content or content in seen_content:
            continue
        seen_content.add(content)
        kw_rank = kw_rank_by_content.get(content, len(docs_with_vector_rank))
        rrf = 1.0 / (RRF_K + v_rank) + 1.0 / (RRF_K + kw_rank)
        rrf_scores.append((doc, rrf))

    rrf_scores.sort(key=lambda x: -x[1])
    return [d for d, _ in rrf_scores[:n_results]]


def split_into_structured_chunks(text: str) -> list[str]:
    """
    Split by question/section markers first, then paragraphs and lines.
    This keeps questions or concept paragraphs intact where possible.
    """
    if not text or not text.strip():
        return []
    text = text.strip()
    pattern = re.compile(
        r"(?=\n\s*\d+[\.．、]\s)|(?=\n[一二三四五六七八九十]+[、．.]\s)|(?=\n【[^】]+】)"
    )
    parts = pattern.split(text)
    chunks: list[str] = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        if len(part) <= MAX_CHUNK_CHARS:
            chunks.append(part)
            continue
        for paragraph in re.split(r"\n\s*\n", part):
            paragraph = paragraph.strip()
            if not paragraph:
                continue
            if len(paragraph) <= MAX_CHUNK_CHARS:
                chunks.append(paragraph)
            else:
                for line in paragraph.split("\n"):
                    line = line.strip()
                    if line:
                        chunks.append(line)
    return chunks


def format_context_with_sources(items: list[tuple[str, str]]) -> tuple[str, list[str]]:
    """Format retrieved chunks with source labels and return unique sources."""
    if not items:
        return "", []
    parts = [f"【来源：{source}】\n{content}" for content, source in items]
    sources = list(dict.fromkeys(source for _, source in items))
    return "\n\n".join(parts), sources
