"""Question normalization and merge helpers for parsed exam documents."""
import re
from typing import Any

# bbox filtering: ignore tiny boxes and near-full-page boxes.
IMAGE_REGION_MIN_AREA = 0.001
IMAGE_REGION_MAX_SIDE = 0.92

SECTION_HEADERS = (
    "【探索发现】",
    "【抽象定义】",
    "【问题解决】",
    "【方法应用】",
    "【问题背景】",
    "【研究条件】",
    "【模型构建】",
    "【模型应用】",
    "【总结反思】",
)
SECTION_HEADER_PATTERN = re.compile(r"^\s*【[^】]{2,20}】")


def normalize_question_number(num: Any) -> str:
    """Normalize question numbers so 20 and '20' compare the same."""
    if num is None:
        return ""
    return str(num).strip()


def question_merge_key(num: Any) -> str:
    """Merge 20, 20.1, 20.2 under the same main question number."""
    value = normalize_question_number(num)
    if not value:
        return ""
    match = re.match(r"^(\d+)", value)
    return match.group(1) if match else value


def append_region(regions: list[dict[str, float]], region: Any) -> None:
    """Append a valid, reasonable normalized bbox to regions."""
    if not isinstance(region, dict):
        return
    try:
        x = float(region.get("x", 0))
        y = float(region.get("y", 0))
        width = float(region.get("width", 0))
        height = float(region.get("height", 0))
        if not (0 <= x <= 1 and 0 <= y <= 1 and 0 < width <= 1 and 0 < height <= 1):
            return
        if width * height < IMAGE_REGION_MIN_AREA:
            return
        if width >= IMAGE_REGION_MAX_SIDE and height >= IMAGE_REGION_MAX_SIDE:
            return
        regions.append({"x": x, "y": y, "width": width, "height": height})
    except (TypeError, ValueError):
        return


def normalize_question_type(raw_type: Any, options: list[Any] | None = None) -> str:
    """
    Normalize model-provided question type to choice | fill | solution.
    Falls back to options: at least two options means choice, otherwise fill.
    """
    question_type = (raw_type if isinstance(raw_type, str) else "").strip().lower()
    opts = options if isinstance(options, list) else []
    choice_aliases = ("choice", "选择", "选择题", "单选", "单选题", "判断", "判断题")
    fill_aliases = ("fill", "填空", "填空题", "text", "填空題")
    solution_aliases = ("solution", "解答", "解答题", "计算", "计算题", "应用", "应用题", "大题")
    if question_type in choice_aliases:
        return "choice"
    if question_type in fill_aliases:
        return "fill"
    if question_type in solution_aliases:
        return "solution"
    if len(opts) >= 2:
        return "choice"
    return "fill"


def merge_same_number_questions(questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge consecutive questions with the same main number."""
    if not questions:
        return []
    result: list[dict[str, Any]] = []
    i = 0
    while i < len(questions):
        question = dict(questions[i])
        key = question_merge_key(question.get("number"))
        num_display = normalize_question_number(question.get("number")) or key
        contents = [(question.get("content") or "").strip()]
        options = question.get("options")
        if not isinstance(options, list):
            options = []
        images_list: list[str] = (
            list(question.get("images") or []) if isinstance(question.get("images"), list) else []
        )
        image_regions_list: list[dict[str, float]] = []
        append_region(image_regions_list, question.get("image_region"))
        question_type = normalize_question_type(question.get("type"), options)
        j = i + 1
        while j < len(questions) and question_merge_key(questions[j].get("number")) == key:
            next_question = questions[j]
            part = (next_question.get("content") or "").strip()
            if part:
                contents.append(part)
            next_options = next_question.get("options")
            if isinstance(next_options, list) and next_options and not options:
                options = next_options
            next_images = next_question.get("images")
            if isinstance(next_images, list):
                images_list.extend(next_images)
            append_region(image_regions_list, next_question.get("image_region"))
            if normalize_question_type(next_question.get("type"), next_question.get("options")) == "solution":
                question_type = "solution"
            j += 1
        question["content"] = "\n\n".join(contents)
        question["options"] = options
        question["type"] = question_type
        question["number"] = int(key) if key and key.isdigit() else num_display
        question["images"] = images_list
        if image_regions_list:
            question["image_regions"] = image_regions_list
        question.pop("image_region", None)
        result.append(question)
        i = j
    return result


def merge_by_section_headers(questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge section-header continuations into the previous solution question."""
    if not questions:
        return []
    result: list[dict[str, Any]] = []
    for question in questions:
        if not isinstance(question, dict):
            continue
        content = (question.get("content") or "").strip()
        if not result:
            result.append(dict(question))
            continue
        prev = result[-1]
        prev_type = normalize_question_type(prev.get("type"), prev.get("options"))
        starts_with_section = any(content.startswith(header) for header in SECTION_HEADERS) or bool(
            SECTION_HEADER_PATTERN.match(content)
        )
        has_new_number_in_start = bool(re.search(r"^\s*\d+[.．]\s", content[:25]))
        if starts_with_section and prev_type == "solution" and not has_new_number_in_start:
            prev_content = (prev.get("content") or "").strip()
            prev["content"] = f"{prev_content}\n\n{content}".strip()
            prev_images = prev.get("images")
            prev_images = list(prev_images) if isinstance(prev_images, list) else []
            cur_images = question.get("images")
            if isinstance(cur_images, list):
                prev_images.extend(cur_images)
            prev["images"] = prev_images
            prev_regions = prev.get("image_regions")
            prev_regions = list(prev_regions) if isinstance(prev_regions, list) else []
            append_region(prev_regions, question.get("image_region"))
            for region in question.get("image_regions") or []:
                if isinstance(region, dict):
                    append_region(prev_regions, region)
            if prev_regions:
                prev["image_regions"] = prev_regions
        else:
            result.append(dict(question))
    return result
