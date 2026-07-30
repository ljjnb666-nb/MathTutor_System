"""
智能出题 LLM 服务：组装 Prompt、按配置动态调用 LLM、清洗并解析 JSON。
支持并发生成：count > 1 时拆成多个单题任务，用 asyncio.gather 并行执行。
Gemini 用 ChatGoogleGenerativeAI；其余用 ChatOpenAI(base_url) 兼容 DeepSeek/Kimi 等。
"""
import asyncio
import json
import logging
from typing import Any

from app.core.prompts import (
    VERIFY_QUESTION_PROMPT,
    GENERATE_ANALYSIS_PROMPT,
)
from app.core.config import RAG_TOP_K
from app.schemas.generation import ExamGenerateRequest, GenerateRequest, QuestionItem
from app.services.llm_client_service import (
    call_llm as _call_llm,
    call_llm_async as _call_llm_async,
)
from app.services.gemini_rest_service import (
    gemini_rest_text_sync,
    gemini_rest_vision_sync,
)
from app.services.llm_chat_service import (
    build_chat_messages as _build_chat_messages,
    chat_completion_async,
    chat_completion_stream_async,
)
from app.services.llm_prompt_service import build_generation_prompt as _build_prompt
from app.services.question_consistency_service import (
    is_likely_content_analysis_mismatch as _is_likely_content_analysis_mismatch,
)
from app.services.question_json_parser import (
    escape_literal_newlines_in_json as _escape_literal_newlines_in_json,
    extract_first_json_object as _extract_first_json_object,
    fix_json_invalid_escapes as _fix_json_invalid_escapes,
    log_raw_on_parse_fail as _log_raw_on_parse_fail,
    parse_questions as _parse_questions,
    parse_sync_tutoring_response as _parse_sync_tutoring_response,
    strip_json_markdown as _strip_json_markdown,
    try_repair_single_json_object as _try_repair_single_json_object,
)

logger = logging.getLogger(__name__)


MAX_RETRIES = 2
# 并发生成时提高 temperature 保证多样性（0.7–0.9）
PARALLEL_TEMPERATURE = 0.8
# LLM 单次请求超时（秒），试卷/多题生成时建议 120+ 避免长输出超时
LLM_REQUEST_TIMEOUT = 120


async def _generate_single(
    request: GenerateRequest,
    llm_config: Any,
    index: int,
    *,
    temperature: float = PARALLEL_TEMPERATURE,
    knowledge_base_context: str | None = None,
) -> list[QuestionItem]:
    """
    单题生成：强制 count=1，可选 diversity 提示。
    单题失败时返回空列表，不拖垮整体；内部重试由 _call_llm_async 完成。
    """
    single_request = GenerateRequest(
        knowledge_point=request.knowledge_point,
        difficulty=request.difficulty,
        question_type=request.question_type,
        count=1,
        scenario=request.scenario or "default",
    )
    try:
        prompt = _build_prompt(single_request, count=1, diversity_index=index, knowledge_base_context=knowledge_base_context)
        raw = await _call_llm_async(prompt, llm_config, temperature=temperature)
        parsed = _parse_questions(raw)
        return parsed if parsed else []
    except KeyError as e:
        logger.warning("单题生成 index=%s KeyError（已忽略）: %s", index, e)
        return []
    except Exception as e:
        logger.warning("单题生成 index=%s 失败（已忽略）: %s", index, e)
        return []


def _normalize_verified_question(obj: dict, fallback: dict) -> dict:
    """将校对返回的 JSON 对象规范为前端需要的结构，缺失字段用 fallback 补全。"""
    content = (obj.get("content") if isinstance(obj.get("content"), str) else None) or fallback.get("content", "")
    options = obj.get("options")
    if not isinstance(options, list):
        options = fallback.get("options") if isinstance(fallback.get("options"), list) else []
    answer = (obj.get("answer") if isinstance(obj.get("answer"), str) else None) or fallback.get("answer", "")
    analysis = (obj.get("analysis") if isinstance(obj.get("analysis"), str) else None) or fallback.get("analysis", "")
    out = {
        "content": content,
        "options": options,
        "answer": answer,
        "analysis": analysis,
    }
    for key in ("difficulty", "question_type", "type"):
        if key in obj and obj[key] is not None:
            out[key] = obj[key]
        elif key in fallback and fallback[key] is not None:
            out[key] = fallback[key]
    return out


