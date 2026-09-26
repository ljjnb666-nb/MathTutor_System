import { beforeEach, describe, expect, it } from 'vitest'
import { getActiveLlmConfig, saveActiveLlmConfig } from './ai-providers'

// Deterministic runtime construction of key-shaped test fixtures: the
// complete credential-like literals are not stored statically in the source
// tree, while the values compared and persisted by these tests keep the
// same credential-like shape at runtime.
const keyFixture = (label) => [label, 'key'].join('-')

beforeEach(() => {
  localStorage.clear()
})

describe('active LLM config storage', () => {
  it('prefers provider-specific key and base URL', () => {
    localStorage.setItem('app_settings', JSON.stringify({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      apiKey: keyFixture('flat'),
      baseUrl: 'https://flat.example',
      apiKeysByProvider: { deepseek: keyFixture('provider'), openai: keyFixture('other') },
      baseUrlsByProvider: { deepseek: 'https://api.deepseek.com/' },
    }))

    expect(getActiveLlmConfig()).toMatchObject({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      apiKey: keyFixture('provider'),
      baseUrl: 'https://api.deepseek.com',
    })
  })

  it('keeps old flat localStorage compatible', () => {
    localStorage.setItem('app_settings', JSON.stringify({
      provider: 'openai',
      model: 'gpt-4.1-mini',
      apiKey: keyFixture('legacy'),
      baseUrl: 'https://legacy.example/v1',
    }))

    expect(getActiveLlmConfig()).toMatchObject({
      provider: 'openai',
      apiKey: keyFixture('legacy'),
      baseUrl: 'https://api.openai.com/v1',
    })
  })

  it('saves provider map and mirrors the active provider for compatibility', () => {
    saveActiveLlmConfig({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      apiKey: keyFixture('saved'),
      baseUrl: 'https://api.deepseek.com/',
      apiVersion: '',
      showThinking: true,
    })

    const stored = JSON.parse(localStorage.getItem('app_settings'))
    expect(stored.apiKeysByProvider.deepseek).toBe(keyFixture('saved'))
    expect(stored.baseUrlsByProvider.deepseek).toBe('https://api.deepseek.com')
    expect(stored.apiKey).toBe(keyFixture('saved'))
    expect(stored.baseUrl).toBe('https://api.deepseek.com')
    expect(getActiveLlmConfig().apiKey).toBe(keyFixture('saved'))
  })

  it('keeps custom provider Base URL configurable in localStorage', () => {
    saveActiveLlmConfig({
      provider: 'custom',
      model: 'custom-model',
      apiKey: keyFixture('custom'),
      baseUrl: 'https://proxy.example/v1/',
      apiVersion: '',
    })

    expect(getActiveLlmConfig()).toMatchObject({
      provider: 'custom',
      apiKey: keyFixture('custom'),
      baseUrl: 'https://proxy.example/v1',
    })
  })
})
