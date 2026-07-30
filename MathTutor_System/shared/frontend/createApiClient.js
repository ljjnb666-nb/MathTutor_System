export function buildApiBaseURL(importMeta) {
  return typeof importMeta !== 'undefined' && importMeta.env?.DEV
    ? ''
    : (importMeta.env?.VITE_API_BASE_URL || '')
}

export function createApiClient(axios, {
  importMeta,
  tokenStorageKey,
  getExtraHeaders,
  onUnauthorized,
  onForbidden,
}) {
  const api = axios.create({
    baseURL: buildApiBaseURL(importMeta),
    timeout: 60000,
    headers: { 'Content-Type': 'application/json' },
  })

  api.interceptors.request.use((config) => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem(tokenStorageKey) : null
    if (token) config.headers.Authorization = `Bearer ${token}`
    const extraHeaders = getExtraHeaders ? getExtraHeaders() : null
    if (extraHeaders && typeof extraHeaders === 'object') {
      Object.assign(config.headers, extraHeaders)
    }
    return config
  })

  api.interceptors.response.use(
    (res) => res,
    (err) => {
      if (err.response?.status === 401 && typeof localStorage !== 'undefined') {
        localStorage.removeItem(tokenStorageKey)
        onUnauthorized?.(err)
      }
      if (err.response?.status === 403) {
        onForbidden?.(err)
      }
      return Promise.reject(err)
    }
  )

  return api
}
