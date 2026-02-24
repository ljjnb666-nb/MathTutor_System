"""
测试生成解析：用 mock 模拟 AI 返回（含截断），验证能解析出题目。
运行: 在 backend 目录下执行  python -m tests.test_generate_parse
"""
import asyncio
import sys
from unittest.mock import AsyncMock, patch

# 确保 app 可导入
sys.path.insert(0, ".")

from app.schemas.generation import GenerateRequest
from app.services.llm_service import generate_questions_async, _parse_questions


# 用户日志中的真实截断返回（```json 开头，analysis 未写完）
TRUNCATED_RAW = r"""```json
{
  "questions": [
    {
      "content": "在 $\\triangle ABC$ 中，$AC = 6$，$BC = 8$。求四边形面积。",
      "options": ["A. 1", "B. 2", "C. 3", "D. 4"],
      "answer": "D. 4",
      "analysis": "1. 由勾股定理，$AB = 
"""


def test_parse_truncated():
    """用户日志中的截断内容应能通过截断修复解析出 1 题。"""
    result = _parse_questions(TRUNCATED_RAW)
    assert len(result) >= 1, "应至少解析出 1 道题"
    q = result[0]
    assert q.content
    assert q.answer
    assert "D" in q.answer or "4" in q.answer
    print("test_parse_truncated OK:", len(result), "题")


async def test_generate_mocked():
    """mock LLM 返回截断内容时，generate_questions_async 应返回至少 1 题。"""
    from app.core.deps import LLMConfig

    request = GenerateRequest(
        knowledge_point="勾股定理",
        difficulty="L4",
        question_type="选择",
        count=1,
    )
    config = LLMConfig(
        provider="deepseek",
        api_key="test-key",
        base_url="https://api.deepseek.com",
        model="deepseek-chat",
    )

    with patch("app.services.llm_service._call_llm_async", new_callable=AsyncMock) as m:
        m.return_value = TRUNCATED_RAW
        questions = await generate_questions_async(request, config)
    assert len(questions) >= 1, "mock 截断返回时应解析出至少 1 题"
    assert questions[0].content
    assert questions[0].answer
    print("test_generate_mocked OK:", len(questions), "题")


async def test_concurrent_keyerror_swallowed():
    """并发生成时单题 KeyError 应被吞掉，返回其余题，不抛异常。"""
    from app.core.deps import LLMConfig

    request = GenerateRequest(
        knowledge_point="勾股定理",
        difficulty="L2",
        question_type="填空",
        count=3,
    )
    config = LLMConfig(
        provider="openai",
        api_key="test-key",
        base_url="https://api.openai.com",
        model="gpt-4o-mini",
    )
    call_count = 0

    async def mock_call(prompt, llm_config, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise KeyError('"questions"')
        return '{"questions":[{"content":"题' + str(call_count) + '","options":[],"answer":"1","analysis":""}]}'

    with patch("app.services.llm_service._call_llm_async", side_effect=mock_call):
        questions = await generate_questions_async(request, config)
    # 第 1 题 KeyError 被吞掉返回 []，第 2、3 题正常，应得到 2 题
    assert isinstance(questions, list), "应返回列表"
    assert len(questions) >= 1, "至少应得到 1 题（第 2、3 题成功）"
    print("test_concurrent_keyerror_swallowed OK:", len(questions), "题")


if __name__ == "__main__":
    test_parse_truncated()
    asyncio.run(test_generate_mocked())
    asyncio.run(test_concurrent_keyerror_swallowed())
    print("--- 全部通过 ---")
