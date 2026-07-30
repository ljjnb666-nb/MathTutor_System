# MathTutor System - 初中数学备课助手
基于 **FastAPI + React** 的数学出题与题库管理系统，支持按知识点、难度、题型一键生成题目，并可将题目保存到本地题库。**需登录后使用**，区分管理员/教师（User）与学生档案（Student），学生数据按登录用户隔离。

## 功能概览

- **登录系统**：JWT 认证，支持密码显隐切换；首次使用需运行脚本创建超级用户（admin / 123456）。
- **智能出题**：设置知识点、难度（L1～L5）、题型（选择/填空/解答/综合）与题量，调用大模型生成数学题；支持单题「重新生成」；生成结果与筛选参数会持久化到浏览器本地。
- **题库管理**：查看、搜索已保存题目。
- **导入试卷**：上传 .docx 或 .pdf 试卷，AI 解析为结构化题目；含图试卷会先转 PDF 再按页识图（需安装 LibreOffice），否则使用纯文本解析；综合与探究、综合与实践等多小节大题会自动合并为一道，其它带【小节】的大题也会尽量合并；支持题型映射、批量编辑（知识点/难度）、查重反馈后录入题库。
- **Magic PPT**：根据主题或教材章节一键生成讲课用 PPT（需配置 LLM）。
- **错题本**：按学生、是否已掌握筛选错题，支持标记已掌握；支持复习计划与「今日待复习」筛选。
- **学情图谱**：教材目录下展示知识点掌握情况，红色=需加强（弱项）、绿色=已掌握；支持按弱项一键出题、跳转错题本。
- **学情趋势**：仪表盘按周展示当前学生「新增错题」与「新掌握」趋势图（近 8 周）。
- **我的试卷**：创建、预览、批改试卷，批改结果可写入错题本。
- **学生管理与总览**：学生信息维护、当前学生切换；可为学生设置**学生端登录码**与密码（选填），卡片展示每人待攻克错题数、今日待复习数、弱项数，可一键跳转学情图谱/错题本/首页；学生归属当前登录用户，数据隔离。
- **学生端（独立前端）**：学生使用登录码（及可选密码）登录独立学生端（`frontend-student`），可查看自己的错题本、学情图谱、学情趋势、我的试卷（做题并提交批改结果写入错题本）；与教师端共用同一后端，数据按学生隔离。
- **用户管理**：管理员/教师账号的添加与删除（仅管理员可见，路径 `/admin-users`）。
- **套餐与定价**：SaaS 订阅制，支持免费版（3 名学生）、基础版（15 名 + 知识库）、专业版（50 名 + 知识库 + Magic PPT）；侧栏展示当前套餐与已用学生数，超限或功能未开通时提示升级（路径 `/pricing`）。管理员不受套餐限制。
- **设置**：配置 LLM 服务商、API Key、Base URL、模型（如 DeepSeek），请求时通过请求头传给后端。

## 技术栈与结构

