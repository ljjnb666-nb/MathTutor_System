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
    expect(screen.getAllByText('a² + b² = c²').length).toBeGreaterThan(0)
  })

  it('shows API error and keeps retry path available through the generate button', async () => {
    api.generatePPT.mockRejectedValueOnce(new Error('ppt failed')).mockResolvedValueOnce({ title: '函数', slides: [{ title: '函数概念', bullets: ['变量关系'] }] })
    renderPpt()

    await userEvent.type(screen.getByPlaceholderText(/勾股定理/), '函数')
    await userEvent.click(screen.getByRole('button', { name: /生成教学幻灯片/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('生成失败')
    await userEvent.click(screen.getByRole('button', { name: /生成教学幻灯片/ }))
    await waitFor(() => expect(screen.getAllByText('函数概念').length).toBeGreaterThan(0))
  })
})

describe('Magic PPT canonical math preview', () => {
  const MATH_CONTENT = {
    title: '勾股定理 $a^2+b^2=c^2$',
    slides: [
      { layout: 'title', title: '勾股定理 $a^2+b^2=c^2$', subtitle: '学习专题：$c=5$ 的情形' },
      {
        layout: 'content',
        title: '核心公式 $a^2+b^2=c^2$',
        bullets: [
          '当 $x=2$ 时，$y=x^2+1$ 的值为 $5$。',
          '$$c=\\sqrt{a^2+b^2}$$',
          '$\\frac{1$',
          '理解直角三角形',
          '<script>alert(1)</script>',
          '$\\href{javascript:alert(1)}{x}$',
        ],
      },
    ],
  }

  async function generateMathPreview({ gotoContent = false } = {}) {
    api.generatePPT.mockResolvedValue(MATH_CONTENT)
    const utils = renderPpt()
    await userEvent.type(screen.getByPlaceholderText(/勾股定理/), '勾股定理')
    await userEvent.click(screen.getByRole('button', { name: /生成教学幻灯片/ }))
    await waitFor(() => expect(utils.container.querySelectorAll('.katex').length).toBeGreaterThan(0))
    if (gotoContent) await userEvent.click(screen.getByLabelText('下一页'))
    return utils
  }

  it('renders inline formula in the slide title through MathText', async () => {
    const { container } = await generateMathPreview()

    expect(container.querySelector('.v2-ppt-slide h2 .math-text-inline .katex')).not.toBeNull()
  })

  it('renders formula in the subtitle', async () => {
    const { container } = await generateMathPreview()

    expect(container.querySelector('.v2-ppt-slide p .math-text-inline .katex')).not.toBeNull()
  })

  it('renders formula in a bullet', async () => {
    const { container } = await generateMathPreview({ gotoContent: true })

    expect(container.querySelector('.v2-ppt-slide li .math-text-inline .katex')).not.toBeNull()
  })

  it('renders mixed Chinese + inline math and multiple inline formulas', async () => {
    const { container } = await generateMathPreview({ gotoContent: true })

    const mixed = [...container.querySelectorAll('.v2-ppt-slide li')].find((li) => li.textContent.includes('的值为'))
    expect(mixed).toBeTruthy()
    // 三个 inline 公式：$x=2$、$y=x^2+1$、$5$；中文文本保持原样。
    expect(mixed.querySelectorAll('.katex')).toHaveLength(3)
    expect(mixed.textContent).toContain('当')
    expect(mixed.textContent).toContain('的值为')
  })

  it('renders display formula as a display block', async () => {
    const { container } = await generateMathPreview({ gotoContent: true })

    expect(container.querySelector('li .math-text-display .katex-display')).not.toBeNull()
  })

  it('falls back to raw canonical source for malformed math', async () => {
    const { container } = await generateMathPreview({ gotoContent: true })

    const fallbacks = [...container.querySelectorAll('.math-text-inline')].filter((span) => span.textContent === '$\\frac{1$')
    expect(fallbacks).toHaveLength(1)
    expect(fallbacks[0].querySelector('.katex')).toBeNull()
  })

  it('keeps plain text plain without any KaTeX node', async () => {
    const { container } = await generateMathPreview({ gotoContent: true })

    const plain = [...container.querySelectorAll('.v2-ppt-slide li')].find((li) => li.textContent === '理解直角三角形')
    expect(plain).toBeTruthy()
    expect(plain.querySelector('.katex')).toBeNull()
  })

  it('preview contains real KaTeX DOM including MathML output', async () => {
    const { container } = await generateMathPreview()

    expect(container.querySelector('.katex')).not.toBeNull()
    expect(container.querySelector('.katex math')).not.toBeNull()
  })

  it('never creates script, link, or on-click content from generated text', async () => {
    const { container } = await generateMathPreview({ gotoContent: true })

    expect(container.querySelector('script, a[href], [onclick]')).toBeNull()
    // 不受支持的 \\href 在 trust:false 下回退为源文本，而非链接。
    expect(container.textContent).toContain('javascript:alert(1)')
  })

  it('renders presentation-level title via MathText in the preview card header (RB03)', async () => {
    const { container } = await generateMathPreview()

    const previewCard = [...container.querySelectorAll('.v2-section-card')]
      .find((card) => card.querySelector('h2')?.textContent === '幻灯片预览')
    expect(previewCard).toBeTruthy()
    const description = previewCard.querySelector('.v2-section-header p')
    expect(description.textContent).toContain('文件主题：')
    // canonical 标题必须渲染为真实 KaTeX，而不是 $a^2...$ raw delimiter。
    expect(description.querySelector('.katex')).not.toBeNull()
    expect(description.textContent).not.toContain('$a^2')
    expect(description.textContent).toContain('勾股定理')
  })

  it('renders content-slide subtitle in preview matching export semantics (RB02)', async () => {
    api.generatePPT.mockResolvedValue({
      title: '勾股定理',
      slides: [
        { layout: 'title', title: '勾股定理', subtitle: '直角三角形基础' },
        { layout: 'content', title: '核心公式', subtitle: '学习 $c=5$ 的情形', bullets: ['理解直角三角形'] },
      ],
    })
    const { container } = renderPpt()
    await userEvent.type(screen.getByPlaceholderText(/勾股定理/), '勾股定理')
    await userEvent.click(screen.getByRole('button', { name: /生成教学幻灯片/ }))
    await waitFor(() => expect(screen.getByLabelText('下一页')).toBeEnabled())
    await userEvent.click(screen.getByLabelText('下一页'))

    const slide = container.querySelector('.v2-ppt-slide')
    const subtitle = slide.querySelector('p')
    expect(subtitle).toBeTruthy()
    expect(subtitle.textContent).toContain('学习')
    expect(subtitle.textContent).toContain('的情形')
    expect(subtitle.querySelector('.katex')).not.toBeNull()
  })
})
