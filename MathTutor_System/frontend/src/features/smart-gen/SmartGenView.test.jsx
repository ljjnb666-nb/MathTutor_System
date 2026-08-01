import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SmartGenView from './SmartGenView'

vi.mock('../../components/FilterPanel', () => ({
  default: ({ onGenerate, loading }) => (
    <button type="button" disabled={loading} onClick={() => onGenerate?.({ knowledge_point: '函数', difficulty: 'L3', question_type: '综合', count: 3 })}>
      mock filter generate
    </button>
  ),
}))

vi.mock('../../components/QuestionCard', () => ({
  default: ({ data, index, onRegenerate }) => (
    <article>
      <h3>题目 {index}</h3>
      <p>{data.content}</p>
      <button type="button" onClick={onRegenerate}>重新生成单题</button>
    </article>
  ),
}))

vi.mock('../../components/QuestionSelectModal', () => ({
  default: ({ open }) => (open ? <div role="dialog">选择参考题</div> : null),
}))

vi.mock('../../components/KnowledgeCard', () => ({
  default: ({ data }) => <section>{data.title}</section>,
}))

vi.mock('../../components/ExampleList', () => ({
  default: ({ data }) => <section>例题 {data.length}</section>,
}))

const baseProps = {
  addingToToday: false,
  currentStudent: { id: 1, name: '张同学' },
  difficultyLabel: 'L3 综合',
  expandedIndices: new Set(),
  handleAddPoint: vi.fn(),
  handleAddToTodayHomework: vi.fn(),
  handleFilterChange: vi.fn(),
  handleGenerate: vi.fn(),
  handleGenerateClick: vi.fn(),
  handleGenerateExam: vi.fn(),
  handleRagFileChange: vi.fn(),
  handleRegenerate: vi.fn(),
  handleRemovePoint: vi.fn(),
  handleSaveAsExam: vi.fn(),
  handleSelectReference: vi.fn(),
  handleUpdateQuestion: vi.fn(),
  handleUseKnowledgeBaseChange: vi.fn(),
  isGeneratingExam: false,
  lastError: '',
  loading: false,
  params: { knowledge_point: '函数的概念与性质', difficulty: 'L3', question_type: '综合', count: 3 },
  questions: [],
  ragFileInputRef: { current: null },
  ragUploading: false,
  referenceQuestion: null,
  regeneratingIndex: null,
  savingExam: false,
  selectedPoints: [],
  setExpandedIndices: vi.fn(),
  setPendingRefConfig: vi.fn(),
  setReferenceQuestion: vi.fn(),
  setShowQuestionModal: vi.fn(),
  showQuestionModal: false,
  syncResult: null,
  useKnowledgeBase: false,
  verifyQuestion: vi.fn(),
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SmartGenView', () => {
  it('renders reference-aligned empty state and disables result actions without questions', () => {
    render(<SmartGenView {...baseProps} />)

    expect(screen.getByRole('heading', { name: '智能出题' })).toBeInTheDocument()
    expect(screen.getByText('出题条件设置')).toBeInTheDocument()
    expect(screen.getByText('AI生成题目预览')).toBeInTheDocument()
    expect(screen.getByText('推荐题型分布')).toBeInTheDocument()
    expect(screen.getByText('尚未生成题目')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /保存为试卷/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /加入今日作业/ })).toBeDisabled()
  })

  it('shows loading and retryable error states', async () => {
    const { rerender } = render(<SmartGenView {...baseProps} loading />)
    expect(screen.getByText(/正在生成 3 道题/)).toBeInTheDocument()

    rerender(<SmartGenView {...baseProps} lastError="后端服务不可用" />)
    await userEvent.click(screen.getByRole('button', { name: '重试生成' }))

    expect(screen.getByText('生成失败')).toBeInTheDocument()
    expect(baseProps.handleGenerate).toHaveBeenCalledTimes(1)
  })

  it('renders real generated questions and calls existing actions', async () => {
    const props = {
      ...baseProps,
      questions: [
        { content: '函数题 1', question_type: '选择', difficulty: 'L2', knowledge_point: '函数' },
        { content: '函数题 2', question_type: '填空', difficulty: 'L3', knowledge_point: '函数性质' },
      ],
    }
    render(<SmartGenView {...props} />)

    expect(screen.getByText('已生成 2 题')).toBeInTheDocument()
    expect(screen.getByText('选择')).toBeInTheDocument()
    expect(screen.getByText('填空')).toBeInTheDocument()
    expect(screen.getByText('函数性质')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /保存为试卷/ }))
    await userEvent.click(screen.getByRole('button', { name: /加入今日作业/ }))
    await userEvent.click(screen.getAllByRole('button', { name: '重新生成单题' })[0])

    expect(props.handleSaveAsExam).toHaveBeenCalledTimes(1)
    expect(props.handleAddToTodayHomework).toHaveBeenCalledTimes(1)
    expect(props.handleRegenerate).toHaveBeenCalledWith(0)
  })
})
