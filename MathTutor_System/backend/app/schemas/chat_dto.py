"""
AI 对话请求/响应 Schema
"""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

# SEC-08：AI 输入预算。数量 / 单条 / 总量都有上限，防止内存与 provider token 放大。
MAX_CHAT_MESSAGES = 40
MAX_CHAT_MESSAGE_CHARS = 8000
MAX_CHAT_TOTAL_CHARS = 50_000


class ChatMessage(BaseModel):
    """单条对话消息；role 只允许 user / assistant，客户端不得注入 system。"""

    role: Literal["user", "assistant"] = Field(..., description="user 或 assistant")
    content: str = Field(..., min_length=1, max_length=MAX_CHAT_MESSAGE_CHARS, description="消息内容")


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(
        ...,
        min_length=1,
        max_length=MAX_CHAT_MESSAGES,
        description=f"对话历史（含本轮用户消息，1-{MAX_CHAT_MESSAGES} 条）",
    )
    session_id: int | None = Field(None, description="可选，已有会话 ID，传则在本会话追加消息")
    student_id: int | None = Field(None, ge=1, description="可选，当前辅导学生 ID，须归属当前用户")
    knowledge_point: str | None = Field(None, max_length=255, description="可选，知识点，用于系统提示与 RAG")
    use_knowledge_base: bool = Field(False, description="是否结合知识库检索（需同时提供 knowledge_point）")
    context_question: str | None = Field(
        None,
        max_length=12000,
        description="可选，用户当前关注的题目全文，AI 可针对此题讲解、出变式或指出易错点",
    )

    @model_validator(mode="after")
    def _check_total_budget(self) -> "ChatRequest":
        total = sum(len(message.content) for message in self.messages)
        if total > MAX_CHAT_TOTAL_CHARS:
            raise ValueError(f"对话消息总长度不能超过 {MAX_CHAT_TOTAL_CHARS} 字符")
        return self


class ChatResponse(BaseModel):
    content: str = Field(..., description="AI 本轮回复文本")
    session_id: int | None = Field(None, description="本次对话所属会话 ID（新建或已有）")
    rag_used: bool = Field(False, description="本轮是否使用了知识库检索")
    rag_sources: list[str] = Field(default_factory=list, description="参考的知识库文档来源（文件名列表），供「参考自」展示")


class ChatSessionItem(BaseModel):
    id: int
    student_id: int | None
    title: str | None
    pinned: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatSessionPinUpdate(BaseModel):
    """会话固定/取消固定"""

    pinned: bool = Field(..., description="是否固定")


class ChatMessageItem(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatMessageUpdate(BaseModel):
    """更新单条消息内容（仅支持 user 消息）"""

    content: str = Field(..., min_length=1, max_length=MAX_CHAT_MESSAGE_CHARS, description="新内容")
