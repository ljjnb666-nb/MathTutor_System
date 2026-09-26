#!/bin/sh
set -e
# 确保数据目录存在
mkdir -p /app/data/vector_store
# 仅当数据库不存在（首次部署）时执行 bootstrap：管理员凭证通过
# BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD 环境变量提供，无固定默认密码。
# 凭证缺失或无效时脚本以非零码退出，set -e 确保此时 uvicorn 不会启动（fail closed）。
if [ ! -f /app/data/math_tutor.db ]; then
  python scripts/create_superuser.py
fi
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
