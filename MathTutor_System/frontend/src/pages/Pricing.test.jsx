import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Pricing from './Pricing'

const api = vi.hoisted(() => ({
  getPlans: vi.fn(),
  getPaymentConfig: vi.fn(),
  createOrder: vi.fn(),
}))
const refreshSubscription = vi.hoisted(() => vi.fn())

vi.mock('../services/api', () => api)
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'teacher' } }),
}))
vi.mock('../contexts/SubscriptionContext', () => ({
  useSubscription: () => ({
    subscription: { plan: { code: 'basic', name: '基础版' }, student_count: 2, max_students: 5, period_end: '2026-08-20T00:00:00Z' },
    refreshSubscription,
  }),
}))

const plans = [
  { id: 1, code: 'basic', name: '基础版', price_monthly: 0, max_students: 5, features: { rag: false, magic_ppt: false } },
  { id: 2, code: 'pro', name: '专业版', price_monthly: 99, max_students: 30, features: { rag: true, magic_ppt: true } },
]

beforeEach(() => {
  vi.clearAllMocks()
  api.getPlans.mockResolvedValue(plans)
  api.getPaymentConfig.mockResolvedValue({ alipay_enabled: false, wechat_enabled: false })
  api.createOrder.mockResolvedValue({ pay_url: 'https://pay.example.test' })
  window.open = vi.fn()
})

afterEach(() => cleanup())

describe('Pricing V2 page', () => {
  it('renders real plan cards and current subscription without fake purchase when payment disabled', async () => {
    render(<Pricing />)

    expect(await screen.findByText('套餐与定价')).toBeInTheDocument()
    expect(screen.getAllByText('基础版').length).toBeGreaterThan(0)
    expect(screen.getByText('专业版')).toBeInTheDocument()
    expect(screen.getByText('在线支付未启用')).toBeInTheDocument()
    expect(screen.getByText('在线收银系统未启用，暂不显示购买入口。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /升级/ })).not.toBeInTheDocument()
  })

  it('shows enabled payment entry and creates an order through existing API', async () => {
    api.getPaymentConfig.mockResolvedValue({ alipay_enabled: true, wechat_enabled: false })
    render(<Pricing />)

    await screen.findByText('在线支付已启用')
    await userEvent.click(screen.getByRole('button', { name: /升级/ }))
    await userEvent.click(screen.getByRole('button', { name: '支付宝' }))

    await waitFor(() => expect(api.createOrder).toHaveBeenCalledWith({ plan_code: 'pro', payment_method: 'alipay', period_months: 12 }))
    expect(window.open).toHaveBeenCalledWith('https://pay.example.test', '_blank', 'noopener,noreferrer')
  })

  it('renders empty state for an empty plan list', async () => {
    api.getPlans.mockResolvedValue([])
    render(<Pricing />)

    expect(await screen.findByText('暂无套餐')).toBeInTheDocument()
  })

  it('shows error and retries loading plans', async () => {
    api.getPlans.mockRejectedValueOnce(new Error('plan failed')).mockResolvedValueOnce(plans)
    render(<Pricing />)

    expect(await screen.findByText('套餐加载失败')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '重试' }))

    await waitFor(() => expect(api.getPlans).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('专业版')).toBeInTheDocument()
  })
})
