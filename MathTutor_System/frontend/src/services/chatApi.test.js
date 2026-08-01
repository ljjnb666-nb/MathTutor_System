import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chatWithAIStream } from './chatApi'

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('app_settings', JSON.stringify({
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    apiKeysByProvider: { deepseek: 'stream-secret' },
    baseUrlsByProvider: { deepseek: 'https://api.deepseek.com' },
  }))
})

describe('chat stream API', () => {
  it('sends shared LLM headers for stream requests', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"done":true}\\n'))
        controller.close()
      },
    })
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, body }))

    await chatWithAIStream({ messages: [{ role: 'user', content: 'hi' }] }, vi.fn(), vi.fn())

    expect(fetch).toHaveBeenCalledWith('/api/chat/stream', expect.objectContaining({
      headers: expect.objectContaining({
        'x-llm-provider': 'deepseek',
        'x-llm-model': 'deepseek-v4-flash',
        'x-llm-base-url': 'https://api.deepseek.com',
        'x-llm-api-key': 'stream-secret',
      }),
    }))
  })

  it('formats JSON detail errors instead of showing raw JSON', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      clone() {
        return this
      },
      json: () => Promise.resolve({ detail: '未配置 API Key。' }),
      text: () => Promise.resolve('{"detail":"未配置 API Key。"}'),
    }))
    const onDone = vi.fn()

    await chatWithAIStream({ messages: [{ role: 'user', content: 'hi' }] }, vi.fn(), onDone)

    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith({ error: '未配置 API Key。（HTTP 400）' })
  })
})
