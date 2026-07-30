import { beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.fn()

vi.mock('./httpClient', () => ({
  default: { post },
}))

const { testLlmApiKey } = await import('./toolsApi')

beforeEach(() => {
  post.mockReset()
})

describe('toolsApi', () => {
  it('sends API key test config in the request body', async () => {
    post.mockResolvedValue({ data: { ok: true } })

    await testLlmApiKey({
      provider: 'deepseek',
      apiKey: 'current-key',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
    })

    expect(post).toHaveBeenCalledWith('/api/tools/test-llm-key', {
      provider: 'deepseek',
      api_key: 'current-key',
      base_url: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
    }, expect.objectContaining({
      skipStoredLlmHeaders: true,
      timeout: 30000,
    }))
    expect(post.mock.calls[0][2].headers).toBeUndefined()
  })
})
