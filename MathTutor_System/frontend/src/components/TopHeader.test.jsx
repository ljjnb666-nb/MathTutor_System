import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TopHeader from './TopHeader'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: '测试教师', role: 'teacher' },
    logout: vi.fn(),
  }),
}))

describe('TopHeader Truthfulness Regression', () => {
  afterEach(() => {
    cleanup()
  })

  it('TOPHEADER-TRUTH-01: does not render ungrounded notification bells, badges, or dropdowns', () => {
    render(
      <MemoryRouter>
        <TopHeader />
      </MemoryRouter>
    )

    // Ensure no ungrounded notification copy exists in TopHeader
    expect(screen.queryByText('消息通知')).not.toBeInTheDocument()
    expect(screen.queryByText('系统通知')).not.toBeInTheDocument()
    expect(screen.queryByText('已是最新')).not.toBeInTheDocument()
    expect(screen.queryByText('暂无新消息通知')).not.toBeInTheDocument()

    // Ensure no fake notification buttons exist
    expect(screen.queryByRole('button', { name: /通知/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /消息/ })).not.toBeInTheDocument()
  })
})
