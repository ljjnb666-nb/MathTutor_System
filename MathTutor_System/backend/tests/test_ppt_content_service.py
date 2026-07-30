from app.services.ppt_content_service import clean_json_string


def test_clean_json_string_reuses_generic_markdown_cleanup():
    raw = """```json
{"title":"Lesson","slides":[]}
```"""

    assert clean_json_string(raw) == '{"title":"Lesson","slides":[]}'
