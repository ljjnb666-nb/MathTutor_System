#!/bin/sh
set -e
# 确保数据目录存在
mkdir -p /app/data/vector_store
# 管理员 bootstrap 与否取决于数据库是否“已初始化”（存在 TutorPro 应用表），
# 而不是数据库文件是否存在：空文件 / 仅含无关表的 SQLite 同样视为未初始化。
# 未初始化 -> create_superuser.py 强制要求 BOOTSTRAP_ADMIN_PASSWORD（凭证缺失或
#   无效时以非零码退出，set -e 确保此时不建 schema、不启动 uvicorn，fail closed）。
# 已初始化 -> 直接执行数据库 bootstrap（确定性迁移到 head），无需 bootstrap 密码。
# 探测本身失败（退出码 2）-> 一律 fail closed，不得继续启动。
probe_rc=0
python scripts/db_schema_probe.py || probe_rc=$?
if [ "$probe_rc" -eq 1 ]; then
  python scripts/create_superuser.py
elif [ "$probe_rc" -ne 0 ]; then
  echo "ERROR: unable to determine database initialization state (probe rc=$probe_rc)." >&2
  exit 1
fi
python scripts/bootstrap_database.py
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