- **backend/**：FastAPI + SQLAlchemy + Pydantic；SQLite 数据库（`math_tutor.db`）；JWT 认证（bcrypt + python-jose）；LLM 对接（OpenAI 兼容 / DeepSeek 等）；API 前缀 `/api`。
- **frontend/**：教师端，Vite + React + Tailwind；AuthContext 登录态；ProtectedRoute / AdminRoute 保护页面；数学公式渲染（KaTeX / react-latex-next）；响应式布局（侧栏 + 移动端抽屉）。
- **frontend-student/**：学生端，独立 Vite + React 项目；学生使用登录码登录，仅可访问自己的错题本、学情、试卷；开发端口 5174，生产可部署至同一域名子路径（如 `/student`）或不同端口/子域。

### 后端目录（backend/app）

| 目录 | 说明 |
|------|------|
| `api/endpoints/` | 路由：auth、users、plans、subscription、orders、generation、questions、question_bank(/bank)、students、mistakes、exams、dashboard、analysis、rag、reports、tools、upload、**student_router（学生端 /api/student）** |
| `core/` | 配置、安全（密码/JWT）、依赖、订阅校验（get_current_subscription、require_plan_capacity、require_feature）、提示词 |
| `models/` | SQLAlchemy 模型：User、Student、Plan、Subscription、Order、Question、QuestionBank、Exam、Mistake 等 |
| `schemas/` | Pydantic 请求/响应模型 |
| `services/` | LLM 引擎、RAG、文件解析、PPT 生成等业务逻辑 |

### 前端目录（frontend/src）

| 目录 | 说明 |
|------|------|
| `pages/` | 登录、首页（含学情趋势）、智能出题、题库、错题本、学情图谱、试卷列表/导入/预览、Magic PPT、学生管理与总览、套餐与定价、用户管理 |
| `components/` | Layout、Sidebar、FilterPanel、QuestionCard、ProtectedRoute、AdminRoute 等 |
| `contexts/` | AuthContext、SubscriptionContext、StudentContext、SmartGenContext |
| `services/api.js` | Axios 封装，请求头携带 Token 与 LLM 配置 |

## 运行方式

### 1. 后端（需 Python 3.10+）

```bash
cd MathTutor_System/backend
python -m venv .venv
.venv\Scripts\activate   # Windows
# source .venv/bin/activate   # Linux / macOS
pip install -r requirements.txt
```

**首次使用需创建超级用户**（否则无法登录）：

```bash
.venv\Scripts\python.exe scripts/create_superuser.py
```

默认账号：**用户名 `admin`，密码 `123456`**。若已存在 admin 会提示跳过。

启动 API 服务：

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

数据库文件为 `backend/math_tutor.db`（SQLite）。若删除该文件后重启后端，表会按模型重新创建，需再次执行 `create_superuser.py` 创建管理员。

**历史学生归属**：若数据库中已有无 `user_id` 的学生记录，可运行以下脚本将其挂到指定用户（默认用户名 LJJ）：

```bash
.venv\Scripts\python.exe scripts/assign_orphan_students.py
# 或指定用户：.venv\Scripts\python.exe scripts/assign_orphan_students.py --username LJJ
```

脚本会自动检测并在缺失时为 `students` 表添加 `user_id` 列。

**补全订阅**：从旧版升级或数据修复时，若部分用户没有订阅记录，可运行以下脚本。会先确保存在默认套餐（免费/基础/专业），再为所有无订阅用户创建订阅（默认免费版）：

```bash
.venv\Scripts\python.exe scripts/ensure_subscriptions.py
# 仅处理指定用户：
.venv\Scripts\python.exe scripts/ensure_subscriptions.py --username admin
# 为补全用户绑定基础版或专业版：
.venv\Scripts\python.exe scripts/ensure_subscriptions.py --plan basic
```

### 2. 前端

```bash
cd MathTutor_System/frontend  
npm install
npm run dev
```

若 `npm audit` 仍报 KaTeX 漏洞（来自 react-latex-next 的嵌套依赖），请先关闭所有占用前端的进程（如停掉 `npm run dev`），再执行：

```bash
npm run security-install
```

或手动删除 `package-lock.json` 与 `node_modules` 后重新 `npm install`。项目已通过 overrides 强制使用 KaTeX 0.16.21 以修复安全问题。

浏览器访问开发地址（如 http://localhost:5173）。未登录会跳转到登录页，使用 admin / 123456 登录后可进入首页；侧栏按「出题与内容」「学情与练习」「系统管理」分组，可切换智能出题、题库管理、导入试卷、Magic PPT、错题本、学情图谱、我的试卷、学生管理、套餐与定价、用户管理（仅管理员）等；底部会显示当前套餐与已用学生数。

**注意**：前端通过 Vite 代理将 `/api` 转发到 `http://localhost:8000`，**请先启动后端**，否则请求会报连接失败或超时。

### 3. 学生端前端（可选）

学生使用「登录码 + 密码（若已设置）」登录学生端，查看自己的错题本、学情图谱、我的试卷等。教师需在「学生管理」中为学生设置登录码（及可选密码）后，将学生端地址与登录码告知学生。

```bash
cd MathTutor_System/frontend-student
npm install
npm run dev
```

浏览器访问 http://localhost:5174 ，使用教师提供的登录码登录。生产环境可将学生端构建产物部署到同一域名的 `/student` 路径（Vite 配置 `base: '/student/'`）或单独子域。

## Docker 部署

使用 Docker 一键启动后端 + 教师端 + 学生端，无需本地安装 Python/Node。

### 前置要求

- 已安装 [Docker](https://docs.docker.com/get-docker/) 与 [Docker Compose](https://docs.docker.com/compose/install/)（Docker Desktop 已包含）。

### 启动

在项目根目录 `MathTutor_System/` 下执行：

```bash
cd MathTutor_System
docker compose up -d
```

- **教师端**：浏览器访问 http://localhost/
- **学生端**：http://localhost/student/
- **后端 API**：由 Nginx 代理到容器内后端，前端请求 `/api` 即可。

首次启动时会自动创建 SQLite 数据库并初始化超级用户：**用户名 `admin`，密码 `123456`**。数据（数据库、RAG 向量库）保存在 Docker volume `backend_data` 中，重启或重建容器不会丢失。

### 环境变量（可选）

在 `MathTutor_System/` 下创建 `.env` 文件（与 `docker-compose.yml` 同目录），可覆盖默认配置，例如：

```env
# 生产环境务必修改
SECRET_KEY=你的随机长密钥
# 若通过域名或非 localhost 访问，需填写 CORS
CORS_ORIGINS=https://你的域名,http://你的IP

# LLM（也可在前端「设置」中配置）
LLM_API_KEY=你的DeepSeek或OpenAI等Key
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-chat
```

支持与 `backend/.env.example` 中一致的所有变量（如 `DEEPSEEK_*`、`RAG_TOP_K`、支付宝/微信支付等）。

### 常用命令

```bash
# 查看日志
docker compose logs -f

# 仅重建并启动 web（改过前端代码时）
docker compose up -d --build web

# 进入后端容器执行脚本（如补全订阅、分配孤儿学生）
docker compose exec backend python scripts/ensure_subscriptions.py
docker compose exec backend python scripts/assign_orphan_students.py

# 停止并删除容器（保留 volume 数据）
docker compose down
```

### 端口与数据

- 宿主机 **80** 端口映射到 Nginx；若 80 被占用，可在 `docker-compose.yml` 的 `web` 服务中改为 `"8080:80"` 等。
- 数据库与 RAG 向量库路径在容器内为 `/app/data`，通过 volume `backend_data` 持久化。

## 生产部署（Nginx）

部署到服务器（如 AWS）且使用 Nginx 反向代理时，按以下方式配置即可。

### 前端

- 构建：`cd MathTutor_System/frontend && npm run build`
- 将 `dist/` 目录部署到 Nginx 根或子路径（如 `/` 或 `/app`）。前端已使用**相对路径**请求 API（`baseURL` 为空），请求会发往「当前域名/api」，无需再改前端代码。
- 若前端放在子路径（如 `/app`），需在 Vite 中配置 `base: '/app/'` 后重新构建。

### Nginx

将 `/api` 反向代理到后端（如 `http://127.0.0.1:8000`）。示例：

```nginx
server {
    listen 80;
    server_name 你的域名或公网IP;
    root /path/to/frontend/dist;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

如需 HTTPS，在 Nginx 层配置证书（如 Let's Encrypt）。

### 后端环境变量

完整示例见 **`backend/.env.example`**（复制为 `.env` 后按需填写，勿提交 `.env` 到版本库）。

**生产环境必填**：

- **SECRET_KEY**：JWT 签名密钥，勿使用默认值（见下方「其他说明」）。
- **CORS_ORIGINS**：浏览器访问前端的地址，逗号分隔，避免 CORS 预检失败。例如通过 `http://公网IP` 或 `https://你的域名` 访问时，填写对应 Origin。

**可选**：

- **DATABASE_URL**：默认 SQLite（`backend/math_tutor.db`），可改为其他数据库。
- **LLM_API_KEY / LLM_PROVIDER / LLM_MODEL**：智能出题回退配置（未在前端设置时使用）。
- **DEEPSEEK_API_KEY、DEEPSEEK_BASE_URL、DEEPSEEK_MODEL**：Word 解析、Magic PPT 等未传请求头时的回退配置。
- **LLM_HTTPS_PROXY 或 HTTPS_PROXY**：部分地区访问 Google Gemini 时需配置代理。
- **AI_REQUEST_TIMEOUT**：AI 请求超时秒数，默认 120。
- **ENV=production、DEBUG=0**：生产标识与调试开关。
- **支付宝支付**：`ALIPAY_APP_ID`、`ALIPAY_PRIVATE_KEY`、`ALIPAY_PUBLIC_KEY`、`ALIPAY_NOTIFY_URL`；沙箱 `ALIPAY_DEBUG=1`；支付完成跳转 `ALIPAY_RETURN_URL`（可选）。不配置则定价页不显示支付宝。
- **微信支付（Native 扫码）**：`WECHAT_APPID`、`WECHAT_MCHID`、`WECHAT_PRIVATE_KEY`、`WECHAT_CERT_SERIAL_NO`、`WECHAT_APIV3_KEY`、`WECHAT_NOTIFY_URL`；可选 `WECHAT_CERT_DIR`。不配置则定价页不显示微信支付。

**本地知识库（RAG）**：

- 在「知识库管理」上传 PDF/Word 后，智能出题、组卷、AI 对话可勾选「启用本地知识库」，按知识点从向量库检索资料再生成。向量库使用 ChromaDB，存放在 `backend/data/vector_store/`。
- **RAG_TOP_K**：检索时取几条上下文（出题/组卷/对话共用），默认 3，范围 1～15；可在 `backend/.env` 中设置 `RAG_TOP_K=5` 等。
- Embedding 使用「设置」中的服务商与 API Key（与出题一致）；未传请求头时回退为 `DEEPSEEK_*` 或 `LLM_*`。详见 `backend/.env.example` 中的 RAG 注释。

示例（`backend/.env`）：

```env
SECRET_KEY=你的随机长密钥
CORS_ORIGINS=https://你的域名
# 若用 IP 访问：CORS_ORIGINS=http://公网IP
```

同一域名下前端与 `/api` 均由 Nginx 转发时，浏览器请求为同源；后端会根据请求头中的 `Origin` 与 `CORS_ORIGINS` 匹配，通过 IP 或域名访问时务必在服务端配置对应 Origin。

## 智能出题 400 的解决办法

`POST /api/generate` 返回 **400** 多为 **未配置 API Key**，任选一种方式配置即可。

**方式一（推荐）**：在前端配置  
1. 点击左侧栏底部 **「设置」**  
2. 默认已选 **DeepSeek**，填写 **API Key**（Base URL 已预填 `https://api.deepseek.com`）  
3. 可选模型：DeepSeek-V3（通用）/ DeepSeek-R1（强推理；若 JSON 常被截断可改用 deepseek-chat）  
4. 点击「保存配置」后，再点「生成练习题」

**方式二**：在后端配置  
在 `backend/.env` 中填写（示例为 DeepSeek）：

```env
LLM_API_KEY=你的DeepSeek_API密钥
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-chat
```

保存后重启后端，再在前端点击「生成练习题」。

**使用 Google Gemini 时提示「User location is not supported」**：  
- 方案一：在 `backend/.env` 配置代理后重启（请求会经代理出口；若仍报错多为 API Key/账号地区受限）。  
- **方案二（推荐）**：改用 **OpenRouter**，免直连、不受 Google 地区限制。在前端「设置」里选择 **「OpenRouter (Gemini 等·免直连)」**，到 [openrouter.ai](https://openrouter.ai) 申请 API Key 并填入，模型选如 `Gemini 2.5 Flash` 即可。

## 主要接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/token` | 登录（form: username, password），返回 JWT |
| GET  | `/api/users/me` | 当前用户信息（需 Bearer Token） |
| GET  | `/api/users/` | 用户列表（需管理员权限；含 plan_code、period_end） |
| POST | `/api/users/` | 创建用户（首个用户可未登录创建） |
| PUT  | `/api/users/{id}/subscription` | 管理员为用户设置套餐（body: plan_code, 可选 period_days） |
| DELETE | `/api/users/{id}` | 删除用户（需权限，不可删自己） |
| GET  | `/api/plans/` | 套餐列表（可未登录，供定价页） |
| GET  | `/api/subscription/me` | 当前用户订阅与已用学生数、到期日（需登录） |
| GET | `/api/payment/config` | 支付配置（alipay_enabled / wechat_enabled） |
| POST | `/api/orders` | 创建订单（body: plan_code, payment_method: alipay\|wechat, period_months）；支付宝返回 pay_url，微信返回 code_url |
| GET | `/api/orders/{out_trade_no}/status` | 查询订单支付状态（轮询用） |
| POST | `/api/payment/notify/alipay` | 支付宝异步回调（验签后更新订单与订阅） |
| POST | `/api/payment/notify/wechat` | 微信支付异步回调（验签解密后更新订单与订阅） |
| POST | `/api/generate` | 智能出题（需 API Key，启用知识库需基础版及以上；请求头可传 x-llm-*） |
| GET  | `/api/questions/` | 题库列表（可选按知识点筛选） |
| POST | `/api/questions/` | 保存单题 / 批量保存 |
| GET  | `/api/students/` | 学生列表（仅当前用户） |
| POST | `/api/students/` | 新建学生（受套餐学生数限制，超限返回 403；body 可含 login_code、password 用于学生端登录） |
| PUT  | `/api/students/{id}` | 更新学生（可更新 login_code、password） |
| DELETE | `/api/students/{id}` | 删除学生 |
| GET  | `/api/mistakes/` | 错题列表（可筛选 status、review_due 今日待复习） |
| POST | `/api/mistakes/` | 创建错题 |
| PUT  | `/api/mistakes/{id}/review` | 复习一次（review_count+1，更新 next_review_date） |
| PUT  | `/api/mistakes/{id}/master` | 标记已掌握（并写入 mastered_at 供学情趋势） |
| DELETE | `/api/mistakes/{id}` | 删除错题 |
| GET  | `/api/analysis/mastery/{student_id}` | 学情分析：弱项与已掌握知识点列表 |
| GET  | `/api/analysis/students-overview` | 多学生学情总览（待攻克/今日待复习/弱项数） |
| GET  | `/api/analysis/trend/{student_id}` | 学情趋势（按周新增错题数、新掌握数，query: weeks=8） |
| GET  | `/api/exams/` | 试卷列表 |
| GET  | `/api/dashboard/stats` | 仪表盘统计 |
| **学生端（需学生 JWT，Authorization: Bearer &lt;student_token&gt;）** | | |
| POST | `/api/student/token` | 学生端登录（body: login_code, password 可选），返回 JWT |
| GET  | `/api/student/me` | 当前学生信息（不含登录码/密码） |
| GET  | `/api/student/mistakes` | 当前学生错题列表（可筛选 status、review_due） |
| GET  | `/api/student/mistakes/{id}` | 单条错题 |
| PUT  | `/api/student/mistakes/{id}/review` | 复习一次 |
| PUT  | `/api/student/mistakes/{id}/master` | 标记已掌握 |
| GET  | `/api/student/analysis/mastery` | 当前学生学情掌握（弱项/已掌握） |
| GET  | `/api/student/analysis/trend` | 当前学生学情趋势（query: weeks=8） |
| GET  | `/api/student/exams` | 当前学生试卷列表 |
| GET  | `/api/student/exams/{id}` | 试卷详情 |
| POST  | `/api/student/exams/{exam_id}/grade` | 提交批改结果（body: results: [{ question_index, is_correct }]），学生 ID 由服务端强制为当前登录学生 |
| GET  | `/health` | 健康检查（无需前缀 /api） |

## 其他说明

- **题型「综合」**：会按题量混合生成选择题、填空题、解答题。
- **持久化**：智能出题页的题目列表与筛选参数会写入浏览器 `localStorage`；登录 Token 也会持久化，刷新后自动恢复登录态。
- **禁止看图题**：Prompt 已约束不生成依赖「如图」的题目，题干需用文字或 LaTeX 描述条件。
- **生产环境**：请在 `backend/.env` 或环境变量中设置 `SECRET_KEY`，勿使用默认值。
- **数据隔离**：学生、错题等与当前登录用户绑定（`user_id`），不同账号数据互不可见。
- **学生端登录**：教师在「学生管理」中为学生设置**登录码**（必填才可登录学生端）及**密码**（选填）；学生端为独立前端（`frontend-student`），使用登录码 + 密码登录后仅能访问自己的错题本、学情、试卷等；未设置登录码的学生无法登录学生端。
- **套餐与限流**：每位用户绑定一条订阅（Subscription），对应套餐（Plan）限制最大学生数及功能（如 RAG、Magic PPT）。免费版 3 名学生、无 RAG/PPT；基础版 15 名 + RAG；专业版 50 名 + RAG + Magic PPT。管理员（role=admin）不受限制。启动时会自动初始化默认套餐并为无订阅用户创建免费版订阅；也可手动运行 `scripts/ensure_subscriptions.py` 补全。
- **订阅到期**：付费套餐（基础版/专业版）由管理员授予时默认有效 30 天（`period_end`）。任意请求经 `get_current_subscription` 时若发现已到期会自动降级为免费版并清空周期；免费版无到期日。定价页与侧栏会显示「有效期至」及 7 天内到期时的「即将到期」提示。
- **错题本表结构**：若曾使用旧版错题本（含 `question_id`、`is_solved`），启动时后端会自动删除旧表并由新模型重建（仅 SQLite）。启动时会自动为 `mistake_records` 表补列（如 `next_review_date`、`mastered_at`），无需手动迁移。也可手动删除 `backend/math_tutor.db` 后重启以完全重置数据库。
- **功能拓展**：侧栏采用分组结构（出题与内容 / 学情与练习 / 系统管理），新增菜单时在 `frontend/src/components/Sidebar.jsx` 的 `navGroups` 对应分组下增加一项并在 `App.jsx` 添加路由即可。
- **环境变量参考**：所有可用变量及注释见 `backend/.env.example`。RAG 相关（如 `RAG_TOP_K`、知识库路径、Embedding 回退）见该文件中的「本地知识库 RAG」注释。
- **导入试卷含图**：上传 .docx 时，若本机已安装 **LibreOffice**（无头模式），会先将 Word 转 PDF 再按页渲染成图，由视觉模型识别题目（适合「如图」、几何图等）；转换失败或未安装 LibreOffice 时自动回退为纯文本解析。也可直接上传 .pdf，跳过转换，仅做按页识图或 PDF 文本解析。

## LLM Configuration Security

The system has two explicit LLM configuration modes:

- Local development: set `VITE_ALLOW_CLIENT_LLM_CONFIG=true` in the frontend and `ALLOW_CLIENT_LLM_CONFIG=true` in the backend. The frontend must also be a dev build. Only then may browser-stored Provider, API Key, Base URL, and Model be sent through temporary `x-llm-*` request headers.
- Production: keep `VITE_ALLOW_CLIENT_LLM_CONFIG=false` and `ALLOW_CLIENT_LLM_CONFIG=false`. The browser will not send API keys, and the backend ignores client-provided keys. Production uses only server environment variables: `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL`.

Production deployments must inject model credentials on the server. Do not put real API keys in the repository, Docker images, frontend environment variables, or browser-visible configuration. The settings page uses `GET /api/llm/status` for non-sensitive status and `POST /api/llm/test` for connectivity tests. These endpoints never return API keys, key prefixes, key suffixes, key length, or Authorization headers.

Local development example:

```env
VITE_ALLOW_CLIENT_LLM_CONFIG=true
ALLOW_CLIENT_LLM_CONFIG=true
```

Production example:

```env
VITE_ALLOW_CLIENT_LLM_CONFIG=false
ALLOW_CLIENT_LLM_CONFIG=false
LLM_PROVIDER=deepseek
LLM_API_KEY=
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
```

## Legacy RAG ownership migration

Legacy RAG documents that do not have `owner_user_id` are intentionally invisible to owner-scoped APIs.
To assign them to a specific teacher, run the explicit migration script from `MathTutor_System/backend`.
The script defaults to dry-run and must be given exactly one target identity with `--username` or `--user-id`.

```bash
cd MathTutor_System/backend
python scripts/assign_legacy_rag_documents.py --username teacher_name
python scripts/assign_legacy_rag_documents.py --username teacher_name --apply
```

The dry-run output lists ownerless registry records and the Chroma chunk counts that would be updated.
The apply mode backfills `document_id`, `owner_user_id`, `created_at`, `knowledge_point`, `chunk_type`, and chunk indexes where needed.
It updates Chroma metadata before replacing the JSON registry. If any stage fails, old chunks are not deleted and the script can be run again.
The script is not run at application startup and never assigns legacy documents to the first user automatically.
