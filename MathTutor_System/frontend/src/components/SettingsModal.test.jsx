import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsModal from './SettingsModal'

const toolsApi = vi.hoisted(() => ({
  testLlmApiKey: vi.fn(),
}))

vi.mock('../services/toolsApi', () => toolsApi)

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('app_settings', JSON.stringify({
    provider: 'openai',
    model: 'gpt-4.1-mini',
    apiKey: 'old-key',
    baseUrl: 'https://api.openai.com/v1',
    apiKeysByProvider: { openai: 'old-key' },
    baseUrlsByProvider: { openai: 'https://api.openai.com/v1' },
  }))
  toolsApi.testLlmApiKey.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('SettingsModal API key test', () => {
  it('tests the current form values and shows success without saving first', async () => {
    toolsApi.testLlmApiKey.mockResolvedValue({
      ok: true,
      provider: 'openai',
      model: 'gpt-4.1-mini',
      latency_ms: 42,
      message: 'API Key 可用',
    })

    render(<SettingsModal open onClose={() => {}} />)

    const apiKeyInput = screen.getByDisplayValue('old-key')
    await userEvent.clear(apiKeyInput)
    await userEvent.type(apiKeyInput, 'new-key')
    await userEvent.click(screen.getByRole('button', { name: '测试 API Key' }))

    await waitFor(() => expect(toolsApi.testLlmApiKey).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'openai',
      apiKey: 'new-key',
      model: 'gpt-4.1-mini',
      baseUrl: 'https://api.openai.com/v1',
    })))
    expect(await screen.findByText(/可用：openai \/ gpt-4.1-mini/)).toBeInTheDocument()
    expect(localStorage.getItem('app_settings')).toContain('old-key')
  })

  it('shows sanitized failure message', async () => {
    toolsApi.testLlmApiKey.mockResolvedValue({
      ok: false,
      provider: 'openai',
      model: 'gpt-4.1-mini',
      latency_ms: 10,
      message: 'invalid [redacted] token',
    })

    render(<SettingsModal open onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: '测试 API Key' }))

    expect(await screen.findByText(/不可用：invalid \[redacted\] token/)).toBeInTheDocument()
    expect(screen.queryByText(/old-key/)).not.toBeInTheDocument()
  })
})
