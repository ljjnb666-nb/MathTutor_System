import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import PPTGenerator from './PPTGenerator'

const navigate = vi.hoisted(() => vi.fn())
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
const api = vi.hoisted(() => ({
  generatePPT: vi.fn(),
  buildPPTFile: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: toast }))
vi.mock('../services/api', () => api)
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

function renderPpt() {
  return render(
    <MemoryRouter>
      <PPTGenerator />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.generatePPT.mockResolvedValue({
    title: '勾股定理',
    slides: [
      { layout: 'title', title: '勾股定理', subtitle: '直角三角形基础' },
      { layout: 'content', title: '核心公式', bullets: ['a² + b² = c²', '只适用于直角三角形'] },
    ],
  })
  api.buildPPTFile.mockResolvedValue({ blob: new Blob(['ppt']), filename: 'demo.pptx' })
  URL.createObjectURL = vi.fn(() => 'blob:demo')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  cleanup()
})

describe('PPTGenerator V2 workspace', () => {
  it('renders config, empty preview, and no fake template cards', () => {
    renderPpt()

    expect(screen.getByText('Magic PPT')).toBeInTheDocument()
    expect(screen.getByText('参数设置')).toBeInTheDocument()
    expect(screen.getByText('暂无生成结果')).toBeInTheDocument()
    expect(screen.getByText('暂无真实模板数据')).toBeInTheDocument()
    expect(screen.queryByText('商务模板')).not.toBeInTheDocument()
  })

  it('validates required topic before generate', async () => {
    renderPpt()

    expect(screen.getByRole('button', { name: /生成教学幻灯片/ })).toBeDisabled()
    expect(api.generatePPT).not.toHaveBeenCalled()
  })

  it('generates preview from the existing API and supports page navigation', async () => {
    renderPpt()

    await userEvent.type(screen.getByPlaceholderText(/勾股定理/), '勾股定理')
    await userEvent.click(screen.getByRole('button', { name: '高中' }))
    await userEvent.click(screen.getByRole('button', { name: /生成教学幻灯片/ }))

    await waitFor(() => expect(api.generatePPT).toHaveBeenCalledWith({ topic: '勾股定理', grade: 'High School' }))
    expect(await screen.findAllByText('勾股定理')).not.toHaveLength(0)
    await userEvent.click(screen.getByLabelText('下一页'))
    expect(screen.getAllByText('核心公式').length).toBeGreaterThan(0)
    expect(screen.getByText('a² + b² = c²')).toBeInTheDocument()
  })

  it('shows API error and keeps retry path available through the generate button', async () => {
    api.generatePPT.mockRejectedValueOnce(new Error('ppt failed')).mockResolvedValueOnce({ title: '函数', slides: [{ title: '函数概念', bullets: ['变量关系'] }] })
    renderPpt()

    await userEvent.type(screen.getByPlaceholderText(/勾股定理/), '函数')
    await userEvent.click(screen.getByRole('button', { name: /生成教学幻灯片/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('ppt failed')
    await userEvent.click(screen.getByRole('button', { name: /生成教学幻灯片/ }))
    await waitFor(() => expect(screen.getAllByText('函数概念').length).toBeGreaterThan(0))
  })
})
