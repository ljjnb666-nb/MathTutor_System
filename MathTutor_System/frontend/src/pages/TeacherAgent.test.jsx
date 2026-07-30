import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TeacherAgent from './TeacherAgent'

const studentContext = vi.hoisted(() => ({
  refreshStudents: vi.fn(),
}))

vi.mock('../contexts/StudentContext', () => ({
  useStudent: () => ({
    students: [{ id: 1, name: 'Student A' }],
    currentStudent: null,
    refreshStudents: studentContext.refreshStudents,
  }),
}))

const api = vi.hoisted(() => ({
  createTeacherAgentRun: vi.fn(),
  getTeacherAgentRun: vi.fn(),
  getTeacherAgentRunArtifacts: vi.fn(),
  getPracticeArtifactActions: vi.fn(),
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
    goal: 'Plan review',
    created_at: new Date().toISOString(),
    warnings_json: ['read only'],
    missing_fields_json: [],
    plan_json: {
      title: 'Read-only teaching plan',
      summary: 'Plan generated',
      intent_type: 'review_plan',
      safety_mode: 'read_only',
      evidence_summary: { weak_points: ['linear functions'], recent_mistake_count: 2 },
      steps: [{ step_id: '1', title: 'Diagnose', description: 'Read mistakes', basis: 'mistake summary' }],
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
      knowledge_points: ['linear functions'],
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
        knowledge_points: ['linear functions'],
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
  api.getTeacherAgentRunArtifacts.mockResolvedValue({ data: [] })
  api.getPracticeArtifactActions.mockResolvedValue({ data: [] })
  studentContext.refreshStudents.mockReset()
})

afterEach(() => {
  cleanup()
})

async function createCompletedPlan() {
  api.createTeacherAgentRun.mockResolvedValue({ data: completedRun() })
  render(<TeacherAgent />)
  await userEvent.type(screen.getByLabelText('Teaching goal'), 'Plan review')
  await userEvent.click(screen.getByRole('button', { name: /Generate teaching plan/ }))
  expect(await screen.findByText('Read-only teaching plan')).toBeInTheDocument()
}

describe('TeacherAgent', () => {
  it('shows confirmed-save safety mode initially and blocks empty submit', () => {
    render(<TeacherAgent />)

    expect(screen.getByText('The model only creates drafts. Formal question-bank saves require teacher confirmation.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Generate teaching plan/ })).toBeDisabled()
  })

  it('generates a completed plan and then shows practice draft controls', async () => {
    await createCompletedPlan()

    expect(screen.getByText('Practice draft')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Generate practice draft/ })).toBeInTheDocument()
  })

  it('generates structured practice draft preview', async () => {
    await createCompletedPlan()
    api.createPracticeDraft.mockResolvedValue({ data: artifact(1) })

    await userEvent.type(screen.getByPlaceholderText('Linear functions, quadratic equations'), 'linear functions')
    await userEvent.click(screen.getByRole('button', { name: /Generate practice draft/ }))

    expect(await screen.findByText('Practice Draft')).toBeInTheDocument()
    expect(screen.getByText('Version 1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Question 1')).toBeInTheDocument()
    expect(api.createPracticeDraft).toHaveBeenCalledWith(1, expect.objectContaining({ question_count: 5 }))
  })

  it('edits question and updates artifact version', async () => {
    await createCompletedPlan()
    api.createPracticeDraft.mockResolvedValue({ data: artifact(1) })
    api.updatePracticeArtifact.mockResolvedValue({ data: artifact(2) })

    await userEvent.click(screen.getByRole('button', { name: /Generate practice draft/ }))
    const firstStem = await screen.findByDisplayValue('Question 1')
    await userEvent.clear(firstStem)
    await userEvent.type(firstStem, 'Updated Question 1')
    await userEvent.click(screen.getByRole('button', { name: /Save edit/ }))

    await waitFor(() => expect(api.updatePracticeArtifact).toHaveBeenCalledWith(10, expect.objectContaining({ expected_version: 1 })))
    expect(await screen.findByText('Version 2')).toBeInTheDocument()
  })

  it('shows stale version conflict message', async () => {
    await createCompletedPlan()
    api.createPracticeDraft.mockResolvedValue({ data: artifact(1) })
    api.updatePracticeArtifact.mockRejectedValue({ response: { status: 409, data: { detail: 'stale' } } })

    await userEvent.click(screen.getByRole('button', { name: /Generate practice draft/ }))
    await screen.findByText('Version 1')
    await userEvent.click(screen.getByRole('button', { name: /Save edit/ }))

    expect(await screen.findByText('This draft was updated. Refresh and retry.')).toBeInTheDocument()
  })

  it('prepare-save opens explicit confirmation dialog and cancel does not confirm', async () => {
    await createCompletedPlan()
    api.createPracticeDraft.mockResolvedValue({ data: artifact(2) })
    api.preparePracticeSave.mockResolvedValue({
      data: {
        action: preparedAction(),
        confirmation_summary: {
          question_count: 5,
          target_label: 'current teacher private question bank',
          knowledge_points: ['linear functions'],
          total_score: 50,
          artifact_version: 2,
          will_not: ['publish homework', 'create exam', 'charge payment'],
        },
      },
    })

    await userEvent.click(screen.getByRole('button', { name: /Generate practice draft/ }))
    await screen.findByText('Version 2')
    await userEvent.click(screen.getByRole('button', { name: /^Save to question bank/ }))

    expect(await screen.findByRole('dialog')).toHaveTextContent('Will create 5 formal question-bank items.')
    expect(screen.getByText(/Will not: publish homework/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(api.confirmPracticeAction).not.toHaveBeenCalled()
  })

  it('confirms save once and shows completed question count', async () => {
    await createCompletedPlan()
    api.createPracticeDraft.mockResolvedValue({ data: artifact(2) })
    api.preparePracticeSave.mockResolvedValue({
      data: {
        action: preparedAction(),
        confirmation_summary: { question_count: 5, target_label: 'current teacher private question bank', knowledge_points: ['linear functions'], total_score: 50, artifact_version: 2, will_not: [] },
      },
    })
    api.confirmPracticeAction.mockResolvedValue({
      data: { ...preparedAction(), status: 'completed', completed_at: new Date().toISOString(), result_json: { question_count: 5, question_ids: [1, 2, 3, 4, 5] } },
    })

    await userEvent.click(screen.getByRole('button', { name: /Generate practice draft/ }))
    await screen.findByText('Version 2')
    await userEvent.click(screen.getByRole('button', { name: /^Save to question bank/ }))
    await screen.findByRole('dialog')
    await userEvent.click(screen.getByRole('button', { name: /Confirm save to question bank/ }))

    await waitFor(() => expect(api.confirmPracticeAction).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Created 5 formal question-bank items.')).toBeInTheDocument()
    expect(screen.queryByText(/api_key/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/SYSTEM PROMPT/i)).not.toBeInTheDocument()
  })

  it('cancels pending action from panel', async () => {
    await createCompletedPlan()
    api.createPracticeDraft.mockResolvedValue({ data: artifact(2) })
    api.preparePracticeSave.mockResolvedValue({
      data: {
        action: preparedAction(),
        confirmation_summary: { question_count: 5, target_label: 'current teacher private question bank', knowledge_points: [], total_score: 50, artifact_version: 2, will_not: [] },
      },
    })
    api.cancelPracticeAction.mockResolvedValue({ data: { ...preparedAction(), status: 'cancelled' } })

    await userEvent.click(screen.getByRole('button', { name: /Generate practice draft/ }))
    await screen.findByText('Version 2')
    await userEvent.click(screen.getByRole('button', { name: /^Save to question bank/ }))
    await screen.findByRole('dialog')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: /Cancel action/ }))

    expect(await screen.findByText('Cancelled')).toBeInTheDocument()
  })
})
