import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ExamPreview from './ExamPreview'

const navigate = vi.hoisted(() => vi.fn())
const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}))
const api = vi.hoisted(() => ({
  getExam: vi.fn(),
  saveExam: vi.fn(),
  gradeExam: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

vi.mock('react-hot-toast', () => ({ default: toast }))
vi.mock('../services/api', () => api)
vi.mock('../contexts/StudentContext', () => ({
  useStudent: () => ({ currentStudent: { id: 7, name: '学生A' } }),
}))
vi.mock('../components/StudentSelectorModal', () => ({
  default: ({ open }) => (open ? <div data-testid="student-selector-modal" /> : null),
}))
vi.mock('../components/KnowledgeCard', () => ({
  default: () => <div data-testid="knowledge-card" />,
}))

const exam = {
  id: 12,
  title: '函数周测',
  questions: [
    { id: 1, content: '一次函数题', type: 'choice', options: ['1', '2'], answer: '2', analysis: '代入', knowledge_point: '一次函数', difficulty: 'L2' },
    { id: 2, content: '化简题', type: 'fill', answer: '8x', analysis: '展开', knowledge_point: '整式运算', difficulty: 'L3' },
  ],
}

function renderRoute(initialEntries = ['/exams/12'], state) {
  return render(
    <MemoryRouter initialEntries={state ? [{ pathname: initialEntries[0], state }] : initialEntries}>
      <Routes>
        <Route path="/exams/:id" element={<ExamPreview />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getExam.mockResolvedValue({ data: exam })
  api.saveExam.mockResolvedValue({ data: { id: 99 } })
  api.gradeExam.mockResolvedValue({})
})

afterEach(() => {
  cleanup()
})

describe('ExamPreview', () => {
  it('loads exam preview and toggles answers', async () => {
    renderRoute()

    expect((await screen.findAllByText('函数周测')).length).toBeGreaterThan(0)
    expect(screen.getByText('一次函数题')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText(/显示答案/))
    expect(screen.getAllByText('答案').length).toBeGreaterThan(0)
    expect(screen.getByText('代入')).toBeInTheDocument()
  })

  it('submits grading results', async () => {
    renderRoute()
    await screen.findAllByText('函数周测')

    await userEvent.click(screen.getByRole('button', { name: /开始批改/ }))
    await userEvent.click(screen.getAllByRole('button', { name: '对' })[0])
    await userEvent.click(screen.getByRole('button', { name: /提交批改/ }))

    await waitFor(() => expect(api.gradeExam).toHaveBeenCalledWith(12, expect.objectContaining({ student_id: 7 })))
    expect(toast.success).toHaveBeenCalledWith('批改结果已提交')
  })

  it('saves compose mode preview', async () => {
    renderRoute(['/exams/compose'], {
      composeTitle: '临时组卷',
      composeQuestions: [{ content: '组卷题', answer: 'A' }],
    })

    expect((await screen.findAllByText('临时组卷')).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: /保存试卷/ }))

    await waitFor(() => expect(api.saveExam).toHaveBeenCalledWith(expect.objectContaining({ title: '临时组卷' })))
    expect(navigate).toHaveBeenCalledWith('/exams/99', { replace: true })
  })

  it('shows load error', async () => {
    api.getExam.mockRejectedValueOnce(new Error('not found'))
    renderRoute()

    expect(await screen.findByText('not found')).toBeInTheDocument()
  })
})
