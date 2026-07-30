import json

from app.services.json_repair_utils import (
    escape_literal_newlines_in_json,
    extract_first_json_array,
    extract_first_json_object,
    fix_json_invalid_escapes,
    strip_json_markdown,
    try_repair_single_json_object,
)


def test_extract_first_json_object_ignores_braces_inside_strings():
    text = 'prefix {"content":"集合 {1,2}", "items":[{"x":1}]} suffix {"ignored":true}'

    extracted = extract_first_json_object(text)

    assert json.loads(extracted) == {"content": "集合 {1,2}", "items": [{"x": 1}]}


def test_extract_first_json_array_ignores_brackets_inside_strings():
    text = 'prefix [{"content":"区间 [0,1]"}, {"x":2}] suffix'

    extracted = extract_first_json_array(text)

    assert json.loads(extracted) == [{"content": "区间 [0,1]"}, {"x": 2}]


def test_escape_literal_newlines_in_json_only_changes_string_content():
    raw = '{\n"content":"第一行\n第二行"\n}'
    escaped = escape_literal_newlines_in_json(raw)

    assert json.loads(escaped) == {"content": "第一行\n第二行"}


def test_fix_json_invalid_escapes_preserves_latex_backslashes():
    fixed = fix_json_invalid_escapes(r'{"content":"\triangle ABC", "analysis":"\frac{1}{2}ab"}')

    assert json.loads(fixed)["content"] == r"\triangle ABC"
    assert json.loads(fixed)["analysis"] == r"\frac{1}{2}ab"


def test_strip_json_markdown_and_repair_single_object():
    assert strip_json_markdown("```json\n{\"a\":1}\n```") == '{"a":1}'
    assert try_repair_single_json_object('{"a":"b') == '{"a":"b"}'
