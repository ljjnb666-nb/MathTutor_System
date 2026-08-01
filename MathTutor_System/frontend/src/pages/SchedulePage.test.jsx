import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import SchedulePage from './SchedulePage'
import { getWeekBounds, todayStr } from '../features/schedule/utils/dateRanges'

const hookMock = vi.hoisted(() => vi.fn())

vi.mock('../contexts/StudentContext', () => ({
  useStudent: () => ({
    currentStudent: { id: 1, name: '张同学' },
  }),
}))

vi.mock('../features/schedule/hooks/useSchedulePageState', () => ({
  useSchedulePageState: (...args) => hookMock(...args),
}))

vi.mock('../features/schedule/components/ScheduleFormModal', () => ({
  default: ({ modalOpen }) => (modalOpen ? <div role="dialog">排课表单</div> : null),
}))

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T12:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function makeState(overrides = {}) {
  const [weekStart] = getWeekBounds()
  const schedules = overrides.schedules ?? [
    {
      id: 1,
      student_id: 1,
      student_name: '张同学',
      schedule_date: weekStart,
      start_time: '09:00',
      end_time: '10:00',
      subject: '代数基础',
      note: '函数预习',
      is_recurring: true,
    },
    {
      id: 2,
      student_id: 2,
      student_name: '李同学',
      schedule_date: weekStart,
      start_time: '09:30',
      end_time: '10:30',
      subject: '几何专题',
      note: '',
      is_recurring: false,
    },
    {
      id: 3,
      student_id: 1,
      student_name: '张同学',
      schedule_date: todayStr(),
      start_time: '14:00',
      end_time: '15:00',
      subject: '函数与方程',
      note: '',
      is_recurring: false,
    },
    {
      id: 4,
      student_id: 3,
      student_name: '王同学',
      schedule_date: addDays(weekStart, 2),
      start_time: '16:00',
      end_time: '17:00',
      subject: '数学拓展',
      note: '',
      is_recurring: false,
    },
  ]
  const conflictMap = overrides.conflictMap ?? new Map([[1, [2]], [2, [1]]])
  const actions = {
    closeModal: vi.fn(),
    handleDelete: vi.fn(),
    handleSubmit: vi.fn(),
    openAdd: vi.fn(),
    openCopy: vi.fn(),
    openEdit: vi.fn(),
    refreshSchedules: vi.fn(),
    setAllRangeSub: vi.fn(),
    setDateRange: vi.fn(),
    setFilterStudentId: vi.fn(),
    setForm: vi.fn(),
    setFormStudentDropdownOpen: vi.fn(),
    setScheduleView: vi.fn(),
    setSortOrder: vi.fn(),
    ...overrides.actions,
  }

  return {
    actions,
    derived: {
      conflictMap,
      filteredSchedules: schedules,
      selectedStudent: { id: 1, name: '张同学' },
      sortedSchedules: schedules,
      ...overrides.derived,
    },
    state: {
      allRangeSub: '3m',
      dateRange: 'week',
      editingSchedule: null,
      filterStudentId: null,
      form: {},
      formStudentDropdownOpen: false,
      loading: false,
      modalOpen: false,
      saving: false,
      scheduleView: 'upcoming',
      sortOrder: 'timeAsc',
      schedules,
      students: [
        { id: 1, name: '张同学' },
        { id: 2, name: '李同学' },
        { id: 3, name: '王同学' },
      ],
      ...overrides.state,
    },
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SchedulePage', () => {
  it('renders V2 week calendar, metrics, today panel, and conflict panel from real schedules', () => {
    hookMock.mockReturnValue(makeState())

    render(<SchedulePage />)

    expect(screen.getByRole('heading', { name: '排课' })).toBeInTheDocument()
    expect(screen.getByText('周课程表')).toBeInTheDocument()
    expect(screen.getByText('今日课程')).toBeInTheDocument()
    expect(screen.getAllByText('代数基础').length).toBeGreaterThan(0)
    expect(screen.getAllByText('几何专题').length).toBeGreaterThan(0)
    expect(screen.getByText('排课冲突提醒')).toBeInTheDocument()
    expect(screen.getByText('本月排课概览')).toBeInTheDocument()
  })

  it('wires header and calendar actions to existing handlers', async () => {
    const state = makeState()
    hookMock.mockReturnValue(state)

    render(<SchedulePage />)

    await userEvent.click(screen.getByRole('button', { name: /刷新/ }))
    await userEvent.click(screen.getByRole('button', { name: /添加排课/ }))
    await userEvent.click(screen.getAllByTitle('复制排课')[0])
    await userEvent.click(screen.getAllByTitle('编辑排课')[0])

    expect(state.actions.refreshSchedules).toHaveBeenCalledTimes(1)
    expect(state.actions.openAdd).toHaveBeenCalledTimes(1)
    expect(state.actions.openCopy).toHaveBeenCalledWith(state.derived.sortedSchedules[0])
    expect(state.actions.openEdit).toHaveBeenCalledWith(state.derived.sortedSchedules[0])
  })

  it('keeps existing filter controls and shows empty week state', async () => {
    const state = makeState({
      schedules: [],
      conflictMap: new Map(),
      derived: { filteredSchedules: [], sortedSchedules: [] },
    })
    hookMock.mockReturnValue(state)

    render(<SchedulePage />)

    expect(screen.getByText('本周暂无排课')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('范围'), 'month')
    await userEvent.selectOptions(screen.getByLabelText('学生'), '2')
    await userEvent.click(screen.getByRole('button', { name: '历史记录' }))

    expect(state.actions.setDateRange).toHaveBeenCalledWith('month')
    expect(state.actions.setFilterStudentId).toHaveBeenCalledWith(2)
    expect(state.actions.setScheduleView).toHaveBeenCalledWith('history')
  })
})