async def verify_question_async(question: dict, llm_config: Any) -> dict:
    """
    题目校对：调用 LLM 检查并修正单道题目的计算、逻辑、格式与解析。
    入参 question 为题目对象 (content, options, answer, analysis 等)，返回修正后的题目对象 (dict)。
    """
    question_json = json.dumps(question, ensure_ascii=False, indent=2)
    prompt = VERIFY_QUESTION_PROMPT.format(question_json=question_json)
    raw = await _call_llm_async(prompt, llm_config, temperature=0.2)
    cleaned = _strip_json_markdown(raw)
    if not cleaned.strip():
        cleaned = raw
    cleaned = _escape_literal_newlines_in_json(cleaned)
    cleaned = _fix_json_invalid_escapes(cleaned)
    parsed: dict | None = None
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as e:
        _log_raw_on_parse_fail(cleaned, e)
        obj_str = _extract_first_json_object(cleaned)
        if obj_str:
            try:
                parsed = json.loads(obj_str)
            except json.JSONDecodeError:
                pass
        if not parsed:
            repaired = _try_repair_single_json_object(cleaned)
            if repaired:
                try:
                    parsed = json.loads(repaired)
                except json.JSONDecodeError:
                    pass
    if not isinstance(parsed, dict):
        raise ValueError("校对接口返回格式异常，未能解析为题目对象")
    return _normalize_verified_question(parsed, question)


async def _apply_consistency_check_and_verify(
    questions: list[QuestionItem],
    llm_config: Any,
    *,
    concurrency: int = 2,
) -> list[QuestionItem]:
    """
    方案三选项 B：对题目做轻量级题干-解析数字一致性检查；
    若明显不一致则自动调用 verify_question_async 并用校对结果替换该题。
    """
    if not questions:
        return questions
    sem = asyncio.Semaphore(concurrency)

    async def _check_one(index: int, q: QuestionItem) -> tuple[int, QuestionItem]:
        async with sem:
            c = (q.content or "").strip()
            a = (q.analysis or "").strip()
            ans = (q.answer or "").strip()
            if not _is_likely_content_analysis_mismatch(c, a, ans):
                return (index, q)
            q_dict = q.model_dump() if hasattr(q, "model_dump") else dict(q)
            try:
                verified = await verify_question_async(q_dict, llm_config)
                new = QuestionItem(
                    content=verified.get("content") or q.content,
                    options=verified.get("options") if isinstance(verified.get("options"), list) else q.options,
                    answer=verified.get("answer") or q.answer,
                    analysis=verified.get("analysis") or q.analysis,
                    design_logic=q.design_logic,
                    type_tag=verified.get("type") or q.type_tag,
                    question_type=verified.get("question_type") or q.question_type,
                    student_id=q.student_id,
                )
                logger.info("题干-解析一致性检查触发校对并替换第 %s 题", index + 1)
                return (index, new)
            except Exception as e:
                logger.warning("一致性检查后校对第 %s 题失败，保留原题: %s", index + 1, e)
                return (index, q)

    tasks = [_check_one(i, q) for i, q in enumerate(questions)]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    out: list[QuestionItem] = list(questions)
    for r in results:
        if isinstance(r, Exception):
            logger.warning("一致性检查任务异常: %s", r)
            continue
        idx, item = r
        if 0 <= idx < len(out):
            out[idx] = item
    return out


