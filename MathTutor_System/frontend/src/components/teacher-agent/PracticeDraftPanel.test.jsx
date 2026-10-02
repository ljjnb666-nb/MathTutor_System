import mathFixture from '../../../../test-fixtures/math-rendering-cases.json'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import PracticeDraftPanel from './PracticeDraftPanel'

afterEach(cleanup)

const run = { id: 1, status: 'completed', goal: 'linear functions review' }

function makeArtifact(overrides = {}) {
  return {
    id: 11,
    user_id: 1,
    agent_run_id: 1,
    artifact_type: 'practice_set',
    status: 'ready_for_confirmation',
    version: 1,
    title: 'Linear functions practice',
    content_json: {
      title: 'Linear functions practice',
      summary: 'Draft summary',
      safety_mode: 'draft_only',
      questions: [
        {
          client_question_id: 'q-1',
          question_type: 'choice',
          stem: 'What is the slope of y = 2x + 1?',
          options: ['1', '2', '3', '4'],
          answer: '2',
          explanation: 'Slope is the coefficient of x.',
          knowledge_points: ['linear functions'],
          difficulty: 'medium',
          score: 10,
          source_basis: ['teacher_goal'],
        },
      ],
    },
    validation_json: { valid: true, errors: [], question_count: 1 },
    ...overrides,
  }
}

function renderPanel(overrides = {}) {
  const props = {
    run,
    artifact: makeArtifact(),
    action: null,
    loading: false,
    error: '',
    confirmation: null,
    onGenerate: vi.fn(),
    onUpdate: vi.fn().mockResolvedValue(makeArtifact({ version: 2 })),
    onPrepare: vi.fn().mockResolvedValue({
      action: { id: 7, status: 'pending_confirmation', idempotency_key: 'k'.repeat(24), expected_artifact_version: 1 },
      confirmation_summary: { question_count: 1, target_label: '保存到：当前教师私有题库', artifact_version: 1, will_not: [] },
    }),
    onConfirm: vi.fn().mockResolvedValue({ id: 7, status: 'completed' }),
    onCancelAction: vi.fn().mockResolvedValue({ id: 7, status: 'cancelled' }),
    ...overrides,
  }
  const view = render(<PracticeDraftPanel {...props} />)
  return { props, view }
}

