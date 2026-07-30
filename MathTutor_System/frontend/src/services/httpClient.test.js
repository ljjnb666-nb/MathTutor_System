import { beforeEach, describe, expect, it } from 'vitest'
import { AUTH_TOKEN_KEY, buildAuthHeaders, buildClientLlmHeaders, shouldSendClientLlmHeaders } from './httpClient'

const settings = {
  provider: 'openai',
  apiKey: 'client-secret',
  baseUrl: 'https://client.example',
  model: 'client-model',
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('app_settings', JSON.stringify(settings))
})

describe('httpClient LLM headers', () => {
  it('does not send LLM headers in production by default', () => {
    const meta = { env: { DEV: false } }

    expect(shouldSendClientLlmHeaders(meta)).toBe(false)
    expect(buildClientLlmHeaders(meta)).toBeNull()
  })

  it('does not send configured LLM headers in development by default', () => {
    const meta = { env: { DEV: true } }

    expect(shouldSendClientLlmHeaders(meta)).toBe(false)
    expect(buildClientLlmHeaders(meta)).toBeNull()
  })

  it('sends configured LLM headers only when explicitly enabled in development', () => {
    const meta = { env: { DEV: true, VITE_ALLOW_CLIENT_LLM_CONFIG: 'true' } }

    expect(shouldSendClientLlmHeaders(meta)).toBe(true)
    expect(buildClientLlmHeaders(meta)).toEqual({
      'x-llm-provider': 'openai',
      'x-llm-api-key': 'client-secret',
      'x-llm-base-url': 'https://client.example',
      'x-llm-model': 'client-model',
    })
  })

  it('uses explicit VITE_ALLOW_CLIENT_LLM_CONFIG before DEV default', () => {
    expect(shouldSendClientLlmHeaders({ env: { DEV: true, VITE_ALLOW_CLIENT_LLM_CONFIG: 'false' } })).toBe(false)
    expect(shouldSendClientLlmHeaders({ env: { DEV: false, VITE_ALLOW_CLIENT_LLM_CONFIG: 'true' } })).toBe(false)
  })

  it('keeps buildAuthHeaders consistent with client LLM header policy', () => {
    localStorage.setItem(AUTH_TOKEN_KEY, 'token-a')

    const headers = buildAuthHeaders()

    expect(headers.Authorization).toBe('Bearer token-a')
    expect(headers['Content-Type']).toBe('application/json')
    if (import.meta.env.DEV && import.meta.env.VITE_ALLOW_CLIENT_LLM_CONFIG === 'true') {
      expect(headers['x-llm-api-key']).toBe('client-secret')
    } else {
      expect(headers['x-llm-api-key']).toBeUndefined()
    }
  })
})
