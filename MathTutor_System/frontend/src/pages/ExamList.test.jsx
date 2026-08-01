import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ExamList from './ExamList'

const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}))
const api = vi.hoisted(() => ({
  getExams: vi.fn(),
  deleteExam: vi.fn(),
  saveExam: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: toast }))
vi.mock('../services/api', () => api)
vi.mock('../components/StudentSelectorModal', () => ({
  default: ({ open }) => (open ? <div data-testid="student-selector-modal" /> : null),
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <ExamList />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  window.confirm = vi.fn(() => true)
  api.deleteExam.mockResolvedValue({})
  api.getExams.mockResolvedValue({
    data: [
      { id: 1, title: '八年级函数周测', questions: [{ content: '1' }, { content: '2' }], created_at: '2026-07-20T08:00:00Z' },
      { id: 2, title: '几何辅导讲义', questions: { knowledge_card: {}, questions: [{ content: '1' }] }, student_name: '陈一诺', created_at: '2026-07-21T08:00:00Z' },
    ],
  })
})

afterEach(() => {
  cleanup()
})

describe('ExamList', () => {
  it('renders saved exams and metrics', async () => {
    renderPage()

    expect(await screen.findByText('八年级函数周测')).toBeInTheDocument()
    expect(screen.getByText('几何辅导讲义')).toBeInTheDocument()
    expect(screen.getByText('2 份资产')).toBeInTheDocument()
    expect(screen.getAllByText('辅导讲义').length).toBeGreaterThan(0)
    expect(screen.getByText('已布置给 陈一诺')).toBeInTheDocument()
  })

  it('filters by search text', async () => {
    renderPage()
    await screen.findByText('八年级函数周测')

    await userEvent.type(screen.getByPlaceholderText('搜索标题或学生...'), '几何')

    expect(screen.queryByText('八年级函数周测')).not.toBeInTheDocument()
    expect(screen.getByText('几何辅导讲义')).toBeInTheDocument()
  })

  it('shows error state and retries', async () => {
    api.getExams.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce({ data: [] })
    renderPage()

    expect(await screen.findByText('network down')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '重试' }))

    await waitFor(() => expect(api.getExams).toHaveBeenCalledTimes(2))
  })

  it('deletes an exam after confirmation', async () => {
    renderPage()
    await screen.findByText('八年级函数周测')

    await userEvent.click(screen.getAllByTitle('删除试卷')[0])

    await waitFor(() => expect(api.deleteExam).toHaveBeenCalledWith(1))
    expect(toast.success).toHaveBeenCalledWith('已删除试卷')
  })
})