async def generate_analysis_for_questions_async(
    questions: list[dict],
    llm_config: Any,
    *,
    concurrency: int = 3,
) -> list[dict]:
    """
    为导入的题目列表逐题生成解析（analysis）。
    仅根据题目内容调用 LLM，**不使用知识库/RAG**；并发数由 concurrency 限制。
    解析失败则保留原题（含原有 analysis）。返回与输入同序的题目列表，仅 analysis 字段可能被更新。
    """
    if not questions:
        return []

    sem = asyncio.Semaphore(concurrency)

    async def _generate_one(index: int, q: dict) -> tuple[int, str | None]:
        async with sem:
            payload = {
                "content": (q.get("content") or "").strip(),
                "options": q.get("options") if isinstance(q.get("options"), list) else [],
                "answer": (q.get("answer") or "").strip(),
            }
            question_json = json.dumps(payload, ensure_ascii=False, indent=2)
            prompt = GENERATE_ANALYSIS_PROMPT.format(question_json=question_json)
            raw = await _call_llm_async(prompt, llm_config, temperature=0.2, max_tokens=4096)
            cleaned = _strip_json_markdown(raw)
            if not cleaned.strip():
                cleaned = raw
            cleaned = _escape_literal_newlines_in_json(cleaned)
            cleaned = _fix_json_invalid_escapes(cleaned)
            parsed: dict | None = None
            try:
                parsed = json.loads(cleaned)
            except json.JSONDecodeError:
                obj_str = _extract_first_json_object(cleaned)
                if obj_str:
                    try:
                        parsed = json.loads(obj_str)
                    except json.JSONDecodeError:
                        pass
            if isinstance(parsed, dict) and isinstance(parsed.get("analysis"), str):
                return (index, (parsed.get("analysis") or "").strip())
        return (index, None)

    tasks = [_generate_one(i, q) for i, q in enumerate(questions)]
    outcomes = await asyncio.gather(*tasks, return_exceptions=True)

    result = [dict(q) for q in questions]
    for out in outcomes:
        if isinstance(out, Exception):
            logger.warning("生成解析时出错: %s", out, exc_info=True)
            continue
        idx, analysis_text = out
        if idx is not None and analysis_text is not None and 0 <= idx < len(result):
            result[idx]["analysis"] = analysis_text
    return result


