import { beforeEach, describe, expect, it } from 'vitest'
import { getActiveLlmConfig, saveActiveLlmConfig } from './ai-providers'

beforeEach(() => {
  localStorage.clear()
})

describe('active LLM config storage', () => {
  it('prefers provider-specific key and base URL', () => {
    localStorage.setItem('app_settings', JSON.stringify({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      apiKey: 'flat-key',
      baseUrl: 'https://flat.example',
      apiKeysByProvider: { deepseek: 'provider-key', openai: 'other-key' },
      baseUrlsByProvider: { deepseek: 'https://api.deepseek.com/' },
    }))

    expect(getActiveLlmConfig()).toMatchObject({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      apiKey: 'provider-key',
      baseUrl: 'https://api.deepseek.com',
    })
  })

  it('keeps old flat localStorage compatible', () => {
    localStorage.setItem('app_settings', JSON.stringify({
      provider: 'openai',
      model: 'gpt-4.1-mini',
      apiKey: 'legacy-key',
      baseUrl: 'https://legacy.example/v1',
    }))

    expect(getActiveLlmConfig()).toMatchObject({
      provider: 'openai',
      apiKey: 'legacy-key',
      baseUrl: 'https://api.openai.com/v1',
    })
  })

  it('saves provider map and mirrors the active provider for compatibility', () => {
    saveActiveLlmConfig({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      apiKey: 'saved-key',
      baseUrl: 'https://api.deepseek.com/',
      apiVersion: '',
      showThinking: true,
    })

    const stored = JSON.parse(localStorage.getItem('app_settings'))
    expect(stored.apiKeysByProvider.deepseek).toBe('saved-key')
    expect(stored.baseUrlsByProvider.deepseek).toBe('https://api.deepseek.com')
    expect(stored.apiKey).toBe('saved-key')
    expect(stored.baseUrl).toBe('https://api.deepseek.com')
    expect(getActiveLlmConfig().apiKey).toBe('saved-key')
  })

  it('keeps custom provider Base URL configurable in localStorage', () => {
    saveActiveLlmConfig({
      provider: 'custom',
      model: 'custom-model',
      apiKey: 'custom-key',
      baseUrl: 'https://proxy.example/v1/',
      apiVersion: '',
    })

    expect(getActiveLlmConfig()).toMatchObject({
      provider: 'custom',
      apiKey: 'custom-key',
      baseUrl: 'https://proxy.example/v1',
    })
  })
})
