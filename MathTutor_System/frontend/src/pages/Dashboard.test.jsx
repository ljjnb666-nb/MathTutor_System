import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import Dashboard from './Dashboard'
import * as api from '../services/api'

// Hoisted mock state
const mockState = vi.hoisted(() => ({
  user: { id: 1, username: '李老师', role: 'teacher' },
  currentStudent: { id: 101, name: '张小凡', grade: '九年级', class_name: '1班' },
  subscription: {
    plan: { code: 'pro', name: '专业版' },
    student_count: 5,
    max_students: 20,
    period_end: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
  },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockState.user }),
}))

vi.mock('../contexts/StudentContext', () => ({
  useStudent: () => ({ currentStudent: mockState.currentStudent }),
}))

vi.mock('../contexts/SubscriptionContext', () => ({
  useSubscription: () => ({ subscription: mockState.subscription, loading: false }),
}))

// Recharts ResponsiveContainer Mock
vi.mock('recharts', async () => {
  const actual = await vi.importActual('recharts')
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => <div data-testid="responsive-container">{children}</div>,
  }
})

function LocationWatcher() {
  const location = useLocation()
  return <div data-testid="current-route">{location.pathname}{location.search}</div>
}

function renderDashboard(initialEntries = ['/'], currentStudent = mockState.currentStudent) {
  mockState.currentStudent = currentStudent
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/" element={<><Dashboard /><LocationWatcher /></>} />
        <Route path="/teacher-agent" element={<div data-testid="page-teacher-agent">AI 助教</div>} />
        <Route path="/smart-gen" element={<div data-testid="page-smart-gen">智能出题</div>} />
        <Route path="/schedule" element={<div data-testid="page-schedule">排课日程</div>} />
        <Route path="/student-mgmt" element={<div data-testid="page-student-mgmt">学生管理</div>} />
        <Route path="/mistake-book" element={<div data-testid="page-mistake-book">错题本</div>} />
        <Route path="/exams" element={<div data-testid="page-exams">全部试卷</div>} />
        <Route path="/exams/:id" element={<div data-testid="page-exam-detail">试卷详情</div>} />
        <Route path="/pricing" element={<div data-testid="page-pricing">套餐方案</div>} />
        <Route path="/question-bank" element={<div data-testid="page-question-bank">题库中心</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Dashboard / Teacher Home Workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.currentStudent = { id: 101, name: '张小凡', grade: '九年级', class_name: '1班' }

    vi.spyOn(api, 'getDashboardStats').mockResolvedValue({
      data: {
        total_questions: 128,
        total_exams: 26,
        total_students: 12,
        today_review_count: 3,
        recent_exams: [
          {
            id: 1,
            title: '期中模拟测验卷A',
            created_at: '2026-10-01T10:00:00Z',
            student_name: '张小凡',
            student_id: 101,
            graded_at: '2026-10-02T10:00:00Z',
            grade_summary: { correct: 18, total: 20 },
          },
          {
            id: 2,
            title: '随堂阶段检测试卷B',
            created_at: '2026-10-03T10:00:00Z',
            student_name: null,
            student_id: null,
            graded_at: null,
            grade_summary: null,
          },
        ],
        knowledge_distribution: [
          { tag: '力学基础', count: 42 },
          { tag: '现代文阅读', count: 35 },
          { tag: '语法填空', count: 28 },
        ],
      },
    })

    vi.spyOn(api, 'getMistakes').mockResolvedValue({
      data: [{ id: 1 }, { id: 2 }, { id: 3 }],
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('DASHBOARD-TRUTH-01: pending mistakes = 0 shows 0 / 当前暂无待巩固错题 and NEVER 知识掌握 100%', async () => {
    vi.spyOn(api, 'getMistakes').mockResolvedValue({ data: [] })
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('当前暂无待巩固错题')).toBeInTheDocument()
    })

    // Assert absence of false positive mastery claims
    expect(screen.queryByText(/知识掌握 100%/)).not.toBeInTheDocument()
    expect(screen.queryByText(/全部掌握/)).not.toBeInTheDocument()
    expect(screen.queryByText(/状态优秀/)).not.toBeInTheDocument()
  })

  it('DASHBOARD-TRUTH-02: today_review_count = 0 shows 今日暂无待复习记录 and NEVER 保持完美记录', async () => {
    vi.spyOn(api, 'getDashboardStats').mockResolvedValue({
      data: {
        total_questions: 10,
        total_exams: 5,
        total_students: 2,
        today_review_count: 0,
        recent_exams: [],
        knowledge_distribution: [],
      },
    })
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('今日暂无待复习记录')).toBeInTheDocument()
    })

    // Assert absence of ungrounded vanity copy
    expect(screen.queryByText(/保持完美记录/)).not.toBeInTheDocument()
    expect(screen.queryByText(/学习状态很好/)).not.toBeInTheDocument()
  })

  it('DASHBOARD-TRUTH-03: getMistakes failure displays 暂不可用 and NEVER 0', async () => {
    vi.spyOn(api, 'getMistakes').mockRejectedValue(new Error('Network failure'))
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('暂不可用')).toBeInTheDocument()
      expect(screen.getByText('数据加载异常')).toBeInTheDocument()
    })

    // Must not show authoritative zero when call fails
    expect(screen.queryByText('当前暂无待巩固错题')).not.toBeInTheDocument()
  })

  it('DASHBOARD-TRUTH-04: canonical Dashboard contains zero synthetic KPIs', async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText(/李老师/)).toBeInTheDocument()
    })

    expect(screen.queryByText(/教学效率/)).not.toBeInTheDocument()
    expect(screen.queryByText(/AI 教学评分/)).not.toBeInTheDocument()
    expect(screen.queryByText(/学生健康指数/)).not.toBeInTheDocument()
    expect(screen.queryByText(/学习增长率/)).not.toBeInTheDocument()
    expect(screen.queryByText(/综合掌握度/)).not.toBeInTheDocument()
    expect(screen.queryByText(/今日完成度/)).not.toBeInTheDocument()
    expect(screen.queryByText(/教师效率/)).not.toBeInTheDocument()
  })

  it('DASHBOARD-CROSS-SUBJECT: static copy is subject neutral without hardcoded math bias', async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText(/李老师/)).toBeInTheDocument()
    })

    expect(screen.queryByText(/数学学情/)).not.toBeInTheDocument()
    expect(screen.queryByText(/数学能力/)).not.toBeInTheDocument()
    expect(screen.queryByText(/计算能力/)).not.toBeInTheDocument()
    expect(screen.queryByText(/函数掌握/)).not.toBeInTheDocument()
  })

  it('DASHBOARD-PRIMARY-WORKFLOW: wires all primary action entries to canonical routes', async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('AI 教师助手')).toBeInTheDocument()
    })

    // 1. 智能出题
    const smartGenLink = screen.getByRole('link', { name: /智能出题/ })
    expect(smartGenLink).toHaveAttribute('href', '/smart-gen')

    // 2. 错题巩固
    const mistakeLink = screen.getByRole('link', { name: /错题巩固/ })
    expect(mistakeLink).toHaveAttribute('href', '/mistake-book')

    // 3. 排课日程
    const scheduleLink = screen.getByRole('link', { name: /排课日程/ })
    expect(scheduleLink).toHaveAttribute('href', '/schedule')

    // 4. 学生管理
    const studentLink = screen.getByRole('link', { name: /学生管理/ })
    expect(studentLink).toHaveAttribute('href', '/student-mgmt')

    // 5. AI 教师助手 (navigates away)
    const agentBtn = screen.getByRole('button', { name: /进入助教工作区/ })
    fireEvent.click(agentBtn)
    expect(screen.getByTestId('page-teacher-agent')).toBeInTheDocument()
  })

  it('DASHBOARD-CURRENT-STUDENT: displays student context and navigates to mistake review', async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('张小凡')).toBeInTheDocument()
    })
    expect(screen.getByText('九年级 · 1班')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1)
    })

    // Click pending mistakes -> navigates to /mistake-book
    const mistakeButton = screen.getByText('待巩固错题').closest('button')
    fireEvent.click(mistakeButton)
    expect(screen.getByTestId('page-mistake-book')).toBeInTheDocument()
  })

  it('DASHBOARD-EMPTY-STUDENT: renders high-quality empty state when no student selected', async () => {
    renderDashboard(['/'], null)

    await waitFor(() => {
      expect(screen.getByText('尚未选择学生')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '前往学生管理' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '前往学生管理' }))
    expect(screen.getByTestId('page-student-mgmt')).toBeInTheDocument()
  })

  it('DASHBOARD-STALE-PROTECTION: rapid student changes do not leak outdated async responses', async () => {
    let resolveFirstStudent
    let resolveSecondStudent

    const firstPromise = new Promise((resolve) => {
      resolveFirstStudent = resolve
    })
    const secondPromise = new Promise((resolve) => {
      resolveSecondStudent = resolve
    })

    vi.spyOn(api, 'getMistakes').mockImplementation(({ student_id }) => {
      if (student_id === 101) return firstPromise
      if (student_id === 102) return secondPromise
      return Promise.resolve({ data: [] })
    })

    mockState.currentStudent = { id: 101, name: '学生A' }
    const { rerender } = render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
        </Routes>
      </MemoryRouter>
    )

    // Rapidly switch to Student B before A resolves
    mockState.currentStudent = { id: 102, name: '学生B' }
    rerender(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
        </Routes>
      </MemoryRouter>
    )

    // Resolve Student B first with 5 mistakes
    resolveSecondStudent({ data: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }] })
    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument()
    })

    // Resolve Student A late with 1 mistake
    resolveFirstStudent({ data: [{ id: 99 }] })

    // Must still display 5 for Student B, NOT overridden by Student A's late response
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.queryByText('99')).not.toBeInTheDocument()
  })

  it('DASHBOARD-ERROR-MODEL: stats failure renders error banner with functional retry and keeps navigation', async () => {
    vi.spyOn(api, 'getDashboardStats')
      .mockRejectedValueOnce(new Error('Network timeout'))
      .mockResolvedValueOnce({
        data: {
          total_questions: 50,
          total_exams: 10,
          total_students: 5,
          today_review_count: 1,
          recent_exams: [],
          knowledge_distribution: [],
        },
      })

    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('工作台统计加载受阻')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '重新加载' })).toBeInTheDocument()
    })

    // Navigation is still operational
    expect(screen.getByRole('button', { name: /进入助教工作区/ })).toBeInTheDocument()

    // Click retry
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }))

    await waitFor(() => {
      expect(screen.queryByText('工作台统计加载受阻')).not.toBeInTheDocument()
      expect(screen.getByText('50')).toBeInTheDocument()
    })
  })

  it('DASHBOARD-RECENT-EXAMS: renders recent exams list with graded status', async () => {
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('期中模拟测验卷A')).toBeInTheDocument()
      expect(screen.getByText('随堂阶段检测试卷B')).toBeInTheDocument()
      expect(screen.getByText('已批改 18/20')).toBeInTheDocument()
      expect(screen.getByText('已归档')).toBeInTheDocument()
    })

    const examItem = screen.getByText('期中模拟测验卷A').closest('button')
    fireEvent.click(examItem)
    expect(screen.getByTestId('page-exam-detail')).toBeInTheDocument()
  })
})
