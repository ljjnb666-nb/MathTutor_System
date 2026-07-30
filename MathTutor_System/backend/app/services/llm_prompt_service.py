from app.core.prompts import (
    ASSESSMENT_PROMPT,
    ERROR_ANALYSIS_REF_PROMPT,
    ERROR_CRUSHER_REF_PROMPT,
    EXAM_PART_INSTRUCTIONS,
    MATH_GENERATION_PROMPT,
    REF_IGNORE_KNOWLEDGE_POINT,
    SCENARIO_INSTRUCTIONS,
    SPECIALIZED_REF_PROMPT,
    SYNC_TUTORING_PROMPT,
)
from app.schemas.generation import GenerateRequest


def build_generation_prompt(
    request: GenerateRequest,
    count: int = 1,
    diversity_index: int | None = None,
    knowledge_base_context: str | None = None,
    exam_part: str | None = None,
) -> str:
    ref_content = (request.ref_content or "").strip()
    scenario = request.scenario or "default"
    kb_prefix = ""
    if knowledge_base_context and knowledge_base_context.strip():
        kb_prefix = f"参考本地知识库内容：\n{knowledge_base_context.strip()}\n\n任务：请基于上述资料生成题目。\n\n"

    if scenario == "specialized":
        if ref_content:
            base = REF_IGNORE_KNOWLEDGE_POINT + SPECIALIZED_REF_PROMPT.format(
                ref_content=ref_content,
                question_type=request.question_type,
                difficulty=request.difficulty,
                count=count,
            )
            return kb_prefix + base
        base_prompt = MATH_GENERATION_PROMPT.format(
            knowledge_point=request.knowledge_point,
            question_type=request.question_type,
            difficulty="L4-L5 (High)",
            count=count,
        )
        final_prompt = (
            "User Intent: Generate intensive reinforcement questions for weak knowledge points. "
            "针对该知识点的重难点和易错点，生成高难度的强化练习题。\n\n" + base_prompt
        )
        if kb_prefix:
            final_prompt = kb_prefix + final_prompt
        return final_prompt

    if ref_content and scenario == "error_analysis":
        base = REF_IGNORE_KNOWLEDGE_POINT + ERROR_ANALYSIS_REF_PROMPT.format(
            ref_content=ref_content,
            question_type=request.question_type,
            difficulty=request.difficulty,
            count=count,
        )
        return kb_prefix + base

    if ref_content and scenario == "error_crusher":
        base = REF_IGNORE_KNOWLEDGE_POINT + ERROR_CRUSHER_REF_PROMPT.format(
            ref_content=ref_content,
            question_type=request.question_type,
            difficulty=request.difficulty,
            count=count,
        )
        return kb_prefix + base

    if scenario == "sync":
        return kb_prefix + SYNC_TUTORING_PROMPT.format(
            knowledge_point=request.knowledge_point,
            count=count,
        )

    if scenario == "assessment":
        base = ASSESSMENT_PROMPT.format(
            knowledge_point=request.knowledge_point,
            question_type="综合 (混合题型)",
            count=count,
        )
        return "You are a Diagnostic Exam Generator. Output JSON only.\n" + kb_prefix + base

    prompt = MATH_GENERATION_PROMPT.format(
        knowledge_point=request.knowledge_point,
        difficulty=request.difficulty,
        question_type=request.question_type,
        count=count,
    )
    if kb_prefix:
        prompt = kb_prefix + prompt

    scenario_extra = SCENARIO_INSTRUCTIONS.get(scenario, "")
    if scenario_extra:
        prompt = prompt + "\n\n" + scenario_extra

    if diversity_index is not None and diversity_index > 0:
        prompt += f"\n\n（这是第 {diversity_index + 1} 道题，请从不同角度或不同考查点出题，避免与其它题目重复。）"

    if exam_part and exam_part.strip():
        extra = EXAM_PART_INSTRUCTIONS.get(exam_part.strip())
        if extra:
            prompt += "\n\n" + extra

    return prompt
