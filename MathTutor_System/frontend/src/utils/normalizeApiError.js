/**
 * 用户可见错误信息的统一归一化（本地化）。
 *
 * 归一化顺序：
 * 1. 已登记的结构化错误码（{ code | error_code, message }）→ 稳定中文文案
 * 2. 机器错误码前缀（"XXX_YYY_ERROR: ..."）→ 隐藏前缀，只保留中文部分
 * 3. 后端已提供的中文业务消息 → 原样保留
 * 4. 已知网络 / 超时 / HTTP 传输层错误 → 稳定中文文案
 * 5. 通用中文兜底
 *
 * 安全约定（延续 2C-1 secret contract）：
 * - 不会把 API Key、Bearer token、Authorization 头、数据库 URL、完整 provider 异常透出给用户；
 * - 未知结构永不 JSON.stringify 展示；纯英文技术消息一律替换为中文兜底。
 */

const MACHINE_CODE_MESSAGES = {
  CHAT_PROVIDER_ERROR: '对话服务暂时不可用，请稍后重试',
  CHAT_SESSION_ERROR: '对话会话出现异常，请重新打开会话',
  QUESTION_GENERATION_ERROR: '生成题目失败，请稍后重试',
  EXAM_GENERATION_ERROR: '生成试卷失败，请稍后重试',
  QUESTION_VERIFICATION_ERROR: '题目校验失败，请稍后重试',
  EXAM_GRADING_ERROR: '提交批改结果失败，请稍后重试',
  REPORT_PROVIDER_ERROR: '学情报告服务暂时不可用，请稍后重试',
  REPORT_GENERATION_ERROR: '生成报告失败，请稍后重试',
  RAG_UPLOAD_ERROR: '知识库导入失败，请稍后重试',
  RAG_PROVIDER_ERROR: '知识库服务暂时不可用，请稍后重试',
  DOCUMENT_PARSE_ERROR: '文档解析失败，请检查文件后重试',
  LLM_PROVIDER_ERROR: 'AI 服务暂时不可用，请稍后重试',
  LLM_AUTH_ERROR: 'AI 服务鉴权失败，请检查模型配置',
  LLM_CONFIG_UNSUPPORTED_PROVIDER: '暂不支持该 AI 服务商，请检查模型配置',
  LLM_CONFIG_INVALID_BASE_URL: 'AI 服务地址无效，请检查 Base URL 配置',
  LLM_CONFIG_MISSING_MODEL: '未配置 AI 模型，请先在设置中选择模型',
  LLM_CONFIG_MISSING_KEY: '未配置 AI 服务密钥，请先在设置中填写 API Key',
  EMBEDDING_CONFIG_ERROR: '向量服务配置异常，请检查嵌入模型设置',
  PPT_GENERATION_ERROR: '生成课件失败，请稍后重试',
  PPT_BUILD_ERROR: '导出课件失败，请稍后重试',
}

const HTTP_FALLBACK_MESSAGES = {
  400: '请求内容有误，请检查后重试',
  401: '登录状态已失效，请重新登录',
  403: '当前账号无权执行此操作',
  404: '请求的内容不存在或已被删除',
  409: '当前状态已发生变化，请刷新后重试',
  422: '输入内容不符合要求，请检查后重试',
  429: '请求过于频繁，请稍后再试',
  500: '服务暂时不可用，请稍后重试',
  502: '服务暂时不可用，请稍后重试',
  503: '服务暂时不可用，请稍后重试',
  504: '服务暂时不可用，请稍后重试',
}

const NETWORK_ERROR_MESSAGE = '网络连接失败，请检查网络后重试'
const TIMEOUT_ERROR_MESSAGE = '请求超时，请稍后重试'

// 机器错误码前缀：形如 "EXAM_GRADING_ERROR: 提交批改结果失败，请稍后重试。"
const MACHINE_CODE_PREFIX_PATTERN = /^([A-Z][A-Z0-9_]{2,}):\s*(.+)$/

