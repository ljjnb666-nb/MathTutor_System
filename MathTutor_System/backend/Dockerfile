# 初中数学备课助手 - 后端
# Python 3.10+，FastAPI + SQLite + ChromaDB
FROM python:3.11-slim

WORKDIR /app

# 系统依赖（可选：LibreOffice 用于含图 PDF 解析，按需取消注释）
# RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-writer libreoffice-common \
#     && rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 应用代码
COPY app ./app
COPY scripts ./scripts

# 数据目录（SQLite、RAG 向量库由 volume 挂载到 /app 下）
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

EXPOSE 8000

# 启动时创建 data 目录；入口脚本会在首次启动时创建超级用户
RUN mkdir -p /app/data/vector_store
COPY docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

# 非 root 运行（安全最佳实践）：数据目录属主授予 appuser，
# 命名卷首次挂载会继承镜像内目录属主。存量 root 属主卷需一次性
# 迁移属主（docker compose run --rm -u root backend chown -R appuser:appuser /app/data）。
RUN groupadd -r appuser && useradd -r -g appuser -m -d /home/appuser appuser \
    && chown -R appuser:appuser /app/data /home/appuser

USER appuser

# 数据库与向量库通过 volume 挂载到 /app/data，由 docker-compose 配置
ENTRYPOINT ["/app/docker-entrypoint.sh"]
