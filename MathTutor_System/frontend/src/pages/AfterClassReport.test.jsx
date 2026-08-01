import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AfterClassReport from './AfterClassReport'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
const api = vi.hoisted(() => ({
  generateAfterClassComment: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: toast }))
vi.mock('../services/api', () => api)
vi.mock('../contexts/StudentContext', () => ({
  useStudent: () => ({ currentStudent: { name: '上下文学生' } }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } })
})

afterEach(() => {
  cleanup()
})

describe('AfterClassReport V2 editor', () => {
  it('renders classroom summary, advice editor, and empty preview', () => {
    render(<AfterClassReport embedded studentNameHint="李同学" reportPeriod="term" />)

    expect(screen.getByText('课后总结')).toBeInTheDocument()
    expect(screen.getByDisplayValue('李同学')).toBeInTheDocument()
    expect(screen.getByDisplayValue('本学期')).toBeInTheDocument()
    expect(screen.getByText('暂无报告内容')).toBeInTheDocument()
  })

  it('generates a comment with the existing API from performance and keywords', async () => {
    api.generateAfterClassComment.mockResolvedValue({ comment: '李同学本节课专注度较好，计算仍需巩固。' })
    render(<AfterClassReport embedded studentNameHint="李同学" />)

    await userEvent.type(screen.getByPlaceholderText('关键词 1'), '计算')
    await userEvent.click(screen.getByRole('button', { name: /生成课后评语/ }))

    await waitFor(() => expect(api.generateAfterClassComment).toHaveBeenCalled())
    expect(api.generateAfterClassComment.mock.calls[0][0]).toMatchObject({
      focus_level: 3,
      mastery_level: 3,
      keywords: ['计算'],
      student_name: '李同学',
    })
    expect(await screen.findByText('李同学本节课专注度较好，计算仍需巩固。')).toBeInTheDocument()
  })

  it('keeps the page usable on API error', async () => {
    api.generateAfterClassComment.mockRejectedValue(new Error('server down'))
    render(<AfterClassReport embedded />)

    await userEvent.type(screen.getByPlaceholderText('关键词 1'), '专注')
    await userEvent.click(screen.getByRole('button', { name: /生成课后评语/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('server down')
    expect(screen.getByText('家长反馈预览')).toBeInTheDocument()
  })

  it('polishes a teacher draft without adding unsupported actions', async () => {
    api.generateAfterClassComment.mockResolvedValue({ comment: '修饰后的家长沟通内容。' })
    render(<AfterClassReport embedded studentNameHint="王同学" />)

    await userEvent.type(screen.getByPlaceholderText('写一段课堂表现，再由 AI 修饰。'), '课堂积极，但审题需要慢一点。')
    await userEvent.click(screen.getByRole('button', { name: /AI 修饰草稿/ }))

    await waitFor(() => expect(api.generateAfterClassComment).toHaveBeenCalledWith({
      draft: '课堂积极，但审题需要慢一点。',
      template: undefined,
      student_name: '王同学',
    }))
    expect(screen.queryByRole('button', { name: /导出/ })).not.toBeInTheDocument()
    expect(await screen.findByText('修饰后的家长沟通内容。')).toBeInTheDocument()
  })
})