// ---- Secret redaction boundary -------------------------------------------------
// 凭据形状检测（fail-closed）：normalizer 不知道真实密钥值，因此按"形状"识别
// credential-bearing 内容；命中即整串丢弃并回退到安全中文兜底，绝不尝试遮罩后
// 继续展示（避免只遮住一个 secret 却泄漏其它 provider/内部上下文）。

// credential 字段 + 赋值形状：field=value / field: value / "field": "value"
// 字段名用结构化变体（[_-]? / [_-]）避免手工枚举遗漏；compact apiKey 由
// case-insensitive 的 api[_-]?key 覆盖；值允许引号包裹（JSON-ish）或裸 token。
const CREDENTIAL_FIELD_NAMES = [
  'x-api-key',
  'x-goog-api-key',
  'access[_-]?token',
  'client[_-]?secret',
  'api[_-]?key',
  'authorization',
  'password',
  'passwd',
  'secret',
  'token',
].join('|')
const CREDENTIAL_ASSIGNMENT_PATTERN = new RegExp(
  `\\b(?:${CREDENTIAL_FIELD_NAMES})"?\\s*[:=]\\s*(?:"[^"]*"|'[^']*'|[^\\s,;}&]+)`,
  'i',
)

// 裸 Bearer/Basic 凭据
const BEARER_BASIC_PATTERN = /\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{4,}/i

// 已知密钥形状：OpenAI sk-… / Google AIza… / JWT eyJ…
const KNOWN_KEY_SHAPE_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{10,})/

// 带 credential 语义的基础设施 URL：出现即整体 fallback，不遮罩后继续显示
const INFRA_URL_PATTERN = /\b(?:postgresql(?:\+\w+)?|mysql(?:\+\w+)?|mongodb(?:\+srv)?|redis|amqp|mssql):\/\/[^\s]+/i

/**
 * 检测任意文本是否携带 credential 形状内容。
 * 纯函数；Teacher/Student 两端契约保持一致。
 */
export function containsSensitiveMaterial(text) {
  if (typeof text !== 'string' || !text) return false
  return Boolean(
    CREDENTIAL_ASSIGNMENT_PATTERN.test(text)
    || BEARER_BASIC_PATTERN.test(text)
    || KNOWN_KEY_SHAPE_PATTERN.test(text)
    || INFRA_URL_PATTERN.test(text),
  )
}

/** 携带敏感内容的文本不作为业务文案展示：一律回退到调用方提供的兜底。 */
export function redactSensitiveText(text, fallback) {
  return containsSensitiveMaterial(text) ? fallback : text
}

function containsCJK(text) {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text || '')
}

function isNetworkErrorText(text) {
  return /network error|failed to fetch|ERR_NETWORK|ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|network request failed/i.test(text)
}

function isTimeoutErrorText(text) {
  return /timeout|timed?\s?out|ETIMEDOUT/i.test(text)
}

function lookupMachineCode(code) {
  return code && MACHINE_CODE_MESSAGES[code]
}

function lookupHttpStatus(error) {
  const status = error?.response?.status
  if (status && HTTP_FALLBACK_MESSAGES[status]) return HTTP_FALLBACK_MESSAGES[status]
  if (status >= 500) return HTTP_FALLBACK_MESSAGES[500]
  return null
}

/** 从形如 "Request failed with status code 500" 的 axios 消息提取状态码兜底。 */
function httpStatusFromMessage(text) {
  const match = text.match(/status code (\d{3})/i)
  if (!match) return null
  const status = Number(match[1])
  if (HTTP_FALLBACK_MESSAGES[status]) return HTTP_FALLBACK_MESSAGES[status]
  if (status >= 500) return HTTP_FALLBACK_MESSAGES[500]
  return null
}

