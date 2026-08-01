import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Settings from './Settings'
import { testLlmConnection } from '../services/llmApi'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { username: 'admin', role: 'admin' },
  }),
}))

vi.mock('../services/llmApi', () => ({
  testLlmConnection: vi.fn(),
}))

function installMatchMedia(matches) {
  window.matchMedia = vi.fn(() => ({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('ui_theme', 'auto')
  localStorage.setItem('ui_accent', 'green')
  localStorage.setItem('ui_density', 'compact')
  localStorage.setItem('app_settings', JSON.stringify({
    provider: 'openai',
    model: 'gpt-4.1-mini',
    apiKeysByProvider: { openai: 'sk-test-secret-1234' },
    baseUrlsByProvider: { openai: 'https://proxy.example/v1' },
    showThinking: true,
  }))
  document.documentElement.dataset.theme = 'dark'
  document.documentElement.dataset.accent = ''
  document.documentElement.dataset.density = ''
  installMatchMedia(false)
  window.confirm = vi.fn(() => true)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Settings V2 console', () => {
  it('renders setting categories and resolves auto theme without writing auto to data-theme', async () => {
    render(<Settings />)

    expect(await screen.findByText('系统设置')).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: '设置分类' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /个人资料/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /系统外观/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /AI 本地偏好/ })).toBeInTheDocument()

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'))
    expect(document.documentElement.dataset.theme).not.toBe('auto')
    expect(localStorage.getItem('ui_theme')).toBe('auto')
  })

  it('saves appearance preferences and updates document datasets', async () => {
    render(<Settings />)

    await screen.findByRole('heading', { name: '系统外观' })
    await userEvent.selectOptions(screen.getByLabelText('主题模式'), 'dark')
    await userEvent.selectOptions(screen.getByLabelText('强调色'), 'blue')
    await userEvent.selectOptions(screen.getByLabelText('布局密度'), 'spacious')
    await userEvent.click(screen.getByRole('button', { name: /保存外观设置/ }))

    expect(localStorage.getItem('ui_theme')).toBe('dark')
    expect(localStorage.getItem('ui_accent')).toBe('blue')
    expect(localStorage.getItem('ui_density')).toBe('spacious')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.dataset.accent).toBe('blue')
    expect(document.documentElement.dataset.density).toBe('spacious')
    expect(screen.getByRole('status')).toHaveTextContent('外观设置已保存')
  })

  it('keeps API key masked in status text and saves AI local preferences', async () => {
    render(<Settings />)

    expect(await screen.findByDisplayValue('https://proxy.example/v1')).toBeInTheDocument()
    const keyInput = screen.getByLabelText('API Key')
    expect(keyInput).toHaveAttribute('type', 'password')
    expect(screen.getByTestId('api-key-mask')).toHaveTextContent('sk-t...1234')
    expect(screen.queryByText('sk-test-secret-1234')).not.toBeInTheDocument()

    await userEvent.clear(keyInput)
    await userEvent.type(keyInput, 'sk-new-secret-9999')
    await userEvent.click(screen.getByRole('button', { name: /显示 API Key/ }))
    expect(keyInput).toHaveAttribute('type', 'text')
    await userEvent.click(screen.getByRole('button', { name: /保存 AI 偏好/ }))

    const stored = JSON.parse(localStorage.getItem('app_settings'))
    expect(stored.provider).toBe('openai')
    expect(stored.model).toBe('gpt-4.1-mini')
    expect(stored.apiKeysByProvider.openai).toBe('sk-new-secret-9999')
    expect(stored.baseUrlsByProvider.openai).toBe('https://proxy.example/v1')
    expect(stored.apiKey).toBe('sk-new-secret-9999')
    expect(stored.baseUrl).toBe('https://proxy.example/v1')
    expect(stored.showThinking).toBe(true)
  })

  it('tests API key through the backend LLM endpoint headers', async () => {
    testLlmConnection.mockResolvedValue({
      ok: true,
      provider: 'openai',
      model: 'gpt-4.1-mini',
      message: '模型连接正常',
    })
    render(<Settings />)

    await screen.findByDisplayValue('https://proxy.example/v1')
    await userEvent.click(screen.getByRole('button', { name: /测试 API Key/ }))

    await waitFor(() => expect(screen.getByTestId('api-key-test-result')).toHaveTextContent('测试通过'))
    expect(testLlmConnection).toHaveBeenCalledWith(expect.objectContaining({
      'x-llm-provider': 'openai',
      'x-llm-model': 'gpt-4.1-mini',
      'x-llm-base-url': 'https://proxy.example/v1',
      'x-llm-api-key': 'sk-test-secret-1234',
    }))
    expect(screen.queryByText('sk-test-secret-1234')).not.toBeInTheDocument()
  })

  it('shows test failure without exposing the API key', async () => {
    testLlmConnection.mockResolvedValue({ ok: false, message: 'API Key 无效或没有访问该模型的权限。' })
    render(<Settings />)

    await screen.findByDisplayValue('https://proxy.example/v1')
    await userEvent.click(screen.getByRole('button', { name: /测试 API Key/ }))

    await waitFor(() => expect(screen.getByTestId('api-key-test-result')).toHaveTextContent('API Key 无效'))
    expect(screen.queryByText('sk-test-secret-1234')).not.toBeInTheDocument()
  })

  it('clears only local settings after confirmation', async () => {
    render(<Settings />)

    await screen.findByRole('heading', { name: '数据与隐私' })
    await userEvent.click(screen.getByRole('button', { name: /清除本地配置/ }))

    expect(window.confirm).toHaveBeenCalled()
    expect(localStorage.getItem('app_settings')).toBeNull()
    expect(localStorage.getItem('ui_theme')).toBeNull()
    expect(localStorage.getItem('ui_accent')).toBeNull()
    expect(localStorage.getItem('ui_density')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('本地配置已清除')
  })
})
