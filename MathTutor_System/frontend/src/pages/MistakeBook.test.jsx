import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import MistakeBook from './MistakeBook'

const navigate = vi.hoisted(() => vi.fn())
const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}))
const smartGen = vi.hoisted(() => ({
  setQuestions: vi.fn(),
  setParams: vi.fn(),
  setSavedIndices: vi.fn(),
  setBatchSaved: vi.fn(),
  setLoading: vi.fn(),
}))
const api = vi.hoisted(() => ({
  getMistakes: vi.fn(),
  createMistake: vi.fn(),
  deleteMistake: vi.fn(),
  generateQuestions: vi.fn(),
  incrementMistakeReview: vi.fn(),
  markMistakeMaster: vi.fn(),
  getExams: vi.fn(),
  updateExam: vi.fn(),
  saveExam: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})
vi.mock('react-hot-toast', () => ({ default: toast }))
vi.mock('../services/api', () => api)
vi.mock('../contexts/StudentContext', () => ({
  useStudent: () => ({ currentStudent: { id: 7, name: '学生A' } }),
}))
vi.mock('../contexts/SmartGenContext', () => ({
  useSmartGen: () => smartGen,
}))

const pending = [
  { id: 1, topic: '一次函数', content: '函数错题', solution: '代入', review_count: 1, status: 'pending', source: '月考', options: ['1', '2'] },
]
const mastered = [
  { id: 2, topic: '几何', content: '几何错题', solution: '作辅助线', review_count: 3, status: 'mastered' },
]
const due = [
  { id: 3, topic: '整式', content: '今日复习题', solution: '展开', review_count: 0, status: 'pending' },
]

function renderPage(initialEntries = ['/mistake-book']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <MistakeBook />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getMistakes.mockImplementation((params) => {
    if (params?.status === 'mastered') return Promise.resolve({ data: mastered })
    if (params?.review_due) return Promise.resolve({ data: due })
    return Promise.resolve({ data: pending })
  })
  api.incrementMistakeReview.mockResolvedValue({})
  api.markMistakeMaster.mockResolvedValue({})
  api.deleteMistake.mockResolvedValue({})
  api.createMistake.mockResolvedValue({ data: { id: 9, topic: '函数', content: '新增题', solution: '新增解', status: 'pending' } })
  api.generateQuestions.mockResolvedValue({ data: { questions: [{ content: '巩固题' }] } })
  api.getExams.mockResolvedValue({ data: [] })
  api.saveExam.mockResolvedValue({})
  api.updateExam.mockResolvedValue({})
})

afterEach(() => {
  cleanup()
})

describe('MistakeBook', () => {
  it('loads pending mistakes and switches tabs', async () => {
    renderPage()

    expect(await screen.findByText('函数错题')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /今日复习/ }))
    expect(screen.getByText('今日复习题')).toBeInTheDocument()
  })

  it('reviews and masters a pending mistake', async () => {
    renderPage()
    await screen.findByText('函数错题')

    await userEvent.click(screen.getByRole('button', { name: /复习打卡/ }))
    await waitFor(() => expect(api.incrementMistakeReview).toHaveBeenCalledWith(1))

    await userEvent.click(screen.getByRole('button', { name: /标记掌握/ }))
    await waitFor(() => expect(api.markMistakeMaster).toHaveBeenCalledWith(1))
  })

  it('adds a manual mistake', async () => {
    renderPage()
    await screen.findByText('函数错题')

    await userEvent.click(screen.getByRole('button', { name: /添加错题/ }))
    await userEvent.type(screen.getByLabelText('题干'), '新增错题')
    await userEvent.click(screen.getByRole('button', { name: /保存错题/ }))

    await waitFor(() => expect(api.createMistake).toHaveBeenCalledWith(expect.objectContaining({ content: '新增错题' })))
  })

  it('generates review practice from pending mistakes', async () => {
    renderPage()
    await screen.findByText('函数错题')

    await userEvent.click(screen.getByRole('button', { name: /生成巩固练习/ }))

    await waitFor(() => expect(api.generateQuestions).toHaveBeenCalled())
    expect(smartGen.setQuestions).toHaveBeenCalledWith([{ content: '巩固题' }])
    expect(navigate).toHaveBeenCalledWith('/smart-gen', { state: { fromMistakeBook: true } })
  })
})