async def generate_questions_async(
    request: GenerateRequest,
    llm_config: Any,
) -> list[QuestionItem]:
    """
    根据请求与 llm_config 生成题目。
    - 当 ref_content 存在且 scenario 为 specialized/error_analysis：单次调用，生成 count 道题。
    - 否则：count==1 单次调用；count>1 拆成 count 个单题任务并发执行，合并结果。
    - 当 use_knowledge_base 为 True 时，从 RAG 检索知识点相关上下文并拼入 Prompt。
    """
    count = max(1, min(request.count, 10))
    ref_content = (request.ref_content or "").strip()
    scenario = request.scenario or "default"

    knowledge_base_context: str | None = None
    if getattr(request, "use_knowledge_base", False) and (request.knowledge_point or "").strip():
        try:
            from app.services.rag_service import get_rag_service
            rag = get_rag_service(llm_config=llm_config)
            knowledge_base_context = rag.search_context_for_generation((request.knowledge_point or "").strip(), n_results=RAG_TOP_K)
        except Exception as e:
            logger.warning("RAG 检索失败，将不注入知识库上下文: %s", e)

    rag_used = bool(knowledge_base_context and knowledge_base_context.strip())

    if ref_content and scenario in ("specialized", "error_analysis", "error_crusher"):
        prompt = _build_prompt(request, count=count, diversity_index=None, knowledge_base_context=knowledge_base_context)
        try:
            raw = await _call_llm_async(prompt, llm_config, temperature=0.7)
            parsed = _parse_questions(raw)
            if parsed:
                if len(parsed) != count:
                    logger.warning(
                        "参考题生成数量不符：请求 %s 道，实际返回 %s 道（题型=%s 难度=%s），已截断或全部返回",
                        count, len(parsed), request.question_type, request.difficulty,
                    )
                flat = parsed[:count]
                flat = await _apply_consistency_check_and_verify(flat, llm_config)
                return (flat, rag_used)
            return ([], rag_used)
        except Exception as e:
            logger.warning("基于参考题生成失败: %s", e)
            raise

    if scenario == "sync":
        prompt = _build_prompt(request, count=count, diversity_index=None, knowledge_base_context=knowledge_base_context)
        try:
            raw = await _call_llm_async(prompt, llm_config, temperature=0.6, max_tokens=16384)
            result = _parse_sync_tutoring_response(raw)
            if result.get("questions"):
                if request.student_id is not None:
                    result["questions"] = [
                        q.model_copy(update={"student_id": request.student_id}) for q in result["questions"]
                    ]
                result["questions"] = await _apply_consistency_check_and_verify(result["questions"], llm_config)
            return (result, rag_used)
        except Exception as e:
            logger.warning("同步辅导生成失败: %s", e)
            raise

    if scenario == "assessment":
        prompt = _build_prompt(request, count=count, diversity_index=None, knowledge_base_context=knowledge_base_context)
        try:
            raw = await _call_llm_async(prompt, llm_config, temperature=0.7)
            parsed = _parse_questions(raw)
            if parsed:
                if len(parsed) != count:
                    logger.warning(
                        "摸底卷生成数量不符：请求 %s 道，实际返回 %s 道，已截断或全部返回",
                        count, len(parsed),
                    )
                flat = parsed[:count]
                flat = await _apply_consistency_check_and_verify(flat, llm_config)
                return (flat, rag_used)
            return ([], rag_used)
        except Exception as e:
            logger.warning("新生摸底生成失败: %s", e)
            raise

    # 综合题型且数量 >1：按 40% 选择 / 30% 填空 / 30% 解答 预分配每题题型，再并发请求，既保证混合又保持速度
    q_type_raw = (request.question_type or "").strip()
    if ("综合" in q_type_raw or q_type_raw in ("综合", "综合 (混合题型)")) and count > 1:
        choice_n = max(0, min(count, int(round(count * 0.4))))
        fill_n = max(0, min(count - choice_n, int(round(count * 0.3))))
        solution_n = count - choice_n - fill_n
        type_sequence: list[str] = ["选择"] * choice_n + ["填空"] * fill_n + ["解答"] * solution_n
        if len(type_sequence) < count:
            type_sequence.extend(["解答"] * (count - len(type_sequence)))
        type_sequence = type_sequence[:count]
        requests_by_index = [request.model_copy(update={"question_type": type_sequence[i]}) for i in range(count)]
        tasks = [
            _generate_single(requests_by_index[i], llm_config, i, knowledge_base_context=knowledge_base_context)
            for i in range(count)
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        flat: list[QuestionItem] = []
        for i, r in enumerate(results):
            if isinstance(r, Exception):
                logger.warning("综合题型并发生成第 %s 道题异常（已忽略）: %s", i + 1, r)
                continue
            flat.extend(r[:1] if r else [])
        flat = await _apply_consistency_check_and_verify(flat, llm_config)
        return (flat, rag_used)

    if count == 1:
        result = await _generate_single(request, llm_config, 0, knowledge_base_context=knowledge_base_context)
        result = await _apply_consistency_check_and_verify(result, llm_config)
        return (result, rag_used)

    tasks = [_generate_single(request, llm_config, i, knowledge_base_context=knowledge_base_context) for i in range(count)]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    flat: list[QuestionItem] = []
    for i, r in enumerate(results):
        if isinstance(r, Exception):
            logger.warning("并发生成第 %s 道题异常（已忽略）: %s", i + 1, r)
            continue
        flat.extend(r[:1] if r else [])
    flat = await _apply_consistency_check_and_verify(flat, llm_config)
    return (flat, rag_used)


async def generate_full_exam_paper(
    params: ExamGenerateRequest,
    llm_config: Any,
) -> list[QuestionItem]:
    """
    生成完整试卷：8 选择 + 8 填空 + 12 解答，分 4 个并发任务执行，单块失败不拖垮整体。
    返回顺序：选择题 → 填空题 → 解答题（前 6）→ 解答题（后 6）。
    """
    knowledge_point = (params.knowledge_point or "").strip()
    difficulty = params.difficulty or "L2"
    student_id = getattr(params, "student_id", None)

    knowledge_base_context: str | None = None
    if getattr(params, "use_knowledge_base", False) and knowledge_point:
        try:
            from app.services.rag_service import get_rag_service
            rag = get_rag_service(llm_config=llm_config)
            knowledge_base_context = rag.search_context_for_generation(knowledge_point, n_results=RAG_TOP_K)
        except Exception as e:
            logger.warning("试卷 RAG 检索失败，将不注入知识库上下文: %s", e)
    rag_used = bool(knowledge_base_context and knowledge_base_context.strip())

    def _is_valid_choice(q: QuestionItem) -> bool:
        if not q.options or len(q.options) < 2:
            return False
        content = (q.content or "").strip()
        if content.startswith("填空题：") or content.startswith("填空题:"):
            return False
        if content.startswith("解答题：") or content.startswith("解答题:"):
            return False
        if "______" in content or "_____" in content:
            return False
        return True

    async def _run_part(question_type: str, count: int, part_name: str) -> list[QuestionItem]:
        request = GenerateRequest(
            knowledge_point=knowledge_point,
            difficulty=difficulty,
            question_type=question_type,
            count=count,
            scenario="default",
        )
        max_attempts = 2  # 各分块均重试一次，减少截断/解析失败导致整块缺失
        best_items: list[QuestionItem] = []

        for attempt in range(max_attempts):
            try:
                prompt = _build_prompt(
                    request,
                    count=count,
                    knowledge_base_context=knowledge_base_context,
                    exam_part=question_type,
                )
                raw = await _call_llm_async(
                    prompt, llm_config, temperature=0.7, max_tokens=16384
                )
                parsed = _parse_questions(raw)
                raw_list = parsed or []
                if question_type == "选择":
                    items = [q for q in raw_list if _is_valid_choice(q)]
                    dropped = len(raw_list) - len(items)
                    if dropped > 0:
                        logger.warning(
                            "试卷分块 %s 过滤掉 %s 道无选项/格式不符的题目，保留 %s 道",
                            part_name,
                            dropped,
                            len(items),
                        )
                    if len(items) > len(best_items):
                        best_items = items
                    if len(best_items) >= count:
                        break
                else:
                    items = []
                    for q in raw_list:
                        content = (q.content or "").strip()
                        # 去掉题干前误加的「填空题：」「解答题：」前缀，避免与分区标题矛盾
                        for prefix in ("填空题：", "填空题:", "解答题：", "解答题:"):
                            if content.startswith(prefix):
                                content = content[len(prefix) :].strip()
                                break
                        updates = {}
                        if content != (q.content or ""):
                            updates["content"] = content
                        if question_type in ("填空", "解答") and q.options:
                            updates["options"] = []
                        if updates:
                            q = q.model_copy(update=updates)
                        items.append(q)
                    best_items = items[:count]
                    break
            except Exception as e:
                logger.warning(
                    "试卷分块 %s 第 %s 次尝试失败: %s (%s) args=%s",
                    part_name,
                    attempt + 1,
                    e,
                    type(e).__name__,
                    getattr(e, "args", ()),
                )
                if attempt == max_attempts - 1:
                    break  # 最后一次尝试失败也返回已收集的 best_items（可能为空）

        items = best_items[:count]
        if len(items) < count:
            logger.warning("试卷分块 %s 请求 %s 道，实际返回 %s 道", part_name, count, len(items))
        return items

    task_choice = _run_part("选择", 8, "选择题")
    task_fill = _run_part("填空", 8, "填空题")
    task_solution_1 = _run_part("解答", 6, "解答题(1)")
    task_solution_2 = _run_part("解答", 6, "解答题(2)")

    results = await asyncio.gather(task_choice, task_fill, task_solution_1, task_solution_2, return_exceptions=True)

    parts: list[list[QuestionItem]] = []
    part_names = ["选择题", "填空题", "解答题(1)", "解答题(2)"]
    for i, r in enumerate(results):
        if isinstance(r, Exception):
            logger.warning("试卷分块 %s 异常: %s", part_names[i], r)
            parts.append([])
        else:
            parts.append(r or [])

    flat: list[QuestionItem] = []
    for p in parts:
        flat.extend(p)

    if student_id is not None:
        flat = [q.model_copy(update={"student_id": student_id}) for q in flat]

    flat = await _apply_consistency_check_and_verify(flat, llm_config)
    return (flat, rag_used)
