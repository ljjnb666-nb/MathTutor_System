import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AIChat from './AIChat'

const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }))
const api = vi.hoisted(() => ({
  chatWithAI: vi.fn(),
  chatWithAIStream: vi.fn(),
  getChatSessions: vi.fn(),
  getChatSessionMessages: vi.fn(),
  deleteChatSession: vi.fn(),
  updateChatMessage: vi.fn(),
  updateChatSessionPin: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: toast }))
vi.mock('../services/api', () => api)
vi.mock('../contexts/StudentContext', () => ({
  useStudent: () => ({ currentStudent: { id: 7, name: '李同学' } }),
}))

function renderChat() {
  return render(
    <MemoryRouter>
      <AIChat />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  window.confirm = vi.fn(() => true)
  api.getChatSessions.mockResolvedValue([])
  api.getChatSessionMessages.mockResolvedValue([])
  api.chatWithAI.mockResolvedValue({ content: '这是解题步骤', session_id: 10 })
  api.chatWithAIStream.mockImplementation((params, onChunk, onDone) => {
    onChunk('流式回复')
    onDone({ done: true, session_id: 10 })
    return Promise.resolve()
  })
})

afterEach(() => {
  cleanup()
})

describe('AIChat V2 workspace', () => {
  it('renders empty chat state and real controls without fake capability buttons', async () => {
    renderChat()

    expect(await screen.findByText('AI 智能辅导对话')).toBeInTheDocument()
    expect(screen.getByText('空会话')).toBeInTheDocument()
    expect(screen.getByText('暂无历史会话')).toBeInTheDocument()
    expect(screen.getByLabelText('学生上下文')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /上传/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /语音/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/联网/)).not.toBeInTheDocument()
    expect(screen.queryByText(/模型选择/)).not.toBeInTheDocument()
  })

  it('loads a historical session and renders user and assistant messages', async () => {
    api.getChatSessions.mockResolvedValue([{ id: 1, title: '二次函数', created_at: '2026-08-01T09:00:00Z', pinned: true }])
    api.getChatSessionMessages.mockResolvedValue([
      { id: 11, role: 'user', content: '怎么配方？' },
      { id: 12, role: 'assistant', content: '先提取二次项系数。' },
    ])
    renderChat()

    await userEvent.click(await screen.findByRole('button', { name: /二次函数/ }))

    await waitFor(() => expect(api.getChatSessionMessages).toHaveBeenCalledWith(1))
    expect(screen.getByText('怎么配方？')).toBeInTheDocument()
    expect(screen.getByText('先提取二次项系数。')).toBeInTheDocument()
  })

  it('sends input through the existing non-stream API and supports context params', async () => {
    api.getChatSessionMessages.mockResolvedValue([
      { id: 21, role: 'user', content: '这题怎么做' },
      { id: 22, role: 'assistant', content: '这是解题步骤' },
    ])
    renderChat()

    await screen.findByText('空会话')
    await userEvent.click(screen.getByLabelText('流式回复'))
    await userEvent.click(screen.getByLabelText('学生上下文'))
    await userEvent.type(screen.getByPlaceholderText('如：二次函数'), '二次函数')
    await userEvent.type(screen.getByPlaceholderText(/输入数学疑问/), '这题怎么做')
    await userEvent.click(screen.getByRole('button', { name: /发送/ }))

    await waitFor(() => expect(api.chatWithAI).toHaveBeenCalled())
    expect(api.chatWithAI.mock.calls[0][0]).toMatchObject({
      student_id: 7,
      knowledge_point: '二次函数',
      use_knowledge_base: true,
    })
    expect(await screen.findByText('这是解题步骤')).toBeInTheDocument()
  })

  it('shows API error and retries the last message', async () => {
    api.chatWithAI.mockRejectedValueOnce(new Error('chat failed')).mockResolvedValueOnce({ content: '重试成功' })
    api.getChatSessionMessages.mockResolvedValue([
      { id: 31, role: 'user', content: '重新讲一遍' },
      { id: 32, role: 'assistant', content: '重试成功' },
    ])
    renderChat()

    await screen.findByText('空会话')
    await userEvent.click(screen.getByLabelText('流式回复'))
    await userEvent.type(screen.getByPlaceholderText(/输入数学疑问/), '重新讲一遍')
    await userEvent.click(screen.getByRole('button', { name: /发送/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('chat failed')
    await userEvent.click(screen.getByRole('button', { name: '重试' }))

    await waitFor(() => expect(api.chatWithAI).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('重试成功')).toBeInTheDocument()
  })

  it('shows stream errors without leaving an empty assistant reply', async () => {
    api.chatWithAIStream.mockImplementation((params, onChunk, onDone) => {
      onDone({ error: '未配置 API Key。（HTTP 400）' })
      return Promise.resolve()
    })
    renderChat()

    await screen.findByText('空会话')
    await userEvent.type(screen.getByPlaceholderText(/输入数学疑问/), '测试流式错误')
    await userEvent.click(screen.getByRole('button', { name: /发送/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('未配置 API Key。（HTTP 400）')
    expect(screen.queryByText('（无回复）')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
  })
})
