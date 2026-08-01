import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import HomeworkProgress from './HomeworkProgress'

const hookMock = vi.hoisted(() => vi.fn())

vi.mock('../features/homework/hooks/useHomeworkProgressState', () => ({
  useHomeworkProgressState: (...args) => hookMock(...args),
}))

vi.mock('../features/homework/components/HomeworkManagePanel', () => ({
  default: () => <section>作业管理面板</section>,
}))

vi.mock('../features/homework/components/QuestionPickerModal', () => ({
  default: ({ open, title }) => (open ? <div role="dialog">{title}</div> : null),
}))

vi.mock('../components/StudentSelectorModal', () => ({
  default: ({ open }) => (open ? <div role="dialog">选择学生</div> : null),
}))

function makeExam(overrides = {}) {
  return {
    id: 1,
    title: '5月20日 数学作业',
    student_id: 1,
    student_name: '李明宇',
    created_at: '2026-08-01T08:00:00Z',
    graded_at: '2026-08-01T09:00:00Z',
    questions: [
      { content: '函数单调性', knowledge_point: '函数的单调性' },
      { content: '几何证明', knowledge_point: '几何意义' },
    ],
    grade_results: [
      { question_index: 0, is_correct: false },
      { question_index: 1, is_correct: true },
    ],
    ...overrides,
  }
}

function buildState(overrides = {}) {
  const assignedExams = overrides.assignedExams ?? [
    makeExam(),
    makeExam({
      id: 2,
      student_id: 2,
      student_name: '王梓涵',
      graded_at: null,
      grade_results: [],
    }),
  ]
  const questionRows = [
    { key: '1-0', examId: 1, student_name: '李明宇', examTitle: '5月20日 数学作业', created_at: '2026-08-01T08:00:00Z', graded_at: '2026-08-01T09:00:00Z', contentSnippet: '函数单调性', is_correct: false, submitted: true },
    { key: '1-1', examId: 1, student_name: '李明宇', examTitle: '5月20日 数学作业', created_at: '2026-08-01T08:00:00Z', graded_at: '2026-08-01T09:00:00Z', contentSnippet: '几何证明', is_correct: true, submitted: true },
    { key: '2-0', examId: 2, student_name: '王梓涵', examTitle: '5月20日 数学作业', created_at: '2026-08-01T08:00:00Z', graded_at: null, contentSnippet: '函数单调性', is_correct: null, submitted: false },
  ]
  const actions = {
    fetchData: vi.fn(),
    fetchDraft: vi.fn(),
    handleAddFromBank: vi.fn(),
    handleAddFromMistakes: vi.fn(),
    handleAssignToStudents: vi.fn(),
    handleDeleteExam: vi.fn(),
    handleRemoveFromDraft: vi.fn(),
    setAddBankOpen: vi.fn(),
    setAddMistakesOpen: vi.fn(),
    setAssignModalOpen: vi.fn(),
    setAssignmentDate: vi.fn(),
    setFilterStatus: vi.fn(),
    setFilterStudent: vi.fn(),
    setMainTab: vi.fn(),
    setSortBy: vi.fn(),
    ...overrides.actions,
  }
  return {
    actions,
    derived: {
      assignedExams,
      filtered: questionRows,
      hasFilters: false,
      questionRows,
      stats: { total: 4, submitted: 2, correct: 1, wrong: 1, pending: 2 },
      ...overrides.derived,
    },
    state: {
      addBankOpen: false,
      addMistakesOpen: false,
      assignModalOpen: false,
      assignmentDate: '2026-08-01',
      draft: null,
      draftLoading: false,
      exams: assignedExams,
      filterStatus: 'all',
      filterStudent: '',
      loading: false,
      mainTab: 'progress',
      removingQuestionIndex: null,
      sortBy: 'time',
      ...overrides.state,
    },
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('HomeworkProgress', () => {
  it('renders the V2 progress dashboard from assigned exams', () => {
    hookMock.mockReturnValue(buildState())

    render(<HomeworkProgress />)

    expect(screen.getByRole('heading', { name: '学生做题情况' })).toBeInTheDocument()
    expect(screen.getByText('完成作业人数')).toBeInTheDocument()
    expect(screen.getByText('正确率趋势')).toBeInTheDocument()
    expect(screen.getByText('异常提醒')).toBeInTheDocument()
    expect(screen.getAllByText('李明宇').length).toBeGreaterThan(0)
    expect(screen.getAllByText('王梓涵').length).toBeGreaterThan(0)
  })

  it('wires refresh and filter controls to existing handlers', async () => {
    const state = buildState()
    hookMock.mockReturnValue(state)

    render(<HomeworkProgress />)

    await userEvent.click(screen.getByRole('button', { name: /刷新/ }))
    await userEvent.type(screen.getByPlaceholderText('搜索学生姓名...'), '李')
    await userEvent.selectOptions(screen.getByLabelText('状态'), 'wrong')

    expect(state.actions.fetchData).toHaveBeenCalledTimes(1)
    expect(state.actions.setFilterStudent).toHaveBeenCalled()
    expect(state.actions.setFilterStatus).toHaveBeenCalledWith('wrong')
  })

  it('keeps the existing homework management tab available', async () => {
    const state = buildState({ state: { mainTab: 'manage' } })
    hookMock.mockReturnValue(state)

    render(<HomeworkProgress />)

    expect(screen.getByText('作业管理面板')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '做题情况' }))
    expect(state.actions.setMainTab).toHaveBeenCalledWith('progress')
  })
})
