import axios from 'axios'
import { createApiClient } from '../../../shared/frontend/createApiClient'

const STORAGE_KEY = 'app_settings'
export const AUTH_TOKEN_KEY = 'math_tutor_auth_token'
export const SESSION_EXPIRED_KEY = 'math_tutor_session_expired'

export function getAppSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export const apiBaseURL =
  typeof import.meta !== 'undefined' && import.meta.env?.DEV
    ? ''
    : (import.meta.env?.VITE_API_BASE_URL || '')

const api = createApiClient(axios, {
  importMeta: import.meta,
  tokenStorageKey: AUTH_TOKEN_KEY,
  getExtraHeaders: () => {
    const settings = getAppSettings()
    if (!settings) return null
    const headers = {}
    if (settings.provider) headers['x-llm-provider'] = settings.provider
    if (settings.apiKey) headers['x-llm-api-key'] = settings.apiKey
    if (settings.baseUrl) headers['x-llm-base-url'] = settings.baseUrl
    if (settings.model) headers['x-llm-model'] = settings.model
    return headers
  },
  onUnauthorized: () => {
    if (typeof sessionStorage !== 'undefined' && typeof window !== 'undefined' && window.location.pathname !== '/login') {
      sessionStorage.setItem(SESSION_EXPIRED_KEY, '1')
      window.location.assign('/login')
    }
  },
  onForbidden: (err) => {
    const detail = err.response?.data?.detail ?? ''
    if (typeof detail === 'string' && (detail.includes('升级') || detail.includes('套餐'))) {
      err.upgradeRequired = true
      err.upgradeMessage = detail
    }
  },
})

export function buildAuthHeaders() {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null
  const settings = getAppSettings()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (settings?.provider) headers['x-llm-provider'] = settings.provider
  if (settings?.apiKey) headers['x-llm-api-key'] = settings.apiKey
  if (settings?.baseUrl) headers['x-llm-base-url'] = settings.baseUrl
  if (settings?.model) headers['x-llm-model'] = settings.model
  return headers
}

export default api
