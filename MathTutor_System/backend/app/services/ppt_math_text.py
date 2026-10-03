"""Magic PPT 后端显式数学定界符解析权威。

与前端 SSOT（frontend/src/utils/mathText.js / MathText.jsx）语义保持一致，
以 test-fixtures/math-rendering-cases.json 作为跨运行时行为契约：

- 只有显式定界符 $...$、$$...$$、\\(...\\)、\\[...\\] 标识数学；
- 绝不从 a²+b²=c²、√2、x^2、① 等裸文本推断数学；
- 规范状态是源文本，本模块只解析，从不重写存储数据；
- 未闭合/畸形定界符保留为纯文本（raw 源码），渲染层负责安全回退。
"""
import re

_CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩"
_ROOT_ATOM = re.compile(r"^(?:\d+(?:\.\d+)?|[a-zA-Z])")


def _escaped(text: str, index: int) -> bool:
    """index 之前存在奇数个连续反斜杠时视为被转义。"""
    slashes = 0
    i = index
    while i > 0:
        i -= 1
        if text[i] != "\\":
            break
        slashes += 1
    return slashes % 2 == 1


def _char_at(text: str, index: int) -> str:
    return text[index] if 0 <= index < len(text) else ""


def normalize_math_source(source: str) -> str:
    """数学段内规范化：圈号 → (n)；√ → \\sqrt{...}。定界符外的文本绝不处理。"""
    result: list[str] = []
    i = 0
    n = len(source)
    while i < n:
        c = source[i]
        if c in _CIRCLED:
            result.append(f"({_CIRCLED.index(c) + 1})")
            i += 1
            continue
        if c == "√":
            start = i + 1
            nxt = _char_at(source, start)
            if nxt in ("(", "{"):
                stack = [nxt]
                end = start + 1
                while end < n and stack:
                    if _escaped(source, end):
                        end += 1
                        continue
                    nxt = source[end]
                    if nxt in ("(", "{"):
                        stack.append(nxt)
                    if nxt in (")", "}"):
                        expected = "(" if nxt == ")" else "{"
                        if stack[-1] != expected:
                            break
                        stack.pop()
                    end += 1
                if not stack:
                    result.append("\\sqrt{" + normalize_math_source(source[start + 1:end - 1]) + "}")
                    i = end
                    continue
                result.append(c)
                i += 1
                continue
            atom = _ROOT_ATOM.match(source[start:])
            if atom:
                result.append("\\sqrt{" + atom.group(0) + "}")
                i += len(atom.group(0)) + 1
            else:
                result.append(c)
                i += 1
            continue
        result.append(c)
        i += 1
    return "".join(result)


def parse_math_text(text: str) -> list[dict]:
    """把源文本解析为 [{type: text|inline|display, value, raw}] 片段列表。

    - text 片段 value 为展示文本（\\$ 转义还原为 $），raw 为源码原文；
    - math 片段 value 为定界符内规范化后的 TeX 源，raw 含定界符；
    - 未闭合的定界符整体保留为 text 片段，不做二次解释。
    """
    if not isinstance(text, str) or not text:
        return []
    parts: list[dict] = []
    plain = ""
    raw_plain = ""

    def flush() -> None:
        nonlocal plain, raw_plain
        if plain:
            parts.append({"type": "text", "value": plain, "raw": raw_plain})
        plain = ""
        raw_plain = ""

    i = 0
    n = len(text)
    while i < n:
        if text[i] == "\\" and _char_at(text, i + 1) == "$" and not _escaped(text, i):
            plain += "$"
            raw_plain += text[i:i + 2]
            i += 2
            continue
        open_delim = close_delim = seg_type = None
        if not _escaped(text, i):
            if text.startswith("$$", i):
                open_delim, close_delim, seg_type = "$$", "$$", "display"
            elif text[i] == "$":
                open_delim, close_delim, seg_type = "$", "$", "inline"
            elif text.startswith("\\(", i):
                open_delim, close_delim, seg_type = "\\(", "\\)", "inline"
            elif text.startswith("\\[", i):
                open_delim, close_delim, seg_type = "\\[", "\\]", "display"
        if open_delim:
            end = i + len(open_delim)
            while end < n:
                if not _escaped(text, end) and text.startswith(close_delim, end):
                    # 连续的 display 美元串不能当作 inline 的闭合定界符。
                    if close_delim != "$" or (text[end - 1] != "$" and _char_at(text, end + 1) != "$"):
                        break
                end += 1
            if end < n:
                flush()
                source = text[i + len(open_delim):end]
                parts.append({
                    "type": seg_type,
                    "value": normalize_math_source(source),
                    "raw": text[i:end + len(close_delim)],
                })
                i = end + len(close_delim)
                continue
            # 保留整个未闭合的起始定界符，不重新解释其中的第二个 $。
            plain += open_delim
            raw_plain += open_delim
            i += len(open_delim)
        else:
            plain += text[i]
            raw_plain += text[i]
            i += 1
    flush()
    return parts


def has_explicit_math(text: str) -> bool:
    """字段中是否含至少一个显式定界符数学段（不推断裸文本）。"""
    return any(part["type"] != "text" for part in parse_math_text(text))
