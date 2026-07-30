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
  createPracticeDraft: vi.fn(),
  updatePracticeArtifact: vi.fn(),
  preparePracticeSave: vi.fn(),
  confirmPracticeAction: vi.fn(),
  cancelPracticeAction: vi.fn(),
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

function artifact(version = 1) {
  return {
    id: 10,
    agent_run_id: 1,
    status: 'ready_for_confirmation',
    version,
    title: 'Practice Draft',
    validation_json: { valid: true, question_count: 5, errors: [], warnings: [] },
    content_json: {
      title: 'Practice Draft',
      summary: 'Five questions',
      knowledge_points: ['一次函数'],
      difficulty_distribution: { medium: 5 },
      safety_mode: 'draft_only',
      warnings: [],
      questions: Array.from({ length: 5 }, (_, i) => ({
        client_question_id: `q-${i + 1}`,
        question_type: 'choice',
        stem: `Question ${i + 1}`,
        options: ['A', 'B', 'C', 'D'],
        answer: 'B',
        explanation: `Explanation ${i + 1}`,
        knowledge_points: ['一次函数'],
        difficulty: 'medium',
        score: 10,
        source_basis: ['teacher_goal'],
      })),
    },
  }
}

function preparedAction() {
  return {
    id: 20,
    status: 'pending_confirmation',
    idempotency_key: 'idem-key-123',
    expected_artifact_version: 2,
    result_json: null,
  }
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
  api.getTeacherAgentRuns.mockResolvedValue({ data: [] })
  studentContext.refreshStudents.mockReset()
})

afterEach(() => {
  cleanup()
})

async function createCompletedPlan() {
  api.createTeacherAgentRun.mockResolvedValue({ data: completedRun() })
  render(<TeacherAgent />)
  await userEvent.type(screen.getByLabelText('教学目标'), '规划复习课')
  await userEvent.click(screen.getByRole('button', { name: /生成教学计划/ }))
  expect(await screen.findByText('Read-only teaching plan')).toBeInTheDocument()
}

