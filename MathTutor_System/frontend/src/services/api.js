import axios from 'axios'

const STORAGE_KEY = 'app_settings'
export const AUTH_TOKEN_KEY = 'math_tutor_auth_token'
export const SESSION_EXPIRED_KEY = 'math_tutor_session_expired'

function getAppSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// 开发 / 生产均使用相对路径：baseURL 为空，请求为当前域名 + /api/...，由 Vite（开发）或 Nginx（生产）转发到后端
// 避免生产环境写死 127.0.0.1:8000，否则部署到 AWS 后会出现 ERR_CONNECTION_REFUSED
const baseURL =
  typeof import.meta !== 'undefined' && import.meta.env?.DEV
    ? ''
    : (import.meta.env?.VITE_API_BASE_URL || '')

const api = axios.create({
  baseURL,
  timeout: 60000, // 默认 60 秒，避免后端未启动或冷启动时 30 秒就报超时
  headers: { 'Content-Type': 'application/json' },
})

// 智能出题调用 LLM 可能较慢，单独延长超时
const GENERATE_TIMEOUT = 300000 // 5 分钟

api.interceptors.request.use((config) => {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null
  if (token) config.headers.Authorization = `Bearer ${token}`
  const settings = getAppSettings()
  if (!settings) return config
  if (settings.provider) config.headers['x-llm-provider'] = settings.provider
  if (settings.apiKey) config.headers['x-llm-api-key'] = settings.apiKey
  if (settings.baseUrl) config.headers['x-llm-base-url'] = settings.baseUrl
  if (settings.model) config.headers['x-llm-model'] = settings.model
  return config
})

// 401 统一处理：清除登录态并跳转登录页（Token 过期或无效时）；置标记供登录页展示「登录已过期」提示
// 403 且文案含「升级」：标记 err.upgradeRequired 供调用方提示并引导至 /pricing
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof localStorage !== 'undefined') {
      localStorage.removeItem(AUTH_TOKEN_KEY)
      if (typeof sessionStorage !== 'undefined' && typeof window !== 'undefined' && window.location.pathname !== '/login') {
        sessionStorage.setItem(SESSION_EXPIRED_KEY, '1')
        window.location.assign('/login')
      }
    }
    if (err.response?.status === 403) {
      const detail = err.response?.data?.detail ?? ''
      if (typeof detail === 'string' && detail.includes('升级')) {
        err.upgradeRequired = true
        err.upgradeMessage = detail
      }
    }
    return Promise.reject(err)
  }
)

// ---------- 认证 ----------

/**
 * 登录：POST /api/token (form), 返回 { access_token, token_type }
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ access_token: string, token_type: string }>}
 */
export function loginApi(username, password) {
  const params = new URLSearchParams()
  params.append('username', username)
  params.append('password', password)
  return api
    .post('/api/token', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 60000,
    })
    .then((res) => res.data)
}

/**
 * 获取当前用户：GET /api/users/me (需 Bearer Token)
 * @returns {Promise<{ id: number, username: string, is_active: boolean, role: string, created_at: string }>}
 */
export function getMe() {
  return api.get('/api/users/me', { timeout: 30000 }).then((res) => res.data)
}

/**
 * 套餐列表：GET /api/plans（可未登录）
 * @returns {Promise<Array<{ id: number, code: string, name: string, max_students: number, features: object, sort_order: number, price_monthly?: number, price_yearly?: number }>>}
 */
export function getPlans() {
  return api.get('/api/plans/', { timeout: 10000 }).then((res) => res.data)
}

/**
 * 当前用户订阅：GET /api/subscription/me（需登录）
 * @returns {Promise<{ plan: object, status: string, period_end?: string, student_count: number, max_students: number }>}
 */
export function getSubscriptionMe() {
  return api.get('/api/subscription/me', { timeout: 10000 }).then((res) => res.data)
}

/**
 * 管理员列表：GET /api/users (需 Bearer Token)
 * @returns {Promise<Array<{ id: number, username: string, is_active: boolean, role: string, created_at: string }>>}
 */
export function listUsers() {
  return api.get('/api/users/', { timeout: 10000 }).then((res) => res.data)
}

/**
 * 创建管理员：POST /api/users (需 Bearer Token，或首个用户可未登录)
 * @param {{ username: string, password: string, role?: string }} body
 * @returns {Promise<{ id: number, username: string, is_active: boolean, role: string, created_at: string }>}
 */
export function createUser(body) {
  return api.post('/api/users/', body, { timeout: 10000 }).then((res) => res.data)
}

