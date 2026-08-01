import { useEffect, useState } from 'react'
import { Check, Loader2, CreditCard, Smartphone } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { getPlans, getPaymentConfig, createOrder } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { useSubscription } from '../contexts/SubscriptionContext'

export default function Pricing() {
  const { user } = useAuth()
  const { subscription, refreshSubscription } = useSubscription()
  const isTeacher = user?.role !== 'admin'
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [alipayEnabled, setAlipayEnabled] = useState(false)
  const [wechatEnabled, setWechatEnabled] = useState(false)
  const [payModal, setPayModal] = useState(null)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState('')
  const [wechatQr, setWechatQr] = useState(null)
  const [selectedMonths, setSelectedMonths] = useState(12)

  useEffect(() => {
    let cancelled = false
    getPlans()
      .then((planList) => {
        if (!cancelled) setPlans(Array.isArray(planList) ? planList : [])
      })
      .catch(() => {
        if (!cancelled) setPlans([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    getPaymentConfig()
      .then((c) => {
        if (!cancelled) {
          setAlipayEnabled(!!c?.alipay_enabled)
          setWechatEnabled(!!c?.wechat_enabled)
        }
      })
      .catch(() => { if (!cancelled) setAlipayEnabled(false); setWechatEnabled(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('paid') === '1' || params.get('from') === 'alipay') {
      refreshSubscription?.()
      if (params.get('paid') === '1') {
        window.history.replaceState({}, '', window.location.pathname)
      }
    }
  }, [refreshSubscription])

  const handlePay = async (plan, periodMonths, paymentMethod = 'alipay') => {
    setPaying(true)
    setPayError('')
    setWechatQr(null)
    try {
      const res = await createOrder({
        plan_code: plan.code,
        payment_method: paymentMethod,
        period_months: periodMonths,
      })
      if (res.pay_url) {
        window.open(res.pay_url, '_blank', 'noopener,noreferrer')
        setPayModal(null)
      } else if (res.code_url) {
        setWechatQr({ codeUrl: res.code_url, message: res.message || '请使用微信扫码支付' })
      } else {
        setPayError(res.message || '创建订单失败')
      }
    } catch (e) {
      setPayError(e.response?.data?.detail || e.message || '请求失败')
    } finally {
      setPaying(false)
    }
  }

  const currentPlanCode = subscription?.plan?.code
  const periodEnd = subscription?.period_end
  const periodEndDate = periodEnd ? (typeof periodEnd === 'string' ? new Date(periodEnd) : periodEnd) : null
  const daysLeft = periodEndDate
    ? Math.ceil((periodEndDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null
  const isExpiringSoon = daysLeft != null && daysLeft >= 0 && daysLeft <= 7
  const formatDate = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '')

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--color-primary-600)' }} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 md:space-y-8 animate-fade-in-up">
      <header className="rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col gap-2" style={{ border: '1px solid color-mix(in srgb, var(--color-border-primary) 90%, transparent)', backgroundColor: 'var(--color-bg-card)' }}>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--color-text-primary)' }}>订阅套餐与专业服务权益</h1>
          <span className="rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase" style={{ backgroundColor: 'color-mix(in srgb, #f59e0b 10%, transparent)', border: '1px solid rgba(245, 158, 11, 0.2)', color: '#d97706' }}>SUBSCRIBE PRO</span>
        </div>
        <p className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          当前已生效套餐：<strong className="font-black" style={{ color: 'var(--color-primary-600)' }}>{subscription?.plan?.name ?? '免费试用版'}</strong> · 学生席位已占用 {subscription?.student_count ?? 0} / {subscription?.max_students ?? 0} 人
          {isTeacher && periodEndDate && (
            <span className="ml-2 font-bold" style={{ color: 'var(--color-text-primary)' }}>
              · 服务有效期至 {formatDate(periodEndDate)}
              {isExpiringSoon && (
                <span className="ml-1 font-extrabold" style={{ color: '#e11d48' }}>（仅剩 {daysLeft} 天到期）</span>
              )}
            </span>
          )}
        </p>
      </header>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = plan.code === currentPlanCode
          const features = plan.features || {}
          return (
            <div
              key={plan.id}
              className="pro-glass-card flex flex-col justify-between rounded-3xl p-6 transition-all"
              style={
                isCurrent
                  ? { border: '2px solid var(--color-primary-500)', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }
                  : {}
              }
            >
              <div>
                {isCurrent && (
                  <span className="mb-3 inline-block rounded-full px-3 py-1 text-[10px] font-black text-white uppercase tracking-wider shadow-sm" style={{ backgroundColor: 'var(--color-primary-600)' }}>
                    当前使用中
                  </span>
                )}
                <h2 className="text-base font-black" style={{ color: 'var(--color-text-primary)' }}>{plan.name}</h2>
                <div className="mt-3 flex items-baseline gap-1">
                  {plan.price_monthly != null && plan.price_monthly > 0 ? (
                    <>
                      <span className="text-3xl font-black" style={{ color: 'var(--color-text-primary)' }}>¥{plan.price_monthly}</span>
                      <span className="text-xs font-bold" style={{ color: 'var(--color-text-muted)' }}>/ 月</span>
                    </>
                  ) : (
                    <span className="text-3xl font-black" style={{ color: 'var(--color-text-primary)' }}>免费体验</span>
                  )}
                </div>
                <p className="mt-1 text-xs font-bold" style={{ color: 'var(--color-text-secondary)' }}>
                  支持最多 <span style={{ color: 'var(--color-primary-600)' }}>{plan.max_students}</span> 名在籍辅导学生
                </p>
                <ul className="mt-6 space-y-3 pt-4" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                  <li className="flex items-center gap-2 text-xs font-bold" style={{ color: 'var(--color-text-primary)' }}>
                    <Check className="h-4 w-4 shrink-0" style={{ color: '#059669' }} />
                    学生席位：{plan.max_students} 名
                  </li>
                  <li className="flex items-center gap-2 text-xs font-bold" style={{ color: 'var(--color-text-primary)' }}>
                    {features.rag ? (
                      <Check className="h-4 w-4 shrink-0" style={{ color: '#059669' }} />
                    ) : (
                      <span className="h-4 w-4 shrink-0" style={{ color: 'var(--color-border-primary)' }}>—</span>
                    )}
                    向量本地知识库 (RAG 检索)
                  </li>
                  <li className="flex items-center gap-2 text-xs font-bold" style={{ color: 'var(--color-text-primary)' }}>
                    {features.magic_ppt ? (
                      <Check className="h-4 w-4 shrink-0" style={{ color: '#059669' }} />
                    ) : (
                      <span className="h-4 w-4 shrink-0" style={{ color: 'var(--color-border-primary)' }}>—</span>
                    )}
                    Magic PPT 一键课件生成
                  </li>
                </ul>
              </div>

              {plan.price_monthly != null && plan.price_monthly > 0 && !isCurrent && (
                <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                  {(alipayEnabled || wechatEnabled) ? (
                    <button
                      onClick={() => { setSelectedMonths(12); setPayModal(plan); setWechatQr(null); setPayError('') }}
                      className="btn-gradient-pro flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-xs font-black"
                    >
                      <CreditCard className="h-4 w-4" />
                      升级解锁专业版
                    </button>
                  ) : (
                    <p className="text-[11px] font-bold text-center" style={{ color: 'var(--color-text-muted)' }}>
                      在线收银系统接入中
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-4 text-center text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
        {(alipayEnabled || wechatEnabled)
          ? '支付完成刷新页面后，专业版所有权益将自动秒级开通激活。'
          : '如需定制机构批量席位或企业级部署，请联系客服团队获得专人辅导开通。'}
      </p>

        {payModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
            onClick={() => !paying && !wechatQr && setPayModal(null)}
          >
            <div
              className="w-full max-w-sm rounded-xl p-6 shadow-xl"
              style={{ backgroundColor: 'var(--color-bg-card)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {wechatQr ? (
                <>
                  <h3 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>微信扫码支付</h3>
                  <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{wechatQr.message}</p>
                  <div className="mt-4 flex justify-center rounded-lg p-4" style={{ backgroundColor: 'white' }}>
                    <QRCodeSVG value={wechatQr.codeUrl} size={200} level="M" />
                  </div>
                  <button
                    onClick={() => { setWechatQr(null) }}
                    className="mt-4 w-full text-sm"
                    style={{ color: 'var(--color-text-secondary)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-primary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)' }}
                  >
                    关闭
                  </button>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>购买 {payModal.name}</h3>
                  <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    ¥{payModal.price_monthly}/月
                    {payModal.price_yearly != null && payModal.price_yearly > 0
                      ? ` · 年付 ¥${payModal.price_yearly}（省约 ${Math.round((1 - payModal.price_yearly / (payModal.price_monthly * 12)) * 100)}%）`
                      : ` · 年付 ¥${(payModal.price_monthly * 12).toFixed(0)}`}
                  </p>
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => setSelectedMonths(1)}
                      disabled={paying}
                      className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
                      style={
                        selectedMonths === 1
                          ? { border: '1px solid var(--color-primary-600)', backgroundColor: 'var(--color-primary-600)', color: 'white' }
                          : { border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)' }
                      }
                      onMouseEnter={(e) => {
                        if (selectedMonths !== 1) {
                          e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedMonths !== 1) {
                          e.currentTarget.style.backgroundColor = 'var(--color-bg-card)'
                        }
                      }}
                    >
                      1 个月
                    </button>
                    <button
                      onClick={() => setSelectedMonths(12)}
                      disabled={paying}
                      className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
                      style={
                        selectedMonths === 12
                          ? { border: '1px solid var(--color-primary-600)', backgroundColor: 'var(--color-primary-600)', color: 'white' }
                          : { border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)' }
                      }
                      onMouseEnter={(e) => {
                        if (selectedMonths !== 12) {
                          e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedMonths !== 12) {
                          e.currentTarget.style.backgroundColor = 'var(--color-bg-card)'
                        }
                      }}
                    >
                      12 个月（推荐）
                    </button>
                  </div>
                  <div className="mt-3 flex gap-2">
                    {alipayEnabled && (
                      <button
                        onClick={() => handlePay(payModal, selectedMonths, 'alipay')}
                        disabled={paying}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60"
                        style={{ border: '1px solid #1677ff', backgroundColor: 'var(--color-bg-card)', color: '#1677ff' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'color-mix(in srgb, #1677ff 10%, var(--color-bg-card))' }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-bg-card)' }}
                      >
                        <CreditCard className="h-4 w-4" />
                        支付宝
                      </button>
                    )}
                    {wechatEnabled && (
                      <button
                        onClick={() => handlePay(payModal, selectedMonths, 'wechat')}
                        disabled={paying}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60"
                        style={{ border: '1px solid #07c160', backgroundColor: 'var(--color-bg-card)', color: '#07c160' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'color-mix(in srgb, #07c160 10%, var(--color-bg-card))' }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-bg-card)' }}
                      >
                        <Smartphone className="h-4 w-4" />
                        微信扫码
                      </button>
                    )}
                  </div>
                  {payError && (
                    <p className="mt-3 text-sm" style={{ color: '#ef4444' }}>{payError}</p>
                  )}
                  <button
                    onClick={() => !paying && setPayModal(null)}
                    className="mt-4 w-full text-sm"
                    style={{ color: 'var(--color-text-secondary)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-primary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)' }}
                  >
                    取消
                  </button>
                </>
              )}
            </div>
          </div>
        )}
    </div>
  )
}
