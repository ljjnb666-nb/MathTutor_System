from app.services.rag_service import RAGService


class Doc:
    def __init__(self, content, metadata):
        self.page_content = content
        self.metadata = metadata


class FakeVectorStore:
    def __init__(self):
        self.score_filters = []
        self.search_filters = []

    def similarity_search_with_score(self, query, k, filter=None):
        self.score_filters.append(filter)
        docs = [
            Doc("teacher-a owned chunk", {"owner_user_id": 1, "source": "a.pdf", "knowledge_point": "函数"}),
            Doc("teacher-b more similar chunk", {"owner_user_id": 2, "source": "b.pdf", "knowledge_point": "函数"}),
        ]
        return [(doc, index) for index, doc in enumerate(docs)]

    def similarity_search(self, query, k, filter=None):
        self.search_filters.append(filter)
        return [
            Doc("teacher-a relaxed chunk", {"owner_user_id": 1, "source": "a2.pdf", "knowledge_point": "一次函数"}),
            Doc("teacher-b relaxed chunk", {"owner_user_id": 2, "source": "b2.pdf", "knowledge_point": "一次函数"}),
        ]


def make_service():
    service = object.__new__(RAGService)
    service.vector_store = FakeVectorStore()
    return service


def test_owner_filter_without_knowledge_point_is_sent_to_chroma():
    service = make_service()

    context, sources = service.search_context_for_chat_with_sources_owned(1, "函数", n_results=3)

    assert service.vector_store.score_filters[0] == {"owner_user_id": 1}
    assert "teacher-b" not in context
    assert sources == ["a.pdf"]


def test_owner_filter_with_exact_knowledge_point_is_sent_to_chroma():
    service = make_service()

    context, sources = service.search_context_for_chat_with_sources_owned(1, "函数", knowledge_point="函数", n_results=3)

    assert service.vector_store.score_filters[0] == {"$and": [{"owner_user_id": 1}, {"knowledge_point": "函数"}]}
    assert "teacher-b" not in context
    assert sources[0] == "a.pdf"
    assert "b.pdf" not in sources


def test_relaxed_knowledge_point_search_keeps_owner_filter():
    service = make_service()

    service.search_context_for_chat_with_sources_owned(1, "函数", knowledge_point="函数", n_results=2)

    assert service.vector_store.search_filters[0] == {"owner_user_id": 1}