/**
 * 删除管理员：DELETE /api/users/:id (需 Bearer Token)
 * @param {number} id 用户 id
 * @returns {Promise<void>}
 */
export function deleteUser(id) {
  return api.delete(`/api/users/${id}`, { timeout: 10000 })
}

/**
 * 管理员为用户设置套餐：PUT /api/users/:id/subscription (需管理员权限)
 * @param {number} userId 用户 id
 * @param {{ plan_code: string, period_days?: number }} body plan_code: free | basic | pro；period_days 仅付费套餐有效，不传默认 30
 * @returns {Promise<{ id, username, is_active, role, created_at, plan_code }>}
 */
export function setUserSubscription(userId, body) {
  return api.put(`/api/users/${userId}/subscription`, body, { timeout: 10000 }).then((res) => res.data)
}

/**
 * 批量设置套餐或批量续期：POST /api/users/batch-subscription（需管理员权限）
 * @param {{ user_ids: number[], plan_code?: string, period_days?: number }} body
 *   - plan_code + period_days：将选中用户设为该套餐，周期 period_days 天
 *   - 仅 period_days：对选中用户中有到期日的订阅延长 N 天
 * @returns {Promise<{ updated: number, failed: Array<{ user_id: number, reason: string }> }>}
 */
export function batchSetSubscription(body) {
  return api.post('/api/users/batch-subscription', body, { timeout: 15000 }).then((res) => res.data)
}

/**
 * 获取某用户的订阅变更历史：GET /api/users/:id/subscription-history（需管理员权限）
 * @param {number} userId
 * @returns {Promise<Array<{ id, user_id, plan_code, plan_name, period_start, period_end, created_at }>>}
 */
export function getUserSubscriptionHistory(userId) {
  return api.get(`/api/users/${userId}/subscription-history`, { timeout: 10000 }).then((res) => res.data)
}

// ---------- 支付与订单 ----------

/**
 * 获取支付配置（是否已接入支付宝）
 * @returns {Promise<{ alipay_enabled: boolean, return_url?: string }>}
 */
export function getPaymentConfig() {
  return api.get('/api/payment/config', { timeout: 5000 }).then((res) => res.data)
}

/**
 * 创建订单并获取支付链接
 * @param {{ plan_code: string, payment_method: 'alipay'|'wechat', period_months?: number }} body
 * @returns {Promise<{ out_trade_no: string, pay_url?: string, code_url?: string, message: string }>}
 */
export function createOrder(body) {
  return api.post('/api/orders', body, { timeout: 15000 }).then((res) => res.data)
}

/**
 * 查询订单支付状态（轮询用）
 * @param {string} outTradeNo
 * @returns {Promise<{ out_trade_no: string, status: 'pending'|'paid'|'failed'|'refunded' }>}
 */
export function getOrderStatus(outTradeNo) {
  return api.get(`/api/orders/${encodeURIComponent(outTradeNo)}/status`, { timeout: 5000 }).then((res) => res.data)
}

/**
 * 智能出题：POST /api/generate
 * @param {{ knowledge_point: string, difficulty: string, question_type?: string, count?: number }} params
 * @returns {Promise<{ data: Array<{ content: string, options: string[], answer: string, analysis: string }> }>}
 */
export function generateQuestions(params) {
  const body = {
    knowledge_point: params.knowledge_point,
    scenario: params.scenario ?? 'default',
    difficulty: params.difficulty,
    question_type: params.question_type ?? '选择',
    count: params.count ?? 3,
  }
  if (params.ref_content != null && String(params.ref_content).trim()) {
    body.ref_content = String(params.ref_content).trim()
  }
  if (params.student_id != null && Number.isFinite(params.student_id)) {
    body.student_id = params.student_id
  }
  if (params.use_knowledge_base === true) {
    body.use_knowledge_base = true
  }
  return api.post('/api/generate', body, { timeout: GENERATE_TIMEOUT })
}

/**
 * 一键按弱项出题（备课包）：根据该生错题本待掌握知识点生成巩固题。POST /api/generate/weak-point
 * @param {{ student_id: number, count?: number, difficulty?: string, question_type?: string, use_knowledge_base?: boolean }} params
 * @returns {Promise<{ data: Array<{ content: string, options: string[], answer: string, analysis: string, student_id?: number }> }>}
 */