describe('PracticeDraftPanel', () => {
  it('hides itself when the run is not completed', () => {
    renderPanel({ run: { ...run, status: 'running' } })
    expect(screen.queryByText('练习草稿')).not.toBeInTheDocument()
  })

  it('shows the draft title and validation status', () => {
    renderPanel()
    expect(screen.getByText('Linear functions practice')).toBeInTheDocument()
    expect(screen.getByText(/草稿校验：通过/)).toBeInTheDocument()
    expect(screen.getByDisplayValue('What is the slope of y = 2x + 1?')).toBeInTheDocument()
  })

  it('disables draft edits while a save action is executing', () => {
    renderPanel({ artifact: makeArtifact({ status: 'saving' }) })
    expect(screen.getByRole('button', { name: '保存编辑' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '保存到题库' })).toBeDisabled()
  })

  it('keeps student mistakes off and disabled without a selected student', () => {
    const { props } = renderPanel()
    const checkbox = screen.getByRole('checkbox', { name: '结合学生错题' })
    expect(checkbox).not.toBeChecked()
    expect(checkbox).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '生成练习草稿' }))

    expect(props.onGenerate).toHaveBeenCalledWith(expect.objectContaining({ use_student_context: false }))
    expect(props.onGenerate.mock.calls[0][0]).not.toHaveProperty('student_id')
  })

  it('binds enabled student mistakes to the selected run student and supports turning the option off', () => {
    const { props } = renderPanel({ run: { ...run, context_snapshot_json: { student_id: 42 } } })
    const checkbox = screen.getByRole('checkbox', { name: '结合学生错题' })

    expect(checkbox).toBeEnabled()
    expect(checkbox).not.toBeChecked()
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: '生成练习草稿' }))
    expect(props.onGenerate.mock.calls[0][0]).toMatchObject({ use_student_context: true, student_id: 42 })

    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: '生成练习草稿' }))
    expect(props.onGenerate.mock.calls[1][0]).toMatchObject({ use_student_context: false })
    expect(props.onGenerate.mock.calls[1][0]).not.toHaveProperty('student_id')
  })

  it('resets mistake context when the active run changes', () => {
    const { props, view } = renderPanel({ run: { ...run, student_id: 42 } })
    const checkbox = screen.getByRole('checkbox', { name: '结合学生错题' })
    fireEvent.click(checkbox)
    expect(checkbox).toBeChecked()

    view.rerender(<PracticeDraftPanel {...props} run={{ ...run, id: 2, student_id: 43 }} />)

    expect(screen.getByRole('checkbox', { name: '结合学生错题' })).not.toBeChecked()
  })

  it('surfaces generation errors from props', () => {
    renderPanel({ error: '生成练习草稿失败' })
    expect(screen.getByText('生成练习草稿失败')).toBeInTheDocument()
  })

  it('prepare opens the confirm dialog with the summary', async () => {
    const { props, view } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: '保存到题库' }))
    await waitFor(() => expect(props.onPrepare).toHaveBeenCalledTimes(1))
    view.rerender(
      <PracticeDraftPanel
        {...props}
        action={{ id: 7, status: 'pending_confirmation', idempotency_key: 'k'.repeat(24), expected_artifact_version: 1 }}
        confirmation={{ question_count: 1, target_label: '保存到：当前教师私有题库', artifact_version: 1, will_not: [] }}
      />,
    )
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(screen.getByText('将创建 1 道正式题目')).toBeInTheDocument()
    expect(screen.getByText('保存目标：保存到：当前教师私有题库')).toBeInTheDocument()
  })

  it('maps machine will_not phrases to Chinese and hides unknown ones', async () => {
    const { props, view } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: '保存到题库' }))
    await waitFor(() => expect(props.onPrepare).toHaveBeenCalledTimes(1))
    view.rerender(
      <PracticeDraftPanel
        {...props}
        action={{ id: 7, status: 'pending_confirmation', idempotency_key: 'k'.repeat(24), expected_artifact_version: 1 }}
        confirmation={{ question_count: 1, will_not: ['publish homework', 'some future phrase'] }}
      />,
    )
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(screen.getByText('不会发布作业')).toBeInTheDocument()
    expect(screen.queryByText(/some future phrase/)).not.toBeInTheDocument()
  })

  it('cancel in dialog keeps the panel without confirming', async () => {
    const { props, view } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: '保存到题库' }))
    await waitFor(() => expect(props.onPrepare).toHaveBeenCalledTimes(1))
    view.rerender(
      <PracticeDraftPanel
        {...props}
        action={{ id: 7, status: 'pending_confirmation', idempotency_key: 'k'.repeat(24), expected_artifact_version: 1 }}
        confirmation={{ question_count: 1, will_not: [] }}
      />,
    )
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(screen.getAllByRole('button', { name: '取消' })[0])
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(props.onConfirm).not.toHaveBeenCalled()
  })

  it('confirm calls onConfirm and closes the dialog', async () => {
    const { props, view } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: '保存到题库' }))
    await waitFor(() => expect(props.onPrepare).toHaveBeenCalledTimes(1))
    view.rerender(
      <PracticeDraftPanel
        {...props}
        action={{ id: 7, status: 'pending_confirmation', idempotency_key: 'k'.repeat(24), expected_artifact_version: 1 }}
        confirmation={{ question_count: 1, will_not: [] }}
      />,
    )
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '确认保存到题库' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(props.onConfirm).toHaveBeenCalledTimes(1)
  })

  it('cancel action button appears only for pending actions', () => {
    renderPanel()
    expect(screen.queryByRole('button', { name: '取消保存操作' })).not.toBeInTheDocument()
  })

  it('shows the failed action status with a safe Chinese error message', () => {
    renderPanel({
      action: { id: 7, status: 'failed', error_code: 'save_failed', error_message: 'Practice save failed' },
    })
    expect(screen.getByText('保存失败')).toBeInTheDocument()
    expect(screen.getByText('保存到题库失败，请稍后重试')).toBeInTheDocument()
    expect(screen.queryByText('Practice save failed')).not.toBeInTheDocument()
  })
})

it('renders a full mathematical draft preview with raw editing fields', () => {
 const artifact = makeArtifact()
 artifact.content_json.questions = [{...artifact.content_json.questions[0], stem: mathFixture.question.content, options: mathFixture.question.options, answer: mathFixture.question.answer, explanation: mathFixture.question.analysis}]
 renderPanel({artifact})
 expect(screen.getByRole('region', {name: '题目预览'}).querySelectorAll('.katex')).toHaveLength(7)
 expect(screen.getByDisplayValue(mathFixture.question.content)).toBeInTheDocument()
})
