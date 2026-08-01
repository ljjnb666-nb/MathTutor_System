import axios from 'axios'
import { createApiClient } from '../../../shared/frontend/createApiClient'
import { getActiveLlmConfig } from '../constants/ai-providers'

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

export function shouldSendClientLlmHeaders(importMeta = import.meta) {
  const explicit = importMeta?.env?.VITE_ALLOW_CLIENT_LLM_CONFIG
  if (explicit != null && explicit !== '') {
    return String(explicit).toLowerCase() === 'true'
  }
  return Boolean(importMeta?.env?.DEV)
}

export function buildClientLlmHeaders(importMeta = import.meta) {
  if (!shouldSendClientLlmHeaders(importMeta)) return null
  const settings = getAppSettings()
  if (!settings) return null
  return buildLlmHeadersFromConfig(getActiveLlmConfig(settings))
}

export function buildLlmHeadersFromConfig(config) {
  if (!config) return null
  const headers = {}
  if (config.provider) headers['x-llm-provider'] = config.provider
  if (config.model) headers['x-llm-model'] = config.model
  if (config.baseUrl) headers['x-llm-base-url'] = config.baseUrl
  if (config.apiVersion) headers['x-llm-api-version'] = config.apiVersion
  if (config.apiKey) headers['x-llm-api-key'] = config.apiKey
  return Object.keys(headers).length ? headers : null
}

export const apiBaseURL =
  typeof import.meta !== 'undefined' && import.meta.env?.DEV
    ? ''
    : (import.meta.env?.VITE_API_BASE_URL || '')

const api = createApiClient(axios, {
  importMeta: import.meta,
  tokenStorageKey: AUTH_TOKEN_KEY,
  getExtraHeaders: buildClientLlmHeaders,
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
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  Object.assign(headers, buildClientLlmHeaders() || {})
  return headers
}

export default api