describe('TeacherAgent', () => {
  it('shows confirmed-save safety mode initially and blocks empty submit', () => {
    render(<TeacherAgent />)

    expect(screen.getByText('模型只生成草稿，正式保存需要教师确认')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /生成教学计划/ })).toBeDisabled()
  })

  it('generates a completed plan and then shows practice draft controls', async () => {
    await createCompletedPlan()

    expect(screen.getByText('练习题草稿')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /生成练习题草稿/ })).toBeInTheDocument()
  })

  it('generates structured practice draft preview', async () => {
    await createCompletedPlan()
    api.createPracticeDraft.mockResolvedValue({ data: artifact(1) })

    await userEvent.type(screen.getByPlaceholderText('一次函数, 勾股定理'), '一次函数')
    await userEvent.click(screen.getByRole('button', { name: /生成练习题草稿/ }))

    expect(await screen.findByText('Practice Draft')).toBeInTheDocument()
    expect(screen.getByText('版本 1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Question 1')).toBeInTheDocument()
    expect(api.createPracticeDraft).toHaveBeenCalledWith(1, expect.objectContaining({ question_count: 5 }))
  })

  it('edits question and updates artifact version', async () => {
    await createCompletedPlan()
    api.createPracticeDraft.mockResolvedValue({ data: artifact(1) })
    api.updatePracticeArtifact.mockResolvedValue({ data: artifact(2) })

    await userEvent.click(screen.getByRole('button', { name: /生成练习题草稿/ }))
    const firstStem = await screen.findByDisplayValue('Question 1')
    await userEvent.clear(firstStem)
    await userEvent.type(firstStem, 'Updated Question 1')
    await userEvent.click(screen.getByRole('button', { name: /保存编辑/ }))

    await waitFor(() => expect(api.updatePracticeArtifact).toHaveBeenCalledWith(10, expect.objectContaining({ expected_version: 1 })))
    expect(await screen.findByText('版本 2')).toBeInTheDocument()
  })

  it('shows stale version conflict message', async () => {
    await createCompletedPlan()
    api.createPracticeDraft.mockResolvedValue({ data: artifact(1) })
    api.updatePracticeArtifact.mockRejectedValue({ response: { status: 409, data: { detail: 'stale' } } })

    await userEvent.click(screen.getByRole('button', { name: /生成练习题草稿/ }))
    await screen.findByText('版本 1')
    await userEvent.click(screen.getByRole('button', { name: /保存编辑/ }))

    expect(await screen.findByText('该草稿已被更新，请刷新后重试。')).toBeInTheDocument()
  })

  it('prepare-save opens explicit confirmation dialog and cancel does not confirm', async () => {
    await createCompletedPlan()
    api.createPracticeDraft.mockResolvedValue({ data: artifact(2) })
    api.preparePracticeSave.mockResolvedValue({
      data: {
        action: preparedAction(),
        confirmation_summary: {
          question_count: 5,
          target_question_bank: 'question_bank',
          knowledge_points: ['一次函数'],
          total_score: 50,
          artifact_version: 2,
          will_not: ['publish homework', 'create exam', 'charge payment'],
        },
      },
    })

    await userEvent.click(screen.getByRole('button', { name: /生成练习题草稿/ }))
    await screen.findByText('版本 2')
    await userEvent.click(screen.getByRole('button', { name: /^保存到题库$/ }))

    expect(await screen.findByRole('dialog')).toHaveTextContent('将创建 5 道正式题目')
    expect(screen.getByText(/不会：publish homework/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(api.confirmPracticeAction).not.toHaveBeenCalled()
  })

  it('confirms save once and shows completed question count', async () => {
    await createCompletedPlan()
    api.createPracticeDraft.mockResolvedValue({ data: artifact(2) })
    api.preparePracticeSave.mockResolvedValue({
      data: {
        action: preparedAction(),
        confirmation_summary: { question_count: 5, target_question_bank: 'question_bank', knowledge_points: ['一次函数'], total_score: 50, artifact_version: 2, will_not: [] },
      },
    })
    api.confirmPracticeAction.mockResolvedValue({
      data: { ...preparedAction(), status: 'completed', completed_at: new Date().toISOString(), result_json: { question_count: 5, question_ids: [1, 2, 3, 4, 5] } },
    })

    await userEvent.click(screen.getByRole('button', { name: /生成练习题草稿/ }))
    await screen.findByText('版本 2')
    await userEvent.click(screen.getByRole('button', { name: /^保存到题库$/ }))
    await screen.findByRole('dialog')
    await userEvent.click(screen.getByRole('button', { name: /确认保存到题库/ }))

    await waitFor(() => expect(api.confirmPracticeAction).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('已创建正式题目 5 道。')).toBeInTheDocument()
    expect(screen.queryByText(/api_key/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/SYSTEM PROMPT/i)).not.toBeInTheDocument()
  })

  it('cancels pending action from panel', async () => {
    await createCompletedPlan()
    api.createPracticeDraft.mockResolvedValue({ data: artifact(2) })
    api.preparePracticeSave.mockResolvedValue({
      data: {
        action: preparedAction(),
        confirmation_summary: { question_count: 5, target_question_bank: 'question_bank', knowledge_points: [], total_score: 50, artifact_version: 2, will_not: [] },
      },
    })
    api.cancelPracticeAction.mockResolvedValue({ data: { ...preparedAction(), status: 'cancelled' } })

    await userEvent.click(screen.getByRole('button', { name: /生成练习题草稿/ }))
    await screen.findByText('版本 2')
    await userEvent.click(screen.getByRole('button', { name: /^保存到题库$/ }))
    await screen.findByRole('dialog')
    await userEvent.click(screen.getByRole('button', { name: '取消' }))
    await userEvent.click(screen.getByRole('button', { name: /取消 Action/ }))

    expect(await screen.findByText('已取消')).toBeInTheDocument()
  })
})
