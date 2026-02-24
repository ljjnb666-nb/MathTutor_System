"""
学生 Pydantic DTO：创建、更新、响应及标签操作
"""
from datetime import datetime

from pydantic import BaseModel, Field


class StudentCreate(BaseModel):
    """新增学生"""

    name: str = Field(..., min_length=1, max_length=128, description="姓名")
    grade: str = Field(..., min_length=1, max_length=64, description="年级，如 八年级")
    class_name: str = Field(..., min_length=1, max_length=64, description="班级，如 3班")
    tags: list[str] = Field(default_factory=list, description="标签，如 [数学课代表, 几何弱项]")
    login_code: str | None = Field(None, min_length=1, max_length=32, description="学生端登录码，唯一")
    password: str | None = Field(None, min_length=1, max_length=128, description="学生端登录密码（可选）")


class StudentUpdate(BaseModel):
    """修改学生信息（部分字段可选）"""

    name: str | None = Field(None, min_length=1, max_length=128, description="姓名")
    grade: str | None = Field(None, min_length=1, max_length=64, description="年级")
    class_name: str | None = Field(None, min_length=1, max_length=64, description="班级")
    tags: list[str] | None = Field(None, description="标签列表")
    performance_score: int | None = Field(None, ge=0, le=100, description="综合评分 0-100")
    login_code: str | None = Field(None, min_length=1, max_length=32, description="学生端登录码，唯一")
    password: str | None = Field(None, min_length=1, max_length=128, description="学生端登录密码（可选）")


class StudentResponse(BaseModel):
    """学生完整响应"""

    id: int
    name: str
    grade: str
    class_name: str
    tags: list[str]
    performance_score: int
    created_at: datetime
    login_code: str | None = None

    model_config = {"from_attributes": True}


class StudentTagsUpdate(BaseModel):
    """快速添加/删除标签（学情分析用）"""

    add: list[str] = Field(default_factory=list, description="要添加的标签")
    remove: list[str] = Field(default_factory=list, description="要删除的标签")


class StudentMeResponse(BaseModel):
    """学生端「我的信息」响应（不含登录码与密码）"""

    id: int
    name: str
    grade: str
    class_name: str
    tags: list[str]
    performance_score: int
    created_at: datetime

    model_config = {"from_attributes": True}


class StudentLoginRequest(BaseModel):
    """学生端登录请求"""

    login_code: str = Field(..., min_length=1, max_length=32, description="登录码")
    password: str | None = Field(None, max_length=128, description="密码（若已设置则必填）")


class StudentPasswordUpdate(BaseModel):
    """学生端修改密码请求"""

    old_password: str = Field(..., min_length=1, max_length=128, description="当前密码")
    new_password: str = Field(..., min_length=1, max_length=128, description="新密码")
