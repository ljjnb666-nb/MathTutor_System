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
    const remainder = prefixMatch[2].trim()
    // 后端若已附带中文业务文案，按原文保留（含标点）
    if (remainder && containsCJK(remainder)) return remainder
    const mapped = prefixMatch[1] && MACHINE_CODE_MESSAGES[prefixMatch[1]]
    if (mapped) return mapped
    return fallback
  }
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
