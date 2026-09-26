#!/bin/sh
set -e
# 确保数据目录存在
mkdir -p /app/data/vector_store
# 仅当数据库不存在（首次部署）时执行管理员 bootstrap：凭证通过
# BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD 环境变量提供，无固定默认密码。
# 凭证缺失或无效时脚本以非零码退出，set -e 确保此时既不建库也不会启动 uvicorn（fail closed）。
# 管理员 bootstrap 成功后才执行数据库 bootstrap（建最新 schema/迁移到 head/种子数据）。
# 已有数据库：直接执行数据库 bootstrap（确定性迁移到 head），无需 bootstrap 密码。
if [ ! -f /app/data/math_tutor.db ]; then
  python scripts/create_superuser.py
fi
python scripts/bootstrap_database.py
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