export function generateWeakPointQuestions(params) {
  const body = {
    student_id: params.student_id,
    count: params.count ?? 5,
    difficulty: params.difficulty ?? 'L3',
    question_type: params.question_type ?? '综合',
    use_knowledge_base: params.use_knowledge_base === true,
  }
  return api.post('/api/generate/weak-point', body, { timeout: GENERATE_TIMEOUT })
}

/** AI 对话超时（与推理模型一致） */
const CHAT_TIMEOUT = 120000

/**
 * AI 对话：POST /api/chat
 * @param {{ messages: Array<{ role: string, content: string }>, student_id?: number, knowledge_point?: string, use_knowledge_base?: boolean }} params
 * @returns {Promise<{ content: string, session_id?: number, rag_used?: boolean, rag_sources?: string[] }>}
 */
export function chatWithAI(params) {
  const body = {
    messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
  }
  if (params.student_id != null && Number.isFinite(params.student_id)) {
    body.student_id = params.student_id
  }
  if (params.knowledge_point != null && String(params.knowledge_point).trim()) {
    body.knowledge_point = String(params.knowledge_point).trim()
  }
  if (params.use_knowledge_base === true) {
    body.use_knowledge_base = true
  }
  if (params.context_question != null && String(params.context_question).trim()) {
    body.context_question = String(params.context_question).trim()
  }
  if (params.session_id != null && Number.isFinite(params.session_id)) {
    body.session_id = params.session_id
  }
  return api.post('/api/chat', body, { timeout: CHAT_TIMEOUT }).then((res) => res.data)
}

/**
 * 对话会话列表：GET /api/chat/sessions
 * @returns {Promise<Array<{ id: number, student_id?: number, title?: string, created_at: string }>>}
 */
export function getChatSessions() {
  return api.get('/api/chat/sessions', { timeout: 15000 }).then((res) => res.data)
}

/**
 * 某会话的历史消息：GET /api/chat/sessions/:id/messages
 * @param {number} sessionId
 * @returns {Promise<Array<{ id: number, role: string, content: string, created_at: string }>>}
 */
export function getChatSessionMessages(sessionId) {
  return api.get(`/api/chat/sessions/${sessionId}/messages`, { timeout: 15000 }).then((res) => res.data)
}

/**
 * 删除会话：DELETE /api/chat/sessions/:id
 * @param {number} sessionId
 * @returns {Promise<{ ok: boolean }>}
 */
export function deleteChatSession(sessionId) {
  return api.delete(`/api/chat/sessions/${sessionId}`, { timeout: 15000 }).then((res) => res.data)
}

/**
 * 固定/取消固定会话：PATCH /api/chat/sessions/:id
 * @param {number} sessionId
 * @param {boolean} pinned
 * @returns {Promise<{ id: number, pinned: boolean, ... }>}
 */
export function updateChatSessionPin(sessionId, pinned) {
  return api
    .patch(`/api/chat/sessions/${sessionId}`, { pinned }, { timeout: 15000 })
    .then((res) => res.data)
}

/**
 * 更新会话中某条消息内容：PATCH /api/chat/sessions/:sessionId/messages/:messageId（仅 user 消息）
 * @param {number} sessionId
 * @param {number} messageId
 * @param {string} content
 * @returns {Promise<{ id: number, role: string, content: string, created_at: string }>}
 */
export function updateChatMessage(sessionId, messageId, content) {
  return api
    .patch(`/api/chat/sessions/${sessionId}/messages/${messageId}`, { content }, { timeout: 15000 })
    .then((res) => res.data)
}

/**
 * 流式对话：POST /api/chat/stream，通过 onChunk(delta) 与 onDone({ session_id }) 回调增量接收
 * @param {object} params 同 chatWithAI
 * @param {(chunk: string) => void} onChunk 每收到一段内容调用
 * @param {(data: { session_id?: number, error?: string, rag_used?: boolean, rag_sources?: string[] }) => void} onDone 流结束或出错时调用
 * @returns {Promise<void>}
 */