function normalizeDetailString(text, fallback) {
  const trimmed = text.trim()
  if (!trimmed) return fallback

  // A/B. 机器错误码前缀
  const prefixMatch = trimmed.match(MACHINE_CODE_PREFIX_PATTERN)
  if (prefixMatch) {
    // C. 已知 machine code：直接返回稳定映射，完全忽略 remainder
    //    （remainder 可能携带 provider/凭据上下文，永不透出）
    const mapped = lookupMachineCode(prefixMatch[1])
    if (mapped) return mapped
    // D. 未知 code：remainder 仅在"安全中文业务文案"时保留
    const remainder = prefixMatch[2].trim()
    if (remainder && containsCJK(remainder) && !containsSensitiveMaterial(remainder)) {
      return remainder
    }
    return fallback
  }

  // D/E. 普通字符串：先过 secret 边界，再考虑保留中文业务消息
  if (containsSensitiveMaterial(trimmed)) return fallback
  if (containsCJK(trimmed)) return trimmed
  if (isTimeoutErrorText(trimmed)) return TIMEOUT_ERROR_MESSAGE
  if (isNetworkErrorText(trimmed)) return NETWORK_ERROR_MESSAGE
  const fromMessage = httpStatusFromMessage(trimmed)
  if (fromMessage) return fromMessage
  return fallback
}

function normalizeDetailObject(detail, error, fallback) {
  const code = typeof detail.code === 'string' ? detail.code.trim() : ''
  const errorCode = typeof detail.error_code === 'string' ? detail.error_code.trim() : ''
  const mapped = lookupMachineCode(code || errorCode)
  if (mapped) return mapped

  // 练习草稿保存失败：backend 返回 { message, validation: { valid, errors: [...] } }
  if (detail.validation && typeof detail.validation === 'object') {
    return '草稿校验未通过，请检查题目内容'
  }

  const candidates = [detail.message, detail.msg, detail.detail, detail.error]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      const nested = normalizeDetailString(candidate, '')
      if (nested) return nested
    }
  }
  const statusFallback = lookupHttpStatus(error)
  return statusFallback || fallback
}

export function normalizeApiError(error, defaultMessage = '操作失败，请稍后重试') {
  if (error == null) return defaultMessage

  if (typeof error === 'string') {
    return normalizeDetailString(error, defaultMessage)
  }

  if (typeof error !== 'object') {
    return defaultMessage
  }

  // FastAPI 422 校验数组：[{ loc, msg, type }]，字段名/消息是内部信息，统一安全兜底
  const rawDetail = error?.response?.data?.detail ?? error?.detail
  if (Array.isArray(rawDetail)) {
    return HTTP_FALLBACK_MESSAGES[422]
  }

  if (rawDetail && typeof rawDetail === 'object') {
    return normalizeDetailObject(rawDetail, error, defaultMessage)
  }

  if (typeof rawDetail === 'string') {
    return normalizeDetailString(rawDetail, lookupHttpStatus(error) || defaultMessage)
  }

  // axios 传输层错误：优先 error.code，其次 message
  const transportText = [error?.code, error?.message].filter((item) => typeof item === 'string').join(' ')
  if (transportText.trim()) {
    if (/ECONNABORTED/i.test(transportText) || isTimeoutErrorText(transportText)) return TIMEOUT_ERROR_MESSAGE
    if (/ERR_NETWORK/i.test(transportText) || isNetworkErrorText(transportText)) return NETWORK_ERROR_MESSAGE
    const fromMessage = httpStatusFromMessage(transportText)
    if (fromMessage) return fromMessage
    if (error?.response) {
      const statusFallback = lookupHttpStatus(error)
      if (statusFallback) return statusFallback
    }
  }

  // 自定义错误对象上的业务消息：中文保留；纯英文技术消息（含浏览器原生 Error）不透出
  for (const candidate of [error?.message, error?.msg, error?.error]) {
    if (typeof candidate === 'string' && candidate.trim()) {
      const nested = normalizeDetailString(candidate, '')
      if (nested) return nested
    }
  }

  const statusFallback = lookupHttpStatus(error)
  return statusFallback || defaultMessage
}

export default normalizeApiError
