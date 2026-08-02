export function normalizeApiError(error, defaultMessage = '操作失败') {
  if (!error) return defaultMessage
  if (typeof error === 'string') {
    const trimmed = error.trim()
    return trimmed || defaultMessage
  }

  // Extract candidate detail from standard error locations
  const detail = error?.response?.data?.detail ?? error?.detail ?? error?.message ?? error

  if (typeof detail === 'string') {
    const trimmed = detail.trim()
    return trimmed || defaultMessage
  }

  if (Array.isArray(detail)) {
    const formatted = detail
      .map((item) => {
        if (typeof item === 'string') return item.trim()
        if (item && typeof item === 'object') {
          const loc = Array.isArray(item.loc)
            ? item.loc.filter((l) => l !== 'body' && l !== 'query' && l !== 'path').join('.')
            : ''
          const msg = item.msg || item.message || item.type || ''
          return loc ? `${loc}: ${msg}` : msg
        }
        return ''
      })
      .filter(Boolean)
      .join('; ')
    return formatted || defaultMessage
  }

  if (detail && typeof detail === 'object') {
    if (typeof detail.msg === 'string' && detail.msg.trim()) return detail.msg.trim()
    if (typeof detail.message === 'string' && detail.message.trim()) return detail.message.trim()
    if (typeof detail.detail === 'string' && detail.detail.trim()) return detail.detail.trim()
    // For all unknown objects, do NOT serialize via JSON.stringify or String()
    return defaultMessage
  }

  return defaultMessage
}

export default normalizeApiError