export function chatWithAIStream(params, onChunk, onDone) {
  const body = {
    messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
  }
  if (params.session_id != null && Number.isFinite(params.session_id)) body.session_id = params.session_id
  if (params.student_id != null && Number.isFinite(params.student_id)) body.student_id = params.student_id
  if (params.knowledge_point != null && String(params.knowledge_point).trim())
    body.knowledge_point = String(params.knowledge_point).trim()
  if (params.use_knowledge_base === true) body.use_knowledge_base = true
  if (params.context_question != null && String(params.context_question).trim())
    body.context_question = String(params.context_question).trim()

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('math_tutor_auth_token') : null
  const settings = (() => {
    try {
      const raw = localStorage.getItem('app_settings')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (settings?.provider) headers['x-llm-provider'] = settings.provider
  if (settings?.apiKey) headers['x-llm-api-key'] = settings.apiKey
  if (settings?.baseUrl) headers['x-llm-base-url'] = settings.baseUrl
  if (settings?.model) headers['x-llm-model'] = settings.model

  const baseURL = typeof import.meta !== 'undefined' && import.meta.env?.DEV ? '' : (import.meta.env?.VITE_API_BASE_URL || '')
  return fetch(`${baseURL}/api/chat/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CHAT_TIMEOUT),
  })
    .then(async (res) => {
      if (!res.ok) {
        const err = await res.text()
        onDone?.({ error: err || res.statusText })
        return
      }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const data = JSON.parse(line)
            if (data.content != null) onChunk?.(data.content)
            if (data.done === true) onDone?.(data)
            if (data.error) onDone?.({ error: data.error })
          } catch (_) {}
        }
      }
      if (buf.trim()) {
        try {
          const data = JSON.parse(buf)
          if (data.content != null) onChunk?.(data.content)
          if (data.done === true) onDone?.(data)
        } catch (_) {}
      }
    })
    .catch((err) => {
      onDone?.({ error: err.message || '请求失败' })
    })
}

/**
 * 生成完整试卷：POST /api/exam，返回 28 道题（8 选择 + 8 填空 + 12 解答）
 * @param {{ knowledge_point: string, difficulty: string, student_id?: number, use_knowledge_base?: boolean }} params
 * @returns {Promise<{ data: Array<{ content: string, options: string[], answer: string, analysis: string, question_type?: string }> }>}
 */
export function generateExam(params) {
  const body = {
    knowledge_point: (params.knowledge_point ?? '').trim(),
    difficulty: params.difficulty ?? 'L3',
  }
  if (params.student_id != null && Number.isFinite(params.student_id)) {
    body.student_id = params.student_id
  }
  if (params.use_knowledge_base === true) {
    body.use_knowledge_base = true
  }
  return api.post('/api/exam', body, { timeout: GENERATE_TIMEOUT })
}

/**
 * 题目校对：POST /api/verify，检查并修正单道题目的计算、逻辑、格式与解析
 * @param {{ content: string, options: string[], answer: string, analysis: string, difficulty?: string, question_type?: string }} question
 * @returns {Promise<{ content: string, options: string[], answer: string, analysis: string, ... }>}
 */
export function verifyQuestion(question) {
  return api
    .post('/api/verify', question, { timeout: GENERATE_TIMEOUT })
    .then((res) => res.data)
}

/**
 * RAG：上传文档到本地知识库（PDF/Word），可选知识点与类型以便检索时 where 过滤
 * @param {File} file
 * @param {{ knowledge_point?: string, chunk_type?: string }} options 可选，知识点（如「二次函数」）、类型（如「题目」「概念」）
 * @returns {Promise<{ message: string, filename: string }>}
 */
export function uploadRagDocument(file, options = {}) {
  const form = new FormData()
  form.append('file', file)
  if (options.knowledge_point != null && String(options.knowledge_point).trim())
    form.append('knowledge_point', String(options.knowledge_point).trim())
  if (options.chunk_type != null && String(options.chunk_type).trim())
    form.append('chunk_type', String(options.chunk_type).trim())
  return api.post('/api/rag/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  })
}

/**
 * RAG：异步上传（立即返回 202，后台解析并写入；适合大文件）
 * @returns {Promise<{ task_id: string, status: string, message: string }>} 需轮询 getRagUploadStatus(task_id)
 */
export function uploadRagDocumentAsync(file, options = {}) {
  const form = new FormData()
  form.append('file', file)
  if (options.knowledge_point != null && String(options.knowledge_point).trim())
    form.append('knowledge_point', String(options.knowledge_point).trim())
  if (options.chunk_type != null && String(options.chunk_type).trim())
    form.append('chunk_type', String(options.chunk_type).trim())
  return api.post('/api/rag/upload/async', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30000,
    validateStatus: (s) => s === 202 || s >= 400,
  }).then((res) => {
    if (res.status === 202) return res.data
    throw res
  })
}

/**
 * RAG：查询异步上传任务状态
 * @returns {Promise<{ task_id: string, status: 'pending'|'processing'|'done'|'failed', message?: string, filename?: string, error?: string }>}
 */
export function getRagUploadStatus(taskId) {
  return api.get(`/api/rag/upload/status/${taskId}`).then((res) => res.data)
}

/**
 * 探测后端是否可用（不依赖鉴权/数据库），用于知识库等页在请求前先检查，避免无谓的 ECONNRESET
 * @returns {Promise<{ ok: boolean }>}
 */
export function checkBackendHealth() {
  return api.get('/api/health', { timeout: 4000 }).then((res) => res.data)
}

/**
 * RAG：获取知识库文档列表（按来源聚合）
 * @returns {Promise<{ documents: Array<{ source: string, chunk_count: number }> }>}
 */
export function listRagDocuments() {
  return api.get('/api/rag/documents').then((res) => res.data)
}

/**
 * RAG：获取某文档的文本块列表（预览入库内容）
 * @param {string} source 上传时的文件名
 * @returns {Promise<{ source: string, chunks: string[] }>}
 */
export function getRagDocumentChunks(source) {
  return api.get('/api/rag/documents/chunks', { params: { source } }).then((res) => res.data)
}

/**
 * RAG：按来源删除知识库中的文档（source 为上传时的文件名）
 * @param {string} source 文档来源，如 "教案.pdf"
 * @returns {Promise<{ message: string, source: string, chunk_count: number }>}
 */
export function deleteRagDocument(source) {
  return api.delete('/api/rag/documents/' + encodeURIComponent(source)).then((res) => res.data)
}

/** 解析试卷：上传 .docx 或 .pdf，含图时按页识图，否则文本解析。超时 120 秒。 */
const PARSE_WORD_TIMEOUT = 180000 // 3 分钟，多页按页识图可能较久

/**
 * 试卷解析：POST /api/upload/parse/word
 * @param {File} file .docx 或 .pdf 文件
 * @returns {Promise<{ questions: Array<{ number?: number|string, type: string, content: string, options?: string[] }> }>}
 */
export function parseWordExam(file) {
  const form = new FormData()
  form.append('file', file)
  return api.post('/api/upload/parse/word', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: PARSE_WORD_TIMEOUT,
  }).then((res) => res.data)
}

const GENERATE_ANALYSIS_TIMEOUT = 300000 // 每题约 10–30 秒，批量最多 5 分钟

/**
 * 为导入的题目批量生成解析：POST /api/upload/generate-analysis
 * @param {{ questions: Array<{ content: string, options?: string[], answer?: string }> }} body
 * @returns {Promise<{ questions: Array<{ ... same fields, analysis: string }> }>}
 */
export function generateAnalysisForQuestions(body) {
  return api.post('/api/upload/generate-analysis', body, {
    timeout: GENERATE_ANALYSIS_TIMEOUT,
  }).then((res) => res.data)
}

const PPT_GENERATE_TIMEOUT = 120000

/**
 * 生成教学 PPT 讲稿（仅内容，供预览）：POST /api/tools/generate-ppt
 * @param {{ topic: string, grade?: string }} params
 * @returns {Promise<{ title: string, slides: Array<{ layout, title, subtitle?, bullets? }> }>}
 */
export function generatePPT(params) {
  const body = { topic: (params.topic || '').trim(), grade: params.grade || 'Middle' }
  return api
    .post('/api/tools/generate-ppt', body, { timeout: PPT_GENERATE_TIMEOUT })
    .then((res) => res.data)
}

/**
 * 根据讲稿内容构建并下载 .pptx 文件：POST /api/tools/build-pptx
 * @param {{ title: string, slides: array, filename?: string }} content 由 generatePPT 返回的结构，可带 filename（默认用主题名）
 * @returns {Promise<{ blob: Blob, filename: string }>}
 */
export function buildPPTFile(content) {
  return api
    .post('/api/tools/build-pptx', content, {
      responseType: 'blob',
      timeout: 60000,
    })
    .then((res) => {
      const blob = res.data
      const disposition = res.headers?.['content-disposition'] || ''
      const match = disposition.match(/filename="?([^";]+)"?/i)
      const filename = match ? match[1].trim() : 'Lesson.pptx'
      return { blob, filename }
    })
}

/**
 * 题库：获取题目列表
 * @param {{ knowledge_point?: string, student_id?: number }} params 可选，按知识点或学生 ID 筛选（student_id 时返回该学生题目 + 公共题）
 * @returns {Promise<{ data: Array<Question> }>}
 */
export function getQuestions(params = {}) {
  return api.get('/api/questions/', { params, timeout: 60000 })
}

/**
 * 题库：保存单道题目
 * @param {object} body 题目字段 content, options, answer, analysis, knowledge_point, difficulty, question_type, source, student_id?
 * @returns {Promise<{ data: Question }>}
 */
export function saveQuestion(body) {
  return api.post('/api/questions/', body)
}

/**
 * 题库：批量保存题目
 * @param {{ questions: object[] }} body
 * @returns {Promise<{ data: Question[] }>}
 */
export function saveQuestionsBatch(body) {
  return api.post('/api/questions/batch/', body)
}

/**
 * 题库：删除题目
 * @param {number} id 题目 id
 * @returns {Promise}
 */
export function deleteQuestion(id) {
  return api.delete(`/api/questions/${id}/`)
}

// ---------- 学生管理 ----------

const STUDENTS_TIMEOUT = 60000 // 学生列表/操作：60 秒，避免冷启动或慢后端超时

/**
 * 学生列表
 * @param {{ name?: string, class_name?: string }} params 可选，按姓名或班级搜索
 * @returns {Promise<{ data: Array<Student> }>}
 */
export function getStudents(params = {}) {
  return api.get('/api/students/', { params, timeout: STUDENTS_TIMEOUT })
}

/**
 * 新增学生
 * @param {{ name: string, grade: string, class_name: string, tags?: string[] }} body
 * @returns {Promise<{ data: Student }>}
 */
export function createStudent(body) {
  return api.post('/api/students/', body, { timeout: STUDENTS_TIMEOUT })
}

/**
 * 修改学生
 * @param {number} id
 * @param {{ name?: string, grade?: string, class_name?: string, tags?: string[], performance_score?: number }} body
 * @returns {Promise<{ data: Student }>}
 */
export function updateStudent(id, body) {
  return api.put(`/api/students/${id}`, body, { timeout: STUDENTS_TIMEOUT })
}

/**
 * 删除学生
 * @param {number} id
 * @returns {Promise}
 */
export function deleteStudent(id) {
  return api.delete(`/api/students/${id}`, { timeout: STUDENTS_TIMEOUT })
}

// ---------- 排课 ----------

const SCHEDULES_TIMEOUT = 30000

/**
 * 排课列表（支持 student_id、from_date、to_date 筛选）
 * @param {{ student_id?: number, from_date?: string, to_date?: string }} params 日期格式 YYYY-MM-DD
 * @returns {Promise<Array<{ id, user_id, student_id, student_name, schedule_date, start_time, end_time, subject, note, created_at }>>}
 */
export function getSchedules(params = {}) {
  return api.get('/api/schedules/', { params, timeout: SCHEDULES_TIMEOUT }).then((res) => res.data)
}

/**
 * 新增排课
 * @param {{ student_id: number, schedule_date: string, start_time: string, end_time: string, subject?: string, note?: string }} body 日期 YYYY-MM-DD，时间 HH:MM
 * @returns {Promise<object>}
 */
export function createSchedule(body) {
  return api.post('/api/schedules/', body, { timeout: SCHEDULES_TIMEOUT }).then((res) => res.data)
}

/**
 * 修改排课
 * @param {number} id
 * @param {{ schedule_date?: string, start_time?: string, end_time?: string, subject?: string, note?: string }} body
 * @returns {Promise<object>}
 */
export function updateSchedule(id, body) {
  return api.put(`/api/schedules/${id}`, body, { timeout: SCHEDULES_TIMEOUT }).then((res) => res.data)
}

/**
 * 删除排课
 * @param {number} id
 * @returns {Promise<void>}
 */
export function deleteSchedule(id) {
  return api.delete(`/api/schedules/${id}`, { timeout: SCHEDULES_TIMEOUT })
}

/**
 * 学生标签增删
 * @param {number} id
 * @param {{ add?: string[], remove?: string[] }} body
 * @returns {Promise<{ data: Student }>}
 */
export function updateStudentTags(id, body) {
  return api.post(`/api/students/${id}/tags`, body, { timeout: STUDENTS_TIMEOUT })
}

/**
 * 下载学生学习报告 PDF（blob）
 * @param {number} studentId 学生 ID
 * @returns {Promise<AxiosResponse<Blob>>} 返回带 data 为 Blob 的响应，用于前端触发下载
 */
export function getStudentReportPdf(studentId) {
  return api.get(`/api/reports/${studentId}`, {
    responseType: 'blob',
    timeout: 30000,
  })
}

/** 课后报告评语生成超时（与推理模型一致） */
const AFTER_CLASS_COMMENT_TIMEOUT = 120000

/**
 * 课后报告生成器：根据今日状态与关键词生成评语，或根据草稿由 AI 修饰（100～200 字）
 * @param {{ focus_level?: number, mastery_level?: number, keywords?: string[], student_name?: string, draft?: string }} params
 * @returns {Promise<{ comment: string }>}
 */
export function generateAfterClassComment(params) {
  const body = {
    focus_level: Math.min(5, Math.max(1, Number(params.focus_level) || 3)),
    mastery_level: Math.min(5, Math.max(1, Number(params.mastery_level) || 3)),
    keywords: Array.isArray(params.keywords)
      ? params.keywords.slice(0, 4).map((k) => String(k || '').trim()).filter(Boolean)
      : [],
  }
  if (params.student_name != null && String(params.student_name).trim()) {
    body.student_name = String(params.student_name).trim()
  }
  if (params.draft != null && String(params.draft).trim()) {
    body.draft = String(params.draft).trim().slice(0, 2000)
  }
  if (params.template != null && String(params.template).trim()) {
    body.template = String(params.template).trim().slice(0, 3000)
  }
  return api
    .post('/api/reports/after-class', body, { timeout: AFTER_CLASS_COMMENT_TIMEOUT })
    .then((res) => res.data)
}

/**
 * 可视化学习报告：从学情描述中解析出已掌握、待攻克、预计课时
 * @param {{ draft: string }} params
 * @returns {Promise<{ mastered: string[], weak_points: { point: string, description?: string }[], estimated_hours: number }>}
 */
export function parseLearningReportDraft(params) {
  const draft = (params.draft || '').trim()
  if (!draft) return Promise.reject(new Error('请提供学情描述'))
  return api
    .post('/api/reports/learning-visual', { draft }, { timeout: 120000 })
    .then((res) => res.data)
}

// ---------- 题库收藏 ----------

/**
 * 收藏题目入本地题库（来自 Gen / 错题本等）
 * @param {{ content: string, options?: string[], answer: string, analysis?: string, question_type: string, difficulty: string, knowledge_point: string, source: string, student_id?: number, tags?: string[] }} body
 * @returns {Promise<{ data: object, created: boolean }>} created 表示是否为新录入（false 表示与题库重复已跳过）
 */
export function collectQuestion(body) {
  return api.post('/api/bank/collect', body, { timeout: 15000 }).then((res) => res.data)
}

/**
 * 题库收藏列表（支持知识点模糊、题型筛选）
 * @param {{ knowledge_point?: string, question_type?: string, student_id?: number }} params
 * @returns {Promise<{ data: Array<BankItem> }>}
 */
export function getBankList(params = {}) {
  return api.get('/api/bank/', { params, timeout: 20000 })
}

/**
 * 从题库移出
 * @param {number} id 题库条目 id
 * @returns {Promise<void>}
 */
export function deleteFromBank(id) {
  return api.delete(`/api/bank/${id}`, { timeout: 10000 })
}

// ---------- 学情分析 ----------

/**
 * 学生知识点掌握情况（弱项 = 未解决错题对应的知识点）
 * @param {number} studentId
 * @returns {Promise<{ data: { weak_points: string[] } }>}
 */
/**
 * 学生知识点掌握情况（弱项 + 已掌握）
 * @param {number} studentId
 * @returns {Promise<{ data: { weak_points: string[], mastered_points: string[] } }>}
 */
export function getStudentMastery(studentId) {
  return api.get(`/api/analysis/mastery/${studentId}`, { timeout: 20000 })
}

/**
 * 多学生总览：当前用户下每个学生的待攻克数、今日待复习数、弱项数
 * @returns {Promise<{ students: Array<{ student_id: number, student_name: string, pending_mistake_count: number, today_review_count: number, weak_point_count: number }> }>}
 */
export function getStudentsOverview() {
  return api.get('/api/analysis/students-overview', { timeout: 15000 }).then((res) => res.data)
}

/**
 * 学情趋势：按周统计新增错题数、新掌握数
 * @param {number} studentId
 * @param {number} [weeks=8]
 * @returns {Promise<{ weeks: Array<{ week_start: string, label: string, new_mistakes: number, new_mastered: number }> }>}
 */
export function getStudentTrend(studentId, weeks = 8) {
  return api
    .get(`/api/analysis/trend/${studentId}`, { params: { weeks }, timeout: 15000 })
    .then((res) => res.data)
}

// ---------- 错题本 ----------

/**
 * 错题列表（支持按学生、status 筛选：pending | mastered）
 * @param {{ student_id?: number, status?: string }} params
 * @returns {Promise<{ data: Array<{ id, student_id, topic, source, content, solution, status, review_count, created_at }> }>}
 */
export function getMistakes(params = {}) {
  return api.get('/api/mistakes/', { params, timeout: 20000 })
}

/**
 * 创建错题
 * @param {{ student_id: number, topic: string, source: string, content: string, solution?: string }} body
 * @returns {Promise<{ data: object }>}
 */
export function createMistake(body) {
  return api.post('/api/mistakes/', body, { timeout: 15000 })
}

/** @deprecated 使用 createMistake；旧接口已移除 */
export function addMistake(body) {
  return createMistake(body)
}

/**
 * 复习打卡：review_count +1
 * @param {number} id 错题记录 id
 * @returns {Promise<{ data: object }>}
 */
export function incrementMistakeReview(id) {
  const numId = id != null ? Number(id) : NaN
  if (Number.isNaN(numId)) return Promise.reject(new Error('错题记录 ID 无效'))
  return api.put(`/api/mistakes/${numId}/review`, {}, { timeout: 10000 })
}

/**
 * 标记为已掌握：status = mastered
 * @param {number} id 错题记录 id
 * @returns {Promise<{ data: object }>}
 */
export function markMistakeMaster(id) {
  const numId = id != null ? Number(id) : NaN
  if (Number.isNaN(numId)) return Promise.reject(new Error('错题记录 ID 无效'))
  return api.put(`/api/mistakes/${numId}/master`, {}, { timeout: 10000 })
}

/**
 * 从错题本中删除一条错题记录
 * @param {number} id 错题记录 id
 * @returns {Promise<void>}
 */
export function deleteMistake(id) {
  const numId = id != null ? Number(id) : NaN
  if (Number.isNaN(numId)) return Promise.reject(new Error('错题记录 ID 无效'))
  return api.delete(`/api/mistakes/${numId}`, { timeout: 10000 })
}

// ---------- 仪表盘 ----------

/**
 * 仪表盘统计：总题数、试卷数、学生数、最近试卷、知识点分布 Top 5
 * @returns {Promise<{ data: { total_questions, total_exams, total_students, recent_exams, knowledge_distribution } }>}
 */
export function getDashboardStats() {
  return api.get('/api/dashboard/stats', { timeout: 15000 })
}

// ---------- 试卷 ----------

/**
 * 获取单份试卷详情
 * @param {number} id 试卷 id
 * @returns {Promise<{ data: { id, title, student_id, questions, created_at } }>}
 */
export function getExam(id) {
  return api.get(`/api/exams/${id}`, { timeout: 60000 })
}

/**
 * 试卷列表（按作业日期、创建时间倒序）
 * @param {{ assignment_date?: string }} params - assignment_date 为 YYYY-MM-DD 时按该日筛选
 * @returns {Promise<{ data: Array<{ id, title, student_id, questions, created_at, assignment_date }> }>}
 */
export function getExams(params = {}) {
  return api.get('/api/exams/', { params, timeout: 60000 })
}

/**
 * 更新试卷（作业草稿的标题、题目、作业日期）
 * @param {number} id 试卷 id
 * @param {{ title?: string, questions?: Array|object, assignment_date?: string }} body
 */
export function updateExam(id, body) {
  return api.put(`/api/exams/${id}`, body, { timeout: 60000 })
}

/**
 * 保存试卷（当前题目列表）
 * @param {{ title?: string, student_id?: number, questions: Array<{ content, options?, answer, analysis? }> }} body
 * @returns {Promise<{ data: { id, title, student_id, questions, created_at } }>}
 */
export function saveExam(body) {
  return api.post('/api/exams/', body, { timeout: 60000 })
}

/**
 * 删除试卷/作业
 * @param {number} id 试卷 id
 */
export function deleteExam(id) {
  return api.delete(`/api/exams/${id}`)
}

/**
 * 提交试卷批改结果，更新错题本
 * @param {number} examId 试卷 id
 * @param {{ results: Array<{ question_index: number, is_correct: boolean, error_type?: string }>, student_id?: number }} body
 * @returns {Promise<{ data: { graded: number, mistakes_added: number } }>}
 */
export function gradeExam(examId, body) {
  return api.post(`/api/exams/${examId}/grade`, body, { timeout: 15000 })
}

export default api
