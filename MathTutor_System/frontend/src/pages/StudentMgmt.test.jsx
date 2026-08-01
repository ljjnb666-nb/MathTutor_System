import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StudentMgmt from './StudentMgmt'

const navigateMock = vi.hoisted(() => vi.fn())
const hookMock = vi.hoisted(() => vi.fn())

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('../contexts/SubscriptionContext', () => ({
  useSubscription: () => ({
    atStudentLimit: false,
    refreshSubscription: vi.fn(),
  }),
}))

vi.mock('../contexts/StudentContext', () => ({
  useStudent: () => ({
    currentStudent: { id: 1, name: '张同学' },
    selectStudent: vi.fn(),
  }),
}))

vi.mock('../features/student-mgmt/hooks/useStudentMgmtState', () => ({
  useStudentMgmtState: (...args) => hookMock(...args),
}))

vi.mock('../features/student-mgmt/components/StudentFormModal', () => ({
  default: ({ modalOpen }) => (modalOpen ? <div role="dialog">学生表单</div> : null),
}))

function buildState(overrides = {}) {
  const actions = {
    closeModal: vi.fn(),
    handleDelete: vi.fn(),
    handleDownloadReport: vi.fn(),
    handleSelectAndGo: vi.fn(),
    handleSubmit: vi.fn(),
    openAdd: vi.fn(),
    openEdit: vi.fn(),
    setForm: vi.fn(),
    setSearchTerm: vi.fn(),
    ...overrides.actions,
  }
  const students = overrides.students ?? [
    { id: 1, name: '张同学', student_no: 'S2025001', grade: '高一', class_name: '1班', performance_score: 86 },
    { id: 2, name: '李同学', student_no: 'S2025002', grade: '高一', class_name: '2班', performance_score: 52 },
  ]
  return {
    actions,
    derived: { filtered: overrides.filtered ?? students },
    state: {
      atStudentLimit: false,
      editingStudent: null,
      form: {},
      loading: false,
      modalOpen: false,
      overviewMap: {
        1: { pending_mistake_count: 1, today_review_count: 2, weak_point_count: 0 },
        2: { pending_mistake_count: 12, today_review_count: 4, weak_point_count: 6 },
      },
      reportDownloadingId: null,
      saving: false,
      searchTerm: '',
      students,
      ...overrides.state,
    },
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('StudentMgmt', () => {
  it('renders table-first student overview with derived risk panels', () => {
    hookMock.mockReturnValue(buildState())

    render(<StudentMgmt />)

    expect(screen.getByRole('heading', { name: '学生管理与总览' })).toBeInTheDocument()
    expect(screen.getByText('学生总数')).toBeInTheDocument()
    expect(screen.getByText('全部学生')).toBeInTheDocument()
    expect(screen.getAllByText('张同学').length).toBeGreaterThan(0)
    expect(screen.getAllByText('李同学').length).toBeGreaterThan(0)
    expect(screen.getAllByText('高风险').length).toBeGreaterThan(0)
    expect(screen.getByText('学生分布')).toBeInTheDocument()
  })

  it('wires primary and row actions to existing handlers', async () => {
    const state = buildState()
    hookMock.mockReturnValue(state)

    render(<StudentMgmt />)

    await userEvent.click(screen.getByRole('button', { name: /添加学生/ }))
    await userEvent.click(screen.getAllByTitle('编辑')[0])
    await userEvent.click(screen.getAllByTitle('下载学习报告')[0])

    expect(state.actions.openAdd).toHaveBeenCalledTimes(1)
    expect(state.actions.openEdit).toHaveBeenCalledWith(state.state.students[0])
    expect(state.actions.handleDownloadReport).toHaveBeenCalledWith(state.state.students[0])
  })

  it('shows empty search state and reset action', async () => {
    const state = buildState({
      filtered: [],
      state: { searchTerm: '不存在' },
    })
    hookMock.mockReturnValue(state)

    render(<StudentMgmt />)

    expect(screen.getByText('没有符合搜索条件的学生。')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /清空搜索/ }))
    expect(state.actions.setSearchTerm).toHaveBeenCalledWith('')
  })
})
