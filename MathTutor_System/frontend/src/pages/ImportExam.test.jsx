import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ImportExam from './ImportExam'

const navigate = vi.hoisted(() => vi.fn())
const toast = vi.hoisted(() => Object.assign(vi.fn(), {
  error: vi.fn(),
  success: vi.fn(),
}))
const api = vi.hoisted(() => ({
  parseWordExam: vi.fn(),
  saveQuestionsBatch: vi.fn(),
  collectQuestion: vi.fn(),
  generateAnalysisForQuestions: vi.fn(),
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

function file(name, size = 1024) {
  const value = new File(['x'], name)
  Object.defineProperty(value, 'size', { value })
  return new File([new ArrayBuffer(size)], name)
}

function uploadInput() {
  return screen.getByLabelText('上传试卷文件')
}

beforeEach(() => {
  vi.clearAllMocks()
  api.collectQuestion.mockResolvedValue({ created: true })
  api.saveQuestionsBatch.mockResolvedValue({})
  api.generateAnalysisForQuestions.mockResolvedValue({ questions: [] })
})

afterEach(() => {
  cleanup()
})

describe('ImportExam', () => {
  it('renders the v2 import workspace initial state', () => {
    render(<ImportExam />)

    expect(screen.getAllByText('导入试卷')[0]).toBeInTheDocument()
    expect(screen.getByText('上传文件')).toBeInTheDocument()
    expect(screen.getByText('暂无解析结果')).toBeInTheDocument()
    expect(screen.getByText('图片')).toBeInTheDocument()
    expect(screen.getByText('待后端 OCR 支持')).toBeInTheDocument()
  })

  it('rejects unsupported file formats without calling parse api', async () => {
    render(<ImportExam />)

    await userEvent.upload(uploadInput(), file('exam.png'), { applyAccept: false })

    expect(await screen.findByText('当前仅支持 PDF 或 Word (.docx) 试卷文件')).toBeInTheDocument()
    expect(api.parseWordExam).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('当前仅支持 PDF 或 Word (.docx) 试卷文件')
  })

  it('rejects oversized files before parsing', async () => {
    render(<ImportExam />)

    await userEvent.upload(uploadInput(), file('exam.pdf', 31 * 1024 * 1024))

    expect(await screen.findByText(/文件过大/)).toBeInTheDocument()
    expect(api.parseWordExam).not.toHaveBeenCalled()
  })

  it('shows parsing loading state', async () => {
    let resolveParse
    api.parseWordExam.mockImplementation(() => new Promise((resolve) => { resolveParse = resolve }))
    render(<ImportExam />)

    await userEvent.upload(uploadInput(), file('exam.docx'))
    await userEvent.click(screen.getAllByRole('button', { name: /开始解析/ })[0])

    expect(await screen.findByText('正在解析试卷')).toBeInTheDocument()
    resolveParse({ questions: [] })
    await waitFor(() => expect(api.parseWordExam).toHaveBeenCalledTimes(1))
  })

  it('renders parse success result cards', async () => {
    api.parseWordExam.mockResolvedValue({
      questions: [
        { content: '函数题', type: 'choice', options: ['A. 1', 'B. 2'], answer: 'A', analysis: '代入计算', knowledge_point: '一次函数', difficulty: 'L2' },
      ],
    })
    render(<ImportExam />)

    await userEvent.upload(uploadInput(), file('exam.pdf'))
    await userEvent.click(screen.getAllByRole('button', { name: /开始解析/ })[0])

    expect(await screen.findByText('函数题')).toBeInTheDocument()
    expect(screen.getByText('一次函数')).toBeInTheDocument()
    expect(screen.getByText('已解析')).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('已解析 1 道题目')
  })

  it('shows api error and retries parsing', async () => {
    api.parseWordExam
      .mockRejectedValueOnce(new Error('OCR timeout'))
      .mockResolvedValueOnce({ questions: [{ content: '重试成功', type: 'fill' }] })
    render(<ImportExam />)

    await userEvent.upload(uploadInput(), file('exam.docx'))
    await userEvent.click(screen.getAllByRole('button', { name: /开始解析/ })[0])
    expect(await screen.findByText('OCR timeout')).toBeInTheDocument()

    await userEvent.click(screen.getAllByRole('button', { name: /重试解析/ })[0])
    expect(await screen.findByText('重试成功')).toBeInTheDocument()
    expect(api.parseWordExam).toHaveBeenCalledTimes(2)
  })

  it('V3-03 regression: renders 5 StepCards inside responsive grid container with mobile, sm, and xl classes', () => {
    const { container } = render(<ImportExam />)

    const stepCards = container.querySelectorAll('.v2-import-step')
    expect(stepCards).toHaveLength(5)

    expect(screen.getByText('上传文件')).toBeInTheDocument()
    expect(screen.getByText('OCR识别')).toBeInTheDocument()
    expect(screen.getByText('结构解析')).toBeInTheDocument()
    expect(screen.getByText('知识点标注')).toBeInTheDocument()
    expect(screen.getByText('入库完成')).toBeInTheDocument()

    const gridContainer = stepCards[0].parentElement
    expect(gridContainer).toHaveClass('grid', 'grid-cols-2', 'sm:grid-cols-3', 'xl:grid-cols-5')
  })
})

