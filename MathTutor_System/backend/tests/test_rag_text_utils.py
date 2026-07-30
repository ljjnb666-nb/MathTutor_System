from dataclasses import dataclass

from app.services.rag_text_utils import (
    format_context_with_sources,
    is_valid_chunk,
    knowledge_point_match,
    rrf_rerank,
    split_into_structured_chunks,
)


@dataclass
class FakeDoc:
    page_content: str


def test_split_into_structured_chunks_preserves_question_sections():
    text = "\n".join(
        [
            "导入说明",
            "1. 已知直角三角形两边分别为3和4，求斜边。",
            "解析：使用勾股定理。",
            "2. 已知斜边为13，一条直角边为5，求另一条直角边。",
        ]
    )

    chunks = split_into_structured_chunks(text)

    assert chunks == [
        "导入说明",
        "1. 已知直角三角形两边分别为3和4，求斜边。\n解析：使用勾股定理。",
        "2. 已知斜边为13，一条直角边为5，求另一条直角边。",
    ]


def test_is_valid_chunk_filters_short_or_symbol_content():
    assert not is_valid_chunk("太短")
    assert not is_valid_chunk("!" * 120)
    assert is_valid_chunk("这是一段包含足够数学内容的文本，用于测试向量库切块是否会保留有效知识点。")


def test_knowledge_point_match_supports_comma_separated_loose_match():
    assert knowledge_point_match("勾股定理", "一次函数,勾股定理的应用")
    assert knowledge_point_match("勾股定理的应用", "勾股定理")
    assert not knowledge_point_match("相似三角形", "一次函数,勾股定理")


def test_rrf_rerank_combines_vector_rank_and_keyword_rank():
    docs = [
        FakeDoc("一次函数基础题"),
        FakeDoc("勾股定理应用题"),
        FakeDoc("相似三角形题"),
    ]

    reranked = rrf_rerank(
        [(docs[0], 0), (docs[1], 1), (docs[2], 2)],
        "勾股定理",
        2,
    )

    assert docs[1] in reranked
    assert len(reranked) == 2


def test_format_context_with_sources_deduplicates_sources_in_order():
    context, sources = format_context_with_sources(
        [
            ("题目一", "a.pdf"),
            ("题目二", "b.pdf"),
            ("题目三", "a.pdf"),
        ]
    )

    assert "【来源：a.pdf】\n题目一" in context
    assert sources == ["a.pdf", "b.pdf"]
