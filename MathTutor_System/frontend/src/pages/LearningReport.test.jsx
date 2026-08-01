import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LearningReport from './LearningReport'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
const api = vi.hoisted(() => ({
  parseLearningReportDraft: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: toast }))
vi.mock('../services/api', () => api)

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('LearningReport V2 editor', () => {
  it('renders student, period, metrics, and empty preview', () => {
    render(<LearningReport embedded studentNameHint="李同学" reportPeriod="1w" />)

    expect(screen.getByText('学习指标')).toBeInTheDocument()
    expect(screen.getByDisplayValue('李同学')).toBeInTheDocument()
    expect(screen.getByDisplayValue('近 1 周')).toBeInTheDocument()
    expect(screen.getByText('暂无学习报告')).toBeInTheDocument()
  })

  it('validates empty manual report and then generates from teacher input', async () => {
    render(<LearningReport embedded studentNameHint="李同学" />)

    await userEvent.click(screen.getByRole('button', { name: /生成学习报告/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('请至少填写')

    await userEvent.type(screen.getByPlaceholderText('如：一元二次方程解法'), '二次函数图像')
    await userEvent.type(screen.getByPlaceholderText('知识点或能力点'), '几何综合')
    await userEvent.type(screen.getByLabelText('预计还需课时'), '2')
    await userEvent.click(screen.getByRole('button', { name: /生成学习报告/ }))

    expect(screen.getByText('二次函数图像')).toBeInTheDocument()
    expect(screen.getByText('几何综合')).toBeInTheDocument()
    expect(screen.getByText('预计课时')).toBeInTheDocument()
  })

  it('uses the existing AI parse API and renders returned structured data', async () => {
    api.parseLearningReportDraft.mockResolvedValue({
      mastered: ['函数基础'],
      weak_points: [{ point: '压轴题', description: '思路不稳定' }],
      estimated_hours: 3,
    })
    render(<LearningReport embedded studentNameHint="李同学" />)

    await userEvent.click(screen.getByRole('button', { name: 'AI 提取' }))
    await userEvent.type(screen.getByPlaceholderText(/今天学了二次函数/), '函数基础掌握，压轴题需要巩固')
    await userEvent.click(screen.getByRole('button', { name: /AI 提取并生成/ }))

    await waitFor(() => expect(api.parseLearningReportDraft).toHaveBeenCalledWith({ draft: '函数基础掌握，压轴题需要巩固' }))
    expect(await screen.findByText('函数基础')).toBeInTheDocument()
    expect(screen.getByText('压轴题：思路不稳定')).toBeInTheDocument()
  })

  it('shows API error without blanking the page', async () => {
    api.parseLearningReportDraft.mockRejectedValue(new Error('parse failed'))
    render(<LearningReport embedded />)

    await userEvent.click(screen.getByRole('button', { name: 'AI 提取' }))
    await userEvent.type(screen.getByPlaceholderText(/今天学了二次函数/), '需要解析')
    await userEvent.click(screen.getByRole('button', { name: /AI 提取并生成/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('parse failed')
    expect(screen.getByText('学习报告预览')).toBeInTheDocument()
  })
})
