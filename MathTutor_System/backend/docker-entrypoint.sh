#!/bin/sh
set -e
# 确保数据目录存在
mkdir -p /app/data/vector_store
# 若数据库已存在则跳过；否则创建表并创建超级用户 admin/123456
if [ ! -f /app/data/math_tutor.db ]; then
  python scripts/create_superuser.py
fi
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
