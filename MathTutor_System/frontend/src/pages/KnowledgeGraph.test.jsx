import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import KnowledgeGraph from './KnowledgeGraph'

const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}))

const api = vi.hoisted(() => ({
  getStudentMastery: vi.fn(),
  generateWeakPointQuestions: vi.fn(),
}))

const navigateMock = vi.hoisted(() => vi.fn())
const smartGen = vi.hoisted(() => ({
  setQuestions: vi.fn(),
  setParams: vi.fn(),
  setSavedIndices: vi.fn(),
  setBatchSaved: vi.fn(),
  setLoading: vi.fn(),
}))

let currentStudent

vi.mock('react-hot-toast', () => ({ default: toast }))
vi.mock('../services/api', () => api)
vi.mock('../contexts/StudentContext', () => ({
  useStudent: () => ({ currentStudent }),
}))
vi.mock('../contexts/SmartGenContext', () => ({
  useSmartGen: () => smartGen,
}))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

function renderPage(initialEntry = '/knowledge-graph') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <KnowledgeGraph />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  currentStudent = { id: 7, name: '陈一诺' }
  api.getStudentMastery.mockResolvedValue({
    data: {
      weak_points: ['17.1 勾股定理', '未映射专题'],
      mastered_points: ['17.2 勾股定理的逆定理'],
    },
  })
  api.generateWeakPointQuestions.mockResolvedValue({ data: [{ content: '巩固题', knowledge_point: '勾股定理' }] })
})

afterEach(() => {
  cleanup()
})

describe('KnowledgeGraph', () => {
  it('renders mastery metrics and highlights textbook weak points', async () => {
    renderPage()

    expect(await screen.findByText('学情图谱')).toBeInTheDocument()
    expect(screen.getByText('陈一诺')).toBeInTheDocument()
    expect(screen.getByText('需加强')).toBeInTheDocument()
    expect(screen.getAllByText('未映射专题').length).toBeGreaterThan(0)
    expect(screen.getAllByText('17.1 勾股定理').length).toBeGreaterThan(0)
    expect(screen.getAllByText('掌握占比').length).toBeGreaterThan(0)
  })

  it('applies the knowledge_point query and shows teaching actions', async () => {
    renderPage('/knowledge-graph?knowledge_point=17.1%20%E5%8B%BE%E8%82%A1%E5%AE%9A%E7%90%86')

    expect(await screen.findByText('针对该知识点生成 5 道强化题')).toBeInTheDocument()
    expect(screen.getByText('查看该知识点错题')).toBeInTheDocument()

    await userEvent.click(screen.getByText('查看该知识点错题'))

    expect(navigateMock).toHaveBeenCalledWith('/mistake-book?knowledge_point=17.1%20%E5%8B%BE%E8%82%A1%E5%AE%9A%E7%90%86')
  })

  it('shows an error state and retries mastery loading', async () => {
    api.getStudentMastery.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce({ data: { weak_points: [], mastered_points: [] } })
    renderPage()

    expect(await screen.findByText('network down')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '重试' }))

    await waitFor(() => expect(api.getStudentMastery).toHaveBeenCalledTimes(2))
  })

  it('generates weak point questions into SmartGen context', async () => {
    renderPage()
    expect(await screen.findByText('按弱项一键出题')).toBeInTheDocument()

    await userEvent.click(screen.getByText('按弱项一键出题'))

    await waitFor(() => expect(api.generateWeakPointQuestions).toHaveBeenCalledWith({ student_id: 7, count: 5 }))
    expect(smartGen.setQuestions).toHaveBeenCalledWith([{ content: '巩固题', knowledge_point: '勾股定理' }])
    expect(smartGen.setSavedIndices).toHaveBeenCalledWith(expect.any(Set))
    expect(smartGen.setBatchSaved).toHaveBeenCalledWith(false)
    expect(navigateMock).toHaveBeenCalledWith('/smart-gen', expect.objectContaining({ state: expect.objectContaining({ fromWeakPoint: true }) }))
  })
})
