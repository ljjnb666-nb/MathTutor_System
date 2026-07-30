import re


def extract_problem_numbers(text: str) -> set[int]:
    """Extract problem-level numbers used for lightweight consistency checks."""
    if not (text or "").strip():
        return set()

    numbers: set[int] = set()
    for match in re.finditer(r"(\d+)\s*元", text):
        numbers.add(int(match.group(1)))
    for match in re.finditer(r"(\d+)\s*件", text):
        numbers.add(int(match.group(1)))
    for match in re.finditer(r"(?:获得|利润|目标利润)[为]?\s*(\d+)", text):
        numbers.add(int(match.group(1)))
    for match in re.finditer(r"(\d+)\s*元\s*(?:的?\s*)?利润", text):
        numbers.add(int(match.group(1)))
    for match in re.finditer(r"(?:进价|定价|销售单价|单价)[为]?\s*(\d+)", text):
        numbers.add(int(match.group(1)))
    for match in re.finditer(r"定为\s*(\d+)", text):
        numbers.add(int(match.group(1)))
    return numbers


def is_likely_content_analysis_mismatch(content: str, analysis: str, answer: str) -> bool:
    content = (content or "").strip()
    analysis = (analysis or "").strip()
    answer = (answer or "").strip()
    if not content or (not analysis and not answer):
        return False

    content_numbers = extract_problem_numbers(content)
    rest_numbers = extract_problem_numbers(f"{analysis} {answer}")
    only_in_rest = {number for number in rest_numbers if number >= 15 and number not in content_numbers}
    return len(content_numbers) >= 2 and len(only_in_rest) >= 2
