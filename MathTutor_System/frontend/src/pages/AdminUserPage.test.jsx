import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminUserPage from './AdminUserPage'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
const api = vi.hoisted(() => ({
  listUsers: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  setUserSubscription: vi.fn(),
  batchSetSubscription: vi.fn(),
  getUserSubscriptionHistory: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: toast }))
vi.mock('../services/api', () => api)
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: 'admin' } }),
}))

const users = [
  { id: 1, username: 'admin', role: 'admin', is_active: true },
  { id: 2, username: 'teacher_a', role: 'teacher', is_active: true, plan_code: 'basic', period_end: '2026-08-20T00:00:00Z' },
]

beforeEach(() => {
  vi.clearAllMocks()
  window.confirm = vi.fn(() => true)
  api.listUsers.mockResolvedValue(users)
  api.createUser.mockResolvedValue({})
  api.deleteUser.mockResolvedValue({})
  api.setUserSubscription.mockResolvedValue({})
  api.batchSetSubscription.mockResolvedValue({ updated: 1, failed: [] })
  api.getUserSubscriptionHistory.mockResolvedValue([{ id: 1, plan_name: '基础版', period_start: '2026-08-01T00:00:00Z', period_end: '2026-08-20T00:00:00Z', created_at: '2026-08-01T01:00:00Z' }])
})

afterEach(() => cleanup())

describe('AdminUserPage V2 console', () => {
  it('renders users, filters by search, and avoids unsupported actions', async () => {
    render(<AdminUserPage />)

    expect(await screen.findByText('用户管理')).toBeInTheDocument()
    expect(screen.getAllByText('teacher_a').length).toBeGreaterThan(0)
    await userEvent.type(screen.getByPlaceholderText('用户名或 ID'), 'teacher')
    expect(screen.queryAllByText('admin')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /重置密码/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /封禁/ })).not.toBeInTheDocument()
  })

  it('validates add user form and calls create API', async () => {
    render(<AdminUserPage />)

    await screen.findByText('用户管理')
    await userEvent.click(screen.getByRole('button', { name: /添加用户/ }))
    await userEvent.click(screen.getByRole('button', { name: '确定' }))
    expect(screen.getByRole('alert')).toHaveTextContent('请输入用户名')

    await userEvent.type(screen.getByPlaceholderText('请输入用户名'), 'new_teacher')
    await userEvent.type(screen.getByPlaceholderText('至少 6 位'), '123456')
    await userEvent.click(screen.getByRole('button', { name: '确定' }))

    await waitFor(() => expect(api.createUser).toHaveBeenCalledWith({ username: 'new_teacher', password: '123456', role: 'teacher' }))
  })

  it('confirms dangerous delete and blocks deleting current account', async () => {
    render(<AdminUserPage />)

    await waitFor(() => expect(screen.getAllByText('teacher_a').length).toBeGreaterThan(0))
    await userEvent.click(screen.getAllByLabelText('删除 teacher_a')[0])
    expect(window.confirm).toHaveBeenCalled()
    await waitFor(() => expect(api.deleteUser).toHaveBeenCalledWith(2))

    expect(screen.getAllByLabelText('删除 admin')[0]).toBeDisabled()
    expect(api.deleteUser).not.toHaveBeenCalledWith(1)
  })

  it('shows empty and error states', async () => {
    api.listUsers.mockResolvedValueOnce([])
    const { unmount } = render(<AdminUserPage />)
    expect(await screen.findByText('暂无用户')).toBeInTheDocument()
    unmount()

    api.listUsers.mockRejectedValueOnce(new Error('user failed'))
    render(<AdminUserPage />)
    expect(await screen.findByText('用户加载失败')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(api.listUsers).toHaveBeenCalledTimes(3))
  })
})
