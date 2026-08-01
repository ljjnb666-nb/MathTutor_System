import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Reports from './Reports'

const api = vi.hoisted(() => ({
  getStudents: vi.fn(),
  generateAfterClassComment: vi.fn(),
  parseLearningReportDraft: vi.fn(),
}))

vi.mock('../services/api', () => api)
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../contexts/StudentContext', () => ({
  useStudent: () => ({ currentStudent: null }),
}))

function renderReports(route = '/reports') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Reports />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getStudents.mockResolvedValue({
    data: [
      { id: 1, name: '李同学' },
      { id: 2, name: '王同学' },
    ],
  })
})

afterEach(() => {
  cleanup()
})

describe('Reports V2 workspace', () => {
  it('renders filters, empty real report list, and after-class editor from real students', async () => {
    renderReports()

    expect(screen.getByText('正在加载报告工作台')).toBeInTheDocument()
    expect(await screen.findByText('课后与学习报告')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '学生' })).toHaveValue('1')
    expect(screen.getByText('真实历史报告')).toBeInTheDocument()
    expect(screen.getByText('暂无真实报告记录')).toBeInTheDocument()
    expect(screen.getByText('暂无真实趋势数据')).toBeInTheDocument()
    expect(screen.queryByText('趋势提升')).not.toBeInTheDocument()
  })

  it('switches report type and keeps the selected student context', async () => {
    renderReports()

    await screen.findByText('课后与学习报告')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '学生' }), '2')
    await userEvent.click(screen.getByRole('button', { name: /学习报告/ }))

    expect(screen.getByText('学习报告预览')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '学生' })).toHaveValue('2')
    expect(screen.getAllByDisplayValue('王同学').length).toBeGreaterThan(0)
  })

  it('shows empty student state without fake report rows', async () => {
    api.getStudents.mockResolvedValue({ data: [] })

    renderReports()

    expect(await screen.findByText('暂无学生档案')).toBeInTheDocument()
    expect(screen.getByText('暂无真实报告记录')).toBeInTheDocument()
  })

  it('shows API error and retries loading students', async () => {
    api.getStudents.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce({ data: [{ id: 3, name: '赵同学' }] })

    renderReports()

    expect(await screen.findByText('报告工作台加载失败')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '重试' }))

    await waitFor(() => expect(api.getStudents).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('combobox', { name: '学生' })).toHaveValue('3')
    expect(screen.getAllByText('赵同学').length).toBeGreaterThan(0)
  })
})
