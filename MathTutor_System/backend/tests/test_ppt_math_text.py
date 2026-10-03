"""PHASE 2C-5A：后端显式数学解析与前端 MathText 的跨运行时契约。

test-fixtures/math-rendering-cases.json 是唯一行为契约：
每个 case 都必须与前端 parseMathText 的片段类型与规范化结果一致。
本测试只锁定解析层；渲染回退在 test_ppt_math_renderer.py 覆盖。
"""
import json
from pathlib import Path

import pytest

from app.services.ppt_math_text import has_explicit_math, normalize_math_source, parse_math_text

_FIXTURE = Path(__file__).resolve().parents[2] / "test-fixtures" / "math-rendering-cases.json"
CASES = json.loads(_FIXTURE.read_text(encoding="utf-8"))["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_shared_fixture_parity(case):
    parts = parse_math_text(case["input"])

    assert [part["type"] for part in parts] == case["types"]

    math_parts = [part for part in parts if part["type"] != "text"]
    if case.get("math") is not None:
        assert math_parts, f"case {case['name']} expects a math segment"
        assert math_parts[0]["value"] == case["math"]

    if case.get("text") is not None:
        text_parts = [part for part in parts if part["type"] == "text"]
        assert len(parts) == 1 and parts[0]["type"] == "text"
        assert parts[0]["value"] == case["text"]

    # 畸形/不受支持公式保留规范源码原文，等待渲染层安全回退。
    if case.get("fallback"):
        assert math_parts[0]["raw"] == case["input"]
        assert math_parts[0]["value"] != ""


def test_unmatched_delimiters_stay_plain():
    for source in ("$$x+1", "\\(x+1", "\\[x+1"):
        parts = parse_math_text(source)
        assert all(part["type"] == "text" for part in parts)
    # 出现成对 $ 时按 inline 解析（与前端一致），末尾孤 $ 保留为纯文本。
    parts = parse_math_text("$5 and $x$")
    assert [part["type"] for part in parts] == ["inline", "text"]
    assert parts[1]["value"] == "x$"


def test_non_string_and_empty_inputs():
    assert parse_math_text(None) == []
    assert parse_math_text("") == []
    assert parse_math_text(123) == []


def test_has_explicit_math_requires_delimiters():
    assert has_explicit_math("当 $x=2$ 时")
    assert has_explicit_math("解 \\(x^2=4\\)")
    assert has_explicit_math("$$c=\\sqrt{a^2+b^2}$$")
    # 裸文本数学一律不识别：
    assert not has_explicit_math("a²+b²=c²")
    assert not has_explicit_math("√2")
    assert not has_explicit_math("x^2")
    assert not has_explicit_math("①第一步 √2 x^2")
    assert not has_explicit_math("价格是 $5")
    assert not has_explicit_math("<script>alert(1)</script>")


def test_normalize_math_source_only_inside_math():
    assert normalize_math_source("√2") == "\\sqrt{2}"
    assert normalize_math_source("①+⑩") == "(1)+(10)"
    assert normalize_math_source("x+(y+1)") == "x+(y+1)"
