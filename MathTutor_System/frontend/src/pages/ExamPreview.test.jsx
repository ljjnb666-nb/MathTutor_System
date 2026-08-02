import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
  useStudent: () => ({ currentStudent: { id: 7, name: 'Student A' } }),
}))
vi.mock('../components/StudentSelectorModal', () => ({
  default: ({ open }) => (open ? <div data-testid="student-selector-modal" /> : null),
}))
vi.mock('../components/KnowledgeCard', () => ({
  default: () => <div data-testid="knowledge-card" />,
}))

const exam = {
  id: 12,
  title: 'Function Quiz',
  questions: [
    {
      id: 1,
      content: 'Linear function prompt',
      type: 'choice',
      options: ['1', '2'],
      answer: '2',
      analysis: 'Substitute',
      knowledge_point: 'Linear functions',
      difficulty: 'L2',
    },
    {
      id: 2,
      content: 'Simplify expression',
      type: 'fill',
      answer: '8x',
      analysis: 'Expand',
      knowledge_point: 'Algebra',
      difficulty: 'L3',
    },
  ],
}

const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8')

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
    const { container } = renderRoute()

    expect((await screen.findAllByText('Function Quiz')).length).toBeGreaterThan(0)
    expect(screen.getByText('Linear function prompt')).toBeInTheDocument()

    await userEvent.click(container.querySelector('.v2-toggle input'))
    expect(screen.getAllByText('2').length).toBeGreaterThan(0)
    expect(screen.getByText('Substitute')).toBeInTheDocument()
  })

  it('renders A4 preview inside a dedicated white paper surface', async () => {
    const { container } = renderRoute()

    const frame = await screen.findByTestId('exam-preview-paper-frame')
    const paper = await screen.findByTestId('exam-preview-paper')
    expect(frame).toHaveClass('v2-preview-paper-frame')
    expect(paper).toHaveClass('v2-preview-paper', 'a4', 'columns-1')
    expect(paper).not.toHaveClass('v2-section-card')
    expect(container.querySelector('.v2-preview-paper-header')).toBeInTheDocument()
    expect(container.querySelectorAll('.v2-preview-question')).toHaveLength(2)
  })

  it('keeps paper styling independent from dark theme panel variables', () => {
    const paperRule = css.match(/\.v2-preview-paper\s*\{[^}]+\}/)?.[0] ?? ''
    const frameRule = css.match(/\.v2-preview-paper-frame\s*\{\s*@apply[^}]+\}/)?.[0] ?? ''

    expect(paperRule).toContain('background: #ffffff')
    expect(paperRule).toContain('color: #111827')
    expect(paperRule).toContain('color-scheme: light')
    expect(paperRule).not.toContain('var(--color-bg-panel)')
    expect(frameRule).toContain('overflow-x-auto')
  })

  it('shows empty state without rendering a paper when there are no questions', async () => {
    api.getExam.mockResolvedValueOnce({ data: { ...exam, questions: [] } })
    const emptyRender = renderRoute()

    await waitFor(() => expect(emptyRender.container.querySelector('.v2-state')).toBeInTheDocument())
    expect(screen.queryByTestId('exam-preview-paper')).not.toBeInTheDocument()
    expect(emptyRender.container.querySelector('.v2-btn-primary')).toBeDisabled()
  })

  it('submits grading results', async () => {
    const { container } = renderRoute()
    await screen.findByTestId('exam-preview-paper')

    const sideButtons = container.querySelectorAll('aside button')
    await userEvent.click(sideButtons[0])
    await userEvent.click(container.querySelectorAll('.v2-mark-button')[0])
    await userEvent.click(sideButtons[1])

    await waitFor(() => expect(api.gradeExam).toHaveBeenCalledWith(12, expect.objectContaining({ student_id: 7 })))
    expect(toast.success).toHaveBeenCalled()
  })

  it('saves compose mode preview', async () => {
    const { container } = renderRoute(['/exams/compose'], {
      composeTitle: 'Compose Quiz',
      composeQuestions: [{ content: 'Compose prompt', answer: 'A' }],
    })

    expect((await screen.findAllByText('Compose Quiz')).length).toBeGreaterThan(0)
    await userEvent.click(container.querySelector('.v2-page-actions button.v2-btn-secondary'))

    await waitFor(() => expect(api.saveExam).toHaveBeenCalledWith(expect.objectContaining({ title: 'Compose Quiz' })))
    expect(navigate).toHaveBeenCalledWith('/exams/99', { replace: true })
  })

  it('shows load error', async () => {
    api.getExam.mockRejectedValueOnce(new Error('not found'))
    renderRoute()

    expect(await screen.findByText('not found')).toBeInTheDocument()
  })

  describe('V3-01 Phase 3A Hardened Requirements', () => {
    afterEach(() => {
      sessionStorage.clear()
    })

    it('1. compose mode does not call getExam', async () => {
      renderRoute(['/exams/compose'], {
        composeTitle: 'Draft Exam',
        composeQuestions: [{ content: 'Q1' }],
      })
      expect((await screen.findAllByText('Draft Exam')).length).toBeGreaterThan(0)
      expect(api.getExam).not.toHaveBeenCalled()
    })

    it('2. valid numeric id calls getExam', async () => {
      renderRoute(['/exams/42'])
      await waitFor(() => expect(api.getExam).toHaveBeenCalledWith(42))
    })

    it('3. compose route is not converted to NaN API request', async () => {
      renderRoute(['/exams/compose'])
      await screen.findByText('当前没有可预览的组卷草稿')
      expect(api.getExam).not.toHaveBeenCalledWith(NaN)
    })

    it('4. invalid string id does not call getExam', async () => {
      renderRoute(['/exams/invalid-id'])
      await screen.findByText('无效的试卷 ID')
      expect(api.getExam).not.toHaveBeenCalled()
    })

    it('5. location.state draft is displayed and stored in sessionStorage', async () => {
      renderRoute(['/exams/compose'], {
        composeTitle: 'State Quiz',
        composeQuestions: [{ content: 'State Prompt' }],
      })
      expect(await screen.findByText('State Prompt')).toBeInTheDocument()
      const stored = JSON.parse(sessionStorage.getItem('mathtutor_compose_draft') || '{}')
      expect(stored.title).toBe('State Quiz')
      expect(stored.questions).toHaveLength(1)
    })

    it('6. sessionStorage draft is restored on refresh (when location.state is missing)', async () => {
      sessionStorage.setItem(
        'mathtutor_compose_draft',
        JSON.stringify({ title: 'Restored Draft', questions: [{ content: 'Restored Q' }] })
      )
      renderRoute(['/exams/compose'])
      expect(await screen.findByText('Restored Q')).toBeInTheDocument()
      expect(api.getExam).not.toHaveBeenCalled()
    })

    it('7. damaged JSON in sessionStorage is safely handled', async () => {
      sessionStorage.setItem('mathtutor_compose_draft', '{ invalid json ...')
      renderRoute(['/exams/compose'])
      expect(await screen.findByText('当前没有可预览的组卷草稿')).toBeInTheDocument()
      expect(sessionStorage.getItem('mathtutor_compose_draft')).toBeNull()
    })

    it('8. empty draft displays friendly empty state with action link to question bank', async () => {
      renderRoute(['/exams/compose'])
      expect(await screen.findByText('当前没有可预览的组卷草稿')).toBeInTheDocument()
      const link = screen.getByRole('link', { name: '返回题库选择题目' })
      expect(link).toHaveAttribute('href', '/question-bank')
    })

    it('9. successful save clears sessionStorage draft', async () => {
      sessionStorage.setItem(
        'mathtutor_compose_draft',
        JSON.stringify({ title: 'Saved Draft', questions: [{ content: 'Q' }] })
      )
      const { container } = renderRoute(['/exams/compose'])
      expect(screen.getByDisplayValue('Saved Draft')).toBeInTheDocument()
      await userEvent.click(container.querySelector('.v2-page-actions button.v2-btn-secondary'))

      await waitFor(() => expect(api.saveExam).toHaveBeenCalled())
      expect(sessionStorage.getItem('mathtutor_compose_draft')).toBeNull()
    })

    it('10. normal exam preview does not read compose draft', async () => {
      sessionStorage.setItem(
        'mathtutor_compose_draft',
        JSON.stringify({ title: 'Draft Title', questions: [{ content: 'Draft Q' }] })
      )
      renderRoute(['/exams/12'])
      await waitFor(() => expect(api.getExam).toHaveBeenCalledWith(12))
      expect(screen.queryByText('Draft Title')).not.toBeInTheDocument()
    })

    it('11. converts FastAPI validation detail array to clean string', async () => {
      api.getExam.mockRejectedValueOnce({
        response: {
          data: {
            detail: [
              { loc: ['body', 'id'], msg: 'field required', type: 'value_error.missing' },
            ],
          },
        },
      })
      renderRoute(['/exams/99'])
      expect(await screen.findByText('id: field required')).toBeInTheDocument()
    })

    it('12. React page does not crash when error detail is a structured object', async () => {
      api.getExam.mockRejectedValueOnce({
        response: {
          data: {
            detail: [{ loc: ['path', 'id'], msg: 'value is not a valid integer' }],
          },
        },
      })
      const { container } = renderRoute(['/exams/99'])
      await waitFor(() => expect(container.querySelector('.v2-state-error')).toBeInTheDocument())
      expect(screen.getByText('id: value is not a valid integer')).toBeInTheDocument()
    })
  })
})

