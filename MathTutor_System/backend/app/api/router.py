"""
API 路由汇总
"""
from fastapi import APIRouter

from app.api.endpoints import analysis, auth, chat, dashboard, exams, generation, mistakes, orders, plans, question_bank, questions, rag, reports, schedule, students, subscription as subscription_ep, student_router, tools, upload, users

api_router = APIRouter()

api_router.include_router(auth.router, prefix="", tags=["认证"])
api_router.include_router(plans.router, prefix="/plans", tags=["套餐"])
api_router.include_router(subscription_ep.router, prefix="/subscription", tags=["订阅"])
api_router.include_router(orders.router, prefix="", tags=["订单与支付"])
api_router.include_router(users.router, prefix="/users", tags=["管理员管理"])
api_router.include_router(generation.router, prefix="", tags=["智能出题"])  # POST /api/generate
api_router.include_router(chat.router, prefix="/chat", tags=["AI 对话"])
api_router.include_router(questions.router, prefix="/questions", tags=["questions"])
api_router.include_router(question_bank.router, prefix="/bank", tags=["题库收藏"])
api_router.include_router(students.router, prefix="/students", tags=["学生管理"])
api_router.include_router(schedule.router, prefix="/schedules", tags=["排课"])
api_router.include_router(exams.router, prefix="/exams", tags=["试卷"])
api_router.include_router(mistakes.router, prefix="/mistakes", tags=["错题本"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["仪表盘"])
api_router.include_router(rag.router, prefix="/rag", tags=["RAG 知识库"])
api_router.include_router(upload.router, prefix="/upload", tags=["上传解析"])
api_router.include_router(tools.router, prefix="/tools", tags=["工具"])
api_router.include_router(analysis.router, prefix="/analysis", tags=["学情分析"])
api_router.include_router(reports.router, prefix="/reports", tags=["学习报告"])
api_router.include_router(student_router.router, prefix="/student", tags=["学生端"])