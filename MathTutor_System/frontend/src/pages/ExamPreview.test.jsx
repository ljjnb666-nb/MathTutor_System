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

const mockAuthUser = vi.hoisted(() => ({ id: 101, username: 'teacher_a' }))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

vi.mock('react-hot-toast', () => ({ default: toast }))
vi.mock('../services/api', () => api)
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockAuthUser }),
}))
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

    it('5. location.state draft is displayed and stored under per-user key in sessionStorage', async () => {
      renderRoute(['/exams/compose'], {
        composeTitle: 'State Quiz',
        composeQuestions: [{ content: 'State Prompt' }],
      })
      expect(await screen.findByText('State Prompt')).toBeInTheDocument()
      const stored = JSON.parse(sessionStorage.getItem('mathtutor_compose_draft:v1:101') || '{}')
      expect(stored.title).toBe('State Quiz')
      expect(stored.questions).toHaveLength(1)
    })

    it('6. sessionStorage draft is restored on refresh for same teacher', async () => {
      sessionStorage.setItem(
        'mathtutor_compose_draft:v1:101',
        JSON.stringify({ version: 1, createdAt: Date.now(), title: 'Restored Draft', questions: [{ content: 'Restored Q' }] })
      )
      renderRoute(['/exams/compose'])
      expect(await screen.findByText('Restored Q')).toBeInTheDocument()
      expect(api.getExam).not.toHaveBeenCalled()
    })

    it('7. Teacher B cannot read Teacher A draft and displays empty state', async () => {
      // Store Teacher A's draft under ID 101
      sessionStorage.setItem(
        'mathtutor_compose_draft:v1:101',
        JSON.stringify({ version: 1, createdAt: Date.now(), title: 'Teacher A Draft', questions: [{ content: 'Secret Q' }] })
      )

      // Temporarily change user to Teacher B (id: 102)
      mockAuthUser.id = 102
      mockAuthUser.username = 'teacher_b'

      renderRoute(['/exams/compose'])
      expect(await screen.findByText('当前没有可预览的组卷草稿')).toBeInTheDocument()
      expect(screen.queryByText('Secret Q')).not.toBeInTheDocument()

      // Reset mock user to Teacher A
      mockAuthUser.id = 101
      mockAuthUser.username = 'teacher_a'
    })

    it('8. expired draft (>12h) is automatically cleared and returns empty state', async () => {
      const thirteenHoursAgo = Date.now() - 13 * 60 * 60 * 1000
      sessionStorage.setItem(
        'mathtutor_compose_draft:v1:101',
        JSON.stringify({ version: 1, createdAt: thirteenHoursAgo, title: 'Old Draft', questions: [{ content: 'Old Q' }] })
      )

      renderRoute(['/exams/compose'])
      expect(await screen.findByText('当前没有可预览的组卷草稿')).toBeInTheDocument()
      expect(sessionStorage.getItem('mathtutor_compose_draft:v1:101')).toBeNull()
    })

    it('9. damaged JSON or invalid schema in sessionStorage is safely cleared', async () => {
      sessionStorage.setItem('mathtutor_compose_draft:v1:101', '{ invalid json ...')
      renderRoute(['/exams/compose'])
      expect(await screen.findByText('当前没有可预览的组卷草稿')).toBeInTheDocument()
      expect(sessionStorage.getItem('mathtutor_compose_draft:v1:101')).toBeNull()
    })

    it('10. editing composeTitle syncs title to sessionStorage in real-time', async () => {
      const { container } = renderRoute(['/exams/compose'], {
        composeTitle: 'Initial Title',
        composeQuestions: [{ content: 'Sync Q' }],
      })

      const titleInput = await screen.findByDisplayValue('Initial Title')
      await userEvent.clear(titleInput)
      await userEvent.type(titleInput, 'Updated Title')

      await waitFor(() => {
        const stored = JSON.parse(sessionStorage.getItem('mathtutor_compose_draft:v1:101') || '{}')
        expect(stored.title).toBe('Updated Title')
      })
    })

    it('11. successful save clears teacher compose draft', async () => {
      sessionStorage.setItem(
        'mathtutor_compose_draft:v1:101',
        JSON.stringify({ version: 1, createdAt: Date.now(), title: 'Saved Draft', questions: [{ content: 'Q' }] })
      )
      const { container } = renderRoute(['/exams/compose'])
      expect(screen.getByDisplayValue('Saved Draft')).toBeInTheDocument()
      await userEvent.click(container.querySelector('.v2-page-actions button.v2-btn-secondary'))

      await waitFor(() => expect(api.saveExam).toHaveBeenCalled())
      expect(sessionStorage.getItem('mathtutor_compose_draft:v1:101')).toBeNull()
    })

    it('12. normal exam preview does not read compose draft', async () => {
      sessionStorage.setItem(
        'mathtutor_compose_draft:v1:101',
        JSON.stringify({ version: 1, createdAt: Date.now(), title: 'Draft Title', questions: [{ content: 'Draft Q' }] })
      )
      renderRoute(['/exams/12'])
      await waitFor(() => expect(api.getExam).toHaveBeenCalledWith(12))
      expect(screen.queryByText('Draft Title')).not.toBeInTheDocument()
    })

    it('13. converts FastAPI validation detail array to clean string', async () => {
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

    it('14. React page does not crash when error detail is a structured object', async () => {
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

    it('15. Priority Scenario 1: new location.state selection completely overwrites stale sessionStorage draft', async () => {
      sessionStorage.setItem(
        'mathtutor_compose_draft:v1:101',
        JSON.stringify({ version: 1, createdAt: Date.now(), title: 'Old Draft', questions: [{ content: 'Old Question' }] })
      )

      renderRoute(['/exams/compose'], {
        composeTitle: 'New Draft',
        composeQuestions: [{ content: 'New Question 1' }, { content: 'New Question 2' }],
      })

      expect(await screen.findByText('New Question 1')).toBeInTheDocument()
      expect(screen.getByText('New Question 2')).toBeInTheDocument()
      expect(screen.getByDisplayValue('New Draft')).toBeInTheDocument()

      expect(screen.queryByText('Old Draft')).not.toBeInTheDocument()
      expect(screen.queryByText('Old Question')).not.toBeInTheDocument()

      const stored = JSON.parse(sessionStorage.getItem('mathtutor_compose_draft:v1:101') || '{}')
      expect(stored.title).toBe('New Draft')
      expect(stored.questions).toHaveLength(2)
      expect(stored.questions[0].content).toBe('New Question 1')
    })

    it('16. Priority Scenario 2: F5 refresh after new compose restores new selection', async () => {
      sessionStorage.setItem(
        'mathtutor_compose_draft:v1:101',
        JSON.stringify({ version: 1, createdAt: Date.now(), title: 'Old Draft', questions: [{ content: 'Old Q' }] })
      )

      const { unmount } = renderRoute(['/exams/compose'], {
        composeTitle: 'New Selection',
        composeQuestions: [{ content: 'New Selection Question' }],
      })

      expect(await screen.findByText('New Selection Question')).toBeInTheDocument()
      unmount()

      renderRoute(['/exams/compose'])
      expect(await screen.findByText('New Selection Question')).toBeInTheDocument()
      expect(screen.getByDisplayValue('New Selection')).toBeInTheDocument()
      expect(screen.queryByText('Old Q')).not.toBeInTheDocument()
    })

    it('17. Priority Scenario 3: Teacher B new compose selection does not corrupt or overwrite Teacher A draft', async () => {
      sessionStorage.setItem(
        'mathtutor_compose_draft:v1:101',
        JSON.stringify({ version: 1, createdAt: Date.now(), title: 'Teacher A Old Draft', questions: [{ content: 'Teacher A Q' }] })
      )

      mockAuthUser.id = 102
      mockAuthUser.username = 'teacher_b'

      renderRoute(['/exams/compose'], {
        composeTitle: 'Teacher B New Draft',
        composeQuestions: [{ content: 'Teacher B Q' }],
      })

      expect(await screen.findByText('Teacher B Q')).toBeInTheDocument()
      const teacherBDraft = JSON.parse(sessionStorage.getItem('mathtutor_compose_draft:v1:102') || '{}')
      expect(teacherBDraft.title).toBe('Teacher B New Draft')

      const teacherADraft = JSON.parse(sessionStorage.getItem('mathtutor_compose_draft:v1:101') || '{}')
      expect(teacherADraft.title).toBe('Teacher A Old Draft')

      mockAuthUser.id = 101
      mockAuthUser.username = 'teacher_a'
    })

    it('18. Priority Scenario 4: restores old draft when no location.state is passed', async () => {
      sessionStorage.setItem(
        'mathtutor_compose_draft:v1:101',
        JSON.stringify({ version: 1, createdAt: Date.now(), title: 'Only Draft', questions: [{ content: 'Only Q' }] })
      )

      renderRoute(['/exams/compose'])
      expect(await screen.findByText('Only Q')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Only Draft')).toBeInTheDocument()
    })

    it('19. Strict Schema: draft with 1 valid question + 1 null is rejected completely', async () => {
      sessionStorage.setItem(
        'mathtutor_compose_draft:v1:101',
        JSON.stringify({ version: 1, createdAt: Date.now(), title: 'Mixed Draft', questions: [{ content: 'Valid Q' }, null] })
      )

      renderRoute(['/exams/compose'])
      expect(await screen.findByText('当前没有可预览的组卷草稿')).toBeInTheDocument()
      expect(sessionStorage.getItem('mathtutor_compose_draft:v1:101')).toBeNull()
    })

    it('20. Strict Schema: draft with 1 valid question + 1 string is rejected completely', async () => {
      sessionStorage.setItem(
        'mathtutor_compose_draft:v1:101',
        JSON.stringify({ version: 1, createdAt: Date.now(), title: 'Mixed Draft', questions: [{ content: 'Valid Q' }, 'invalid string'] })
      )

      renderRoute(['/exams/compose'])
      expect(await screen.findByText('当前没有可预览的组卷草稿')).toBeInTheDocument()
      expect(sessionStorage.getItem('mathtutor_compose_draft:v1:101')).toBeNull()
    })

    it('21. Strict Schema: draft with array element in questions is rejected completely', async () => {
      sessionStorage.setItem(
        'mathtutor_compose_draft:v1:101',
        JSON.stringify({ version: 1, createdAt: Date.now(), title: 'Mixed Draft', questions: [{ content: 'Valid Q' }, [{ nested: 'arr' }]] })
      )

      renderRoute(['/exams/compose'])
      expect(await screen.findByText('当前没有可预览的组卷草稿')).toBeInTheDocument()
      expect(sessionStorage.getItem('mathtutor_compose_draft:v1:101')).toBeNull()
    })

    it('22. Strict Schema: clearing invalid draft for Teacher A does not affect Teacher B draft', async () => {
      sessionStorage.setItem(
        'mathtutor_compose_draft:v1:101',
        JSON.stringify({ version: 1, createdAt: Date.now(), title: 'Invalid A Draft', questions: [null] })
      )
      sessionStorage.setItem(
        'mathtutor_compose_draft:v1:102',
        JSON.stringify({ version: 1, createdAt: Date.now(), title: 'Valid B Draft', questions: [{ content: 'B Q' }] })
      )

      renderRoute(['/exams/compose'])
      expect(await screen.findByText('当前没有可预览的组卷草稿')).toBeInTheDocument()
      expect(sessionStorage.getItem('mathtutor_compose_draft:v1:101')).toBeNull()
      expect(sessionStorage.getItem('mathtutor_compose_draft:v1:102')).not.toBeNull()
    })
  })
})

