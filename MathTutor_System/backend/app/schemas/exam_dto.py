"""
试卷 DTO：创建与响应结构。

questions 支持两种形态：
- Mode A: list[QuestionItem] — 传统试卷题目列表
- Mode B: dict — 辅导讲义 { "knowledge_card": {...}, "examples": [...], "questions": [...] }
"""
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.schemas.generation import QuestionItem


class ExamCreate(BaseModel):
    """保存试卷请求"""

    title: str | None = Field(default=None, description="试卷标题，空则使用「未命名试卷 {date}」")
    student_id: int | None = Field(default=None, description="关联学生 ID，可选；空且带 assignment_date 时为当日作业草稿")
    questions: list[QuestionItem] | dict = Field(
        ...,
        description="Mode A: 题目列表；Mode B: { knowledge_card, examples, questions } 辅导讲义",
    )
    assignment_date: date | None = Field(default=None, description="作业日期，用于按日期管理")


class ExamResponse(BaseModel):
    """试卷响应"""

    id: int
    title: str
    student_id: int | None
    questions: list[dict] | dict = Field(
        default_factory=list,
        description="Mode A: 题目快照列表；Mode B: 辅导讲义对象",
    )
    created_at: datetime
    assignment_date: date | None = Field(default=None, description="作业日期")
    graded_at: datetime | None = Field(default=None, description="学生提交批改时间，未提交为 null")
    grade_summary: dict | None = Field(default=None, description="答题统计 { correct, total }，未提交为 null")
    grade_results: list[dict] | None = Field(default=None, description="每道题批改结果 [{ question_index, is_correct }]，未提交为 null")

    model_config = {"from_attributes": True}


class ExamUpdate(BaseModel):
    """更新试卷（作业草稿）"""

    title: str | None = None
    questions: list[QuestionItem] | dict | None = None
    assignment_date: date | None = None


class ExamResponseWithStudent(ExamResponse):
    """试卷响应（含学生姓名，教师端列表用）"""

    student_name: str | None = Field(default=None, description="关联学生姓名")


class GradeResultItem(BaseModel):
    """单题批改结果（使用题目在试卷中的索引，适配 JSON 存储无 ID 的题目）"""

    question_index: int = Field(..., ge=0, description="题目在试卷题目数组中的索引")
    is_correct: bool = Field(..., description="是否答对")
    error_type: str | None = Field(
        default=None,
        description="答错时的错误类型：计算错误 | 概念不清 | 审题失误 | 完全不会，可选",
    )


class GradeRequest(BaseModel):
    """提交试卷批改结果请求（批改 API 请求体）。"""

    results: list[GradeResultItem] = Field(..., description="各题批改结果")
    student_id: int | None = Field(
        default=None,
        description="学生 ID，用于错题本归属。通用试卷（exam 无 student_id）时由前端必传；有则优先用试卷关联的 student_id",
    )


class GradeResponse(BaseModel):
    """批改结果响应"""

    graded: int = Field(..., description="参与批改的题目数")
    mistakes_added: int = Field(..., description="新增/更新到错题本的数量")
    grade_summary: dict | None = Field(default=None, description="答题统计 { correct, total }，学生端提交答案时返回")
    grade_results: list[dict] | None = Field(default=None, description="每道题对错 [{ question_index, is_correct }]，学生端提交答案时返回")


class StudentAnswerItem(BaseModel):
    """学生单题答案（系统判题用）；解答题可仅传 is_correct 自评。"""

    question_index: int = Field(..., ge=0, description="题目在试卷中的索引")
    student_answer: str = Field(default="", description="学生答案：选择题为选项字母；填空为文本；解答题可不填")
    is_correct: bool | None = Field(
        default=None,
        description="解答题自评时必传：学生自判对错；选择/填空由系统判题，不传或忽略",
    )


class SubmitAnswersRequest(BaseModel):
    """学生端提交答案请求（系统判题，不再自评）"""

    student_answers: list[StudentAnswerItem] = Field(..., description="各题学生答案")


# 别名：便于按「批改请求」查找
ExamGradeRequest = GradeRequest
