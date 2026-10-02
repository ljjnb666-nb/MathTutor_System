import SmartGenView from '../features/smart-gen/SmartGenView'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import QuestionCard from './QuestionCard'
import QuestionBank from '../pages/QuestionBank'
import PracticeQuestionEditor from './teacher-agent/PracticeQuestionEditor'
import fixture from '../../../test-fixtures/math-rendering-cases.json'

const api = vi.hoisted(() => ({ getBankList: vi.fn(), deleteFromBank: vi.fn(), collectQuestion: vi.fn(), createMistake: vi.fn(), getExams: vi.fn(), updateExam: vi.fn(), saveExam: vi.fn() }))
vi.mock('../services/api', () => api)
vi.mock('../contexts/StudentContext', () => ({ useStudent: () => ({ currentStudent: { id: 7 } }) }))
afterEach(cleanup)
beforeEach(() => { vi.clearAllMocks(); api.getBankList.mockResolvedValue({ data: [{ id: 1, ...fixture.question }] }) })

it('QuestionCard renders stem, options, answer and analysis through the same authority', async () => {
  const { container } = render(<MemoryRouter><QuestionCard data={fixture.question} index={1} /></MemoryRouter>)
  await userEvent.click(screen.getByRole('button', { name: '查看详细解析' }))
  expect(container.querySelectorAll('.katex')).toHaveLength(7)
  expect(container.querySelector('.katex-display')).not.toBeNull()
  expect(fixture.question.answer).toBe('$7$')
})

it('QuestionCard display-to-edit roundtrip retains exact raw source and whitespace', async () => {
  const question = { ...fixture.question, content: '  \\(√(x+1)\\)\n', answer: ' $7$ ', analysis: '\n$\\nu=2$\n' }
  render(<MemoryRouter><QuestionCard data={question} onUpdate={vi.fn()} /></MemoryRouter>)
  await userEvent.click(screen.getByRole('button', {name: '编辑'}))
  expect(screen.getByPlaceholderText('题目内容（支持 LaTeX，如 $x^2$）')).toHaveValue(question.content)
  expect(screen.getByPlaceholderText('答案（选择题可填 A/B/C/D，支持 LaTeX）')).toHaveValue(question.answer)
  expect(screen.getByPlaceholderText('解析内容（支持 LaTeX）')).toHaveValue(question.analysis)
  expect(screen.getByRole('region', {name: '编辑预览'}).querySelectorAll('.katex')).toHaveLength(5)
})

it('QuestionBank renders compact list entries and the real QuestionCard preview', async () => {
  const { container } = render(<MemoryRouter><QuestionBank /></MemoryRouter>)
  await waitFor(() => expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(6))
  expect(container.querySelector('.math-text')).not.toBeNull()
})

it('draft editor keeps raw values and updates its rendered preview', async () => {
  const question = { stem: fixture.question.content, options: fixture.question.options, answer: fixture.question.answer, explanation: fixture.question.analysis }
  const onChange = vi.fn()
  const { rerender } = render(<PracticeQuestionEditor question={question} onChange={onChange} />)
  const preview = screen.getByRole('region', { name: '题目预览' })
  expect(preview.querySelectorAll('.katex')).toHaveLength(7)
  expect(screen.getByLabelText('题干')).toHaveValue(question.stem)
  await userEvent.clear(screen.getByLabelText('答案'))
  expect(onChange).toHaveBeenLastCalledWith({ ...question, answer: '' })
  rerender(<PracticeQuestionEditor question={{ ...question, answer: '$9$' }} onChange={onChange} />)
  expect(screen.getByLabelText('答案')).toHaveValue('$9$')
  expect(preview.textContent).toContain('9')
})

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


it('SmartGen renders its real QuestionCard result with math', () => {
 const {container} = render(<MemoryRouter><SmartGenView {...baseProps} questions={[fixture.question]} /></MemoryRouter>)
 expect(container.querySelectorAll('.katex')).toHaveLength(4)
})

it('analysis layout preserves multiline display math, escaped currency and LaTeX nu', async () => {
 const analysis = '【步骤】1) 价格 \\$5，$\\nu=2$\n$$\\begin{aligned}x&=1\\\\\n2)&=2\\end{aligned}$$\n2) 完成。'
 const {container} = render(<MemoryRouter><QuestionCard data={{content: '题干', analysis}} /></MemoryRouter>)
 await userEvent.click(screen.getByRole('button', {name: '查看详细解析'}))
 expect(container.querySelectorAll('.katex')).toHaveLength(2)
 expect(container.querySelectorAll('.katex-display')).toHaveLength(1)
 expect(container.textContent).toContain('价格 $5')
})
