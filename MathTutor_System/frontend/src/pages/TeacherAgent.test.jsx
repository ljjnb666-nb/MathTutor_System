import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TeacherAgent from './TeacherAgent'

const studentContext = vi.hoisted(() => ({
  refreshStudents: vi.fn(),
}))

vi.mock('../contexts/StudentContext', () => ({
  useStudent: () => ({
    students: [{ id: 1, name: '张同学' }],
    currentStudent: null,
    refreshStudents: studentContext.refreshStudents,
  }),
}))

const api = vi.hoisted(() => ({
  createTeacherAgentRun: vi.fn(),
  getTeacherAgentRun: vi.fn(),
  getTeacherAgentRuns: vi.fn(),
}))

vi.mock('../services/teacherAgentApi', () => api)

function completedRun() {
  return {
    id: 1,
    status: 'completed',
    goal: '规划复习课',
    created_at: new Date().toISOString(),
    warnings_json: ['read only'],
    missing_fields_json: [],
    plan_json: {
      title: 'Read-only teaching plan',
      summary: '计划已生成',
      intent_type: 'review_plan',
      safety_mode: 'read_only',
      evidence_summary: { weak_points: ['一次函数'], recent_mistake_count: 2 },
      steps: [{ step_id: '1', title: '诊断', description: '查看错题', basis: '错题摘要' }],
      warnings: ['read only'],
    },
  }
}

beforeEach(() => {
  api.createTeacherAgentRun.mockReset()
  api.getTeacherAgentRun.mockReset()
  api.getTeacherAgentRuns.mockReset()
  api.getTeacherAgentRuns.mockResolvedValue({ data: [] })
  studentContext.refreshStudents.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('TeacherAgent', () => {
  it('shows read-only mode initially and blocks empty submit', async () => {
    render(<TeacherAgent />)

    expect(screen.getByText('当前为只读规划模式')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /生成教学计划/ })).toBeDisabled()
  })

  it('renders completed structured plan', async () => {
    api.createTeacherAgentRun.mockResolvedValue({ data: completedRun() })
    render(<TeacherAgent />)

    await userEvent.type(screen.getByLabelText('教学目标'), '规划复习课')
    await userEvent.click(screen.getByRole('button', { name: /生成教学计划/ }))

    expect(await screen.findByText('Read-only teaching plan')).toBeInTheDocument()
    expect(screen.getByText('一次函数')).toBeInTheDocument()
  })

  it('shows needs_input fields', async () => {
    api.createTeacherAgentRun.mockResolvedValue({
      data: {
        id: 2,
        status: 'needs_input',
        goal: '分析当前学生',
        created_at: new Date().toISOString(),
        missing_fields_json: [{ field: 'student_id', message: '请选择学生' }],
        warnings_json: [],
      },
    })
    render(<TeacherAgent />)

    await userEvent.type(screen.getByLabelText('教学目标'), '分析当前学生')
    await userEvent.click(screen.getByRole('button', { name: /生成教学计划/ }))

    expect(await screen.findByText('需要补充信息')).toBeInTheDocument()
    expect(screen.getByText('请选择学生')).toBeInTheDocument()
  })

  it('resubmits with selected student after needs_input', async () => {
    api.createTeacherAgentRun
      .mockResolvedValueOnce({
        data: {
          id: 2,
          status: 'needs_input',
          goal: '分析当前学生',
          created_at: new Date().toISOString(),
          missing_fields_json: [{ field: 'student_id', message: '请选择学生' }],
          warnings_json: [],
        },
      })
      .mockResolvedValueOnce({ data: completedRun() })
    const { container } = render(<TeacherAgent />)

    await userEvent.type(screen.getByLabelText('教学目标'), '分析当前学生')
    const button = screen.getByRole('button', { name: /生成教学计划/ })
    await userEvent.click(button)
    expect(await screen.findByText('请选择学生')).toBeInTheDocument()

    await userEvent.selectOptions(container.querySelector('select'), '1')
    await userEvent.click(button)

    await waitFor(() => expect(api.createTeacherAgentRun).toHaveBeenCalledTimes(2))
    expect(api.createTeacherAgentRun.mock.calls[1][0]).toMatchObject({ student_id: 1 })
  })

  it('shows failed safety error and prevents double submit while loading', async () => {
    let resolve
    api.createTeacherAgentRun.mockReturnValue(new Promise((res) => { resolve = res }))
    render(<TeacherAgent />)

    await userEvent.type(screen.getByLabelText('教学目标'), '删除试卷')
    const button = screen.getByRole('button', { name: /生成教学计划/ })
    await userEvent.click(button)
    expect(button).toBeDisabled()

    resolve({ data: { id: 3, status: 'failed', goal: '删除试卷', created_at: new Date().toISOString(), error_message: '只读模式拒绝写操作' } })
    expect(await screen.findByText('只读模式拒绝写操作')).toBeInTheDocument()
    expect(api.createTeacherAgentRun).toHaveBeenCalledTimes(1)
  })

  it('restores submit state and avoids duplicate history on network error', async () => {
    api.createTeacherAgentRun.mockRejectedValue(new Error('network timeout'))
    render(<TeacherAgent />)

    await userEvent.type(screen.getByLabelText('教学目标'), '规划复习课')
    const button = screen.getByRole('button', { name: /生成教学计划/ })
    await userEvent.click(button)

    expect(await screen.findByText('network timeout')).toBeInTheDocument()
    expect(button).not.toBeDisabled()
    expect(api.createTeacherAgentRun).toHaveBeenCalledTimes(1)
    expect(api.getTeacherAgentRuns).toHaveBeenCalledTimes(1)
  })

  it('only shows history records returned by API and does not leak internal prompt', async () => {
    api.getTeacherAgentRuns.mockResolvedValue({ data: [completedRun()] })
    render(<TeacherAgent />)

    expect(await screen.findByText('规划复习课')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(/SYSTEM RULES/)).not.toBeInTheDocument())
    expect(screen.queryByText(/api_key/i)).not.toBeInTheDocument()
  })
})
