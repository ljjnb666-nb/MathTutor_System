import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from './LoginPage'

const mockLogin = vi.fn()
const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

let mockAuthState = {
  login: mockLogin,
  isAuthenticated: false,
  restoring: false,
}

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuthState,
}))

describe('LoginPage Redesign', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthState = {
      login: mockLogin,
      isAuthenticated: false,
      restoring: false,
    }
  })

  it('renders TutorPro branding, form inputs, and subject-neutral copy', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    // TutorPro branding
    expect(screen.getByRole('heading', { level: 1, name: 'TutorPro' })).toBeInTheDocument()
    expect(screen.getByText('AI Workspace')).toBeInTheDocument()
    expect(screen.getByText('全学科 AI 教学工作台')).toBeInTheDocument()

    // Form inputs
    expect(screen.getByLabelText('用户名')).toBeInTheDocument()
    expect(screen.getByLabelText('密码')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument()

    // No legacy MathTutor PRO STUDIO or math-only symbols
    expect(screen.queryByText('PRO STUDIO')).not.toBeInTheDocument()
    expect(screen.queryByText(/智能 AI 数学教学与全场景备课工作台/)).not.toBeInTheDocument()
  })

  it('validates empty inputs and displays error message', async () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    const submitBtn = screen.getByRole('button', { name: '登录' })
    fireEvent.click(submitBtn)

    expect(await screen.findByRole('alert')).toHaveTextContent('请输入用户名和密码')
    expect(mockLogin).not.toHaveBeenCalled()
  })

  it('handles successful login and redirects to home', async () => {
    mockLogin.mockResolvedValueOnce({ id: 1, username: 'teacher' })

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'teacher1' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'pass123' } })

    const submitBtn = screen.getByRole('button', { name: '登录' })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('teacher1', 'pass123')
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
    })
  })

  it('toggles password visibility', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    )

    const passwordInput = screen.getByLabelText('密码')
    expect(passwordInput).toHaveAttribute('type', 'password')

    const toggleBtn = screen.getByRole('button', { name: '显示密码' })
    fireEvent.click(toggleBtn)
    expect(passwordInput).toHaveAttribute('type', 'text')

    const hideBtn = screen.getByRole('button', { name: '隐藏密码' })
    fireEvent.click(hideBtn)
    expect(passwordInput).toHaveAttribute('type', 'password')
  })
})
