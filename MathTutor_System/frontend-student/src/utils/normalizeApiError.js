/**
 * 学生端用户可见错误信息的统一归一化（与教师端 frontend/src/utils/normalizeApiError.js 同语义）。
 *
 * 归一化顺序：
 * 1. 已登记的结构化错误码 → 稳定中文文案
 * 2. 机器错误码前缀（"XXX_YYY_ERROR: ..."）→ 隐藏前缀，只保留中文部分
 * 3. 后端已提供的中文业务消息 → 原样保留
 * 4. 已知网络 / 超时 / HTTP 传输层错误 → 稳定中文文案
 * 5. 通用中文兜底
 */

const MACHINE_CODE_MESSAGES = {
  EXAM_GRADING_ERROR: '提交批改结果失败，请稍后重试',
  REPORT_GENERATION_ERROR: '生成报告失败，请稍后重试',
  REPORT_PROVIDER_ERROR: '学情报告服务暂时不可用，请稍后重试',
  LLM_PROVIDER_ERROR: 'AI 服务暂时不可用，请稍后重试',
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

const MACHINE_CODE_PREFIX_PATTERN = /^([A-Z][A-Z0-9_]{2,}):\s*(.+)$/

// ---- Secret redaction boundary（与教师端 frontend/src/utils/normalizeApiError.js 契约一致）----
// 凭据形状检测（fail-closed）：按"形状"识别 credential 内容；命中即整串丢弃并
// 回退到安全中文兜底，绝不遮罩后继续展示。
// credential 字段 + 赋值形状：field=value / field: value / "field": "value"
// 字段名用结构化变体（[_-]? / [_-]）避免手工枚举遗漏；compact apiKey 由
// case-insensitive 的 api[_-]?key 覆盖；值允许引号包裹（JSON-ish）或裸 token。
// 与教师端 frontend/src/utils/normalizeApiError.js 契约一致。
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

const BEARER_BASIC_PATTERN = /\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{4,}/i

const KNOWN_KEY_SHAPE_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{10,})/

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

function lookupHttpStatus(error) {
  const status = error?.response?.status
  if (status && HTTP_FALLBACK_MESSAGES[status]) return HTTP_FALLBACK_MESSAGES[status]
  if (status >= 500) return HTTP_FALLBACK_MESSAGES[500]
  return null
}

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

  const prefixMatch = trimmed.match(MACHINE_CODE_PREFIX_PATTERN)
  if (prefixMatch) {
    // 已知 machine code：直接返回稳定映射，完全忽略 remainder
    const mapped = prefixMatch[1] && MACHINE_CODE_MESSAGES[prefixMatch[1]]
    if (mapped) return mapped
    // 未知 code：remainder 仅在"安全中文业务文案"时保留
    const remainder = prefixMatch[2].trim()
    if (remainder && containsCJK(remainder) && !containsSensitiveMaterial(remainder)) {
      return remainder
    }
    return fallback
  }

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
  const mapped = (code || errorCode) && MACHINE_CODE_MESSAGES[code || errorCode]
  if (mapped) return mapped

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

  // FastAPI 422 校验数组：内部字段名/消息统一安全兜底
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
