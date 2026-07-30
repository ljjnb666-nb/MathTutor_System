from app.services.llm_output_service import (
    fallback_content_from_message,
    get_message_content_safe,
    normalize_llm_output,
)


class MessageWithBrokenContent:
    def __init__(self, content=None, response_metadata=None, additional_kwargs=None):
        self.__dict__["content"] = content
        self.response_metadata = response_metadata or {}
        self.additional_kwargs = additional_kwargs or {}

    @property
    def content(self):
        raise KeyError('"questions"')


class ContentBlock:
    def __init__(self, content):
        self.content = content


def test_get_message_content_safe_prefers_dict_content_without_property_access():
    msg = MessageWithBrokenContent(content={"questions": []})

    assert get_message_content_safe(msg) == {"questions": []}
    assert fallback_content_from_message(msg) == '{"questions": []}'


def test_get_message_content_safe_reads_response_metadata_choices():
    msg = MessageWithBrokenContent(
        response_metadata={
            "body": {
                "choices": [
                    {
                        "message": {
                            "content": "from choices",
                        }
                    }
                ]
            }
        }
    )

    assert get_message_content_safe(msg) == "from choices"


def test_normalize_llm_output_flattens_mixed_blocks():
    output = [
        "a",
        {"text": "b"},
        {"content": {"questions": []}},
        ContentBlock("c"),
        1,
    ]

    assert normalize_llm_output(output) == 'ab{"questions": []}c1'
