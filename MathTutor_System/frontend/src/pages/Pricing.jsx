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
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  return (
    <div className="min-h-full bg-gray-50/50 px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-2 text-2xl font-bold text-gray-800">套餐与定价</h1>
        <p className="mb-8 text-gray-600">
          当前套餐：{subscription?.plan?.name ?? '—'} · 已用 {subscription?.student_count ?? 0} / {subscription?.max_students ?? 0} 名学生
          {isTeacher && periodEndDate && (
            <span className="ml-2">
              · 有效期至 {formatDate(periodEndDate)}
              {isExpiringSoon && (
                <span className="ml-1 text-amber-600 font-medium">（{daysLeft} 天后到期）</span>
              )}
            </span>
          )}
        </p>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = plan.code === currentPlanCode
            const features = plan.features || {}
            return (
              <div
                key={plan.id}
                className={`rounded-xl border-2 bg-white p-6 shadow-sm ${
                  isCurrent ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
                }`}
              >
                {isCurrent && (
                  <span className="mb-3 inline-block rounded-full bg-blue-100 px-3 py-0.5 text-xs font-medium text-blue-700">
                    当前套餐
                  </span>
                )}
                <h2 className="text-lg font-semibold text-gray-800">{plan.name}</h2>
                <div className="mt-2 flex items-baseline gap-1">
                  {plan.price_monthly != null && plan.price_monthly > 0 ? (
                    <>
                      <span className="text-2xl font-bold text-gray-900">¥{plan.price_monthly}</span>
                      <span className="text-gray-500">/月</span>
                    </>
                  ) : (
                    <span className="text-2xl font-bold text-gray-900">免费</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  最多 {plan.max_students} 名学生
                </p>
                <ul className="mt-4 space-y-2">
                  <li className="flex items-center gap-2 text-sm text-gray-700">
                    <Check className="h-4 w-4 shrink-0 text-green-500" />
                    学生数上限：{plan.max_students}
                  </li>
                  <li className="flex items-center gap-2 text-sm text-gray-700">
                    {features.rag ? (
                      <Check className="h-4 w-4 shrink-0 text-green-500" />
                    ) : (
                      <span className="h-4 w-4 shrink-0 text-gray-300">—</span>
                    )}
                    本地知识库（RAG）
                  </li>
                  <li className="flex items-center gap-2 text-sm text-gray-700">
                    {features.magic_ppt ? (
                      <Check className="h-4 w-4 shrink-0 text-green-500" />
                    ) : (
                      <span className="h-4 w-4 shrink-0 text-gray-300">—</span>
                    )}
                    Magic PPT
                  </li>
                </ul>
                {plan.price_monthly != null && plan.price_monthly > 0 && !isCurrent && (
                  <div className="mt-4">
                    {(alipayEnabled || wechatEnabled) ? (
                      <button
                        onClick={() => { setSelectedMonths(12); setPayModal(plan); setWechatQr(null); setPayError('') }}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 active:bg-blue-800"
                      >
                        <CreditCard className="h-4 w-4" />
                        立即购买
                      </button>
                    ) : (
                      <p className="text-xs text-gray-500">
                        支付接口即将上线，敬请期待。
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <p className="mt-8 text-center text-sm text-gray-500">
          {(alipayEnabled || wechatEnabled)
            ? '支付完成后刷新或返回此页，订阅将自动生效。'
            : '如需升级或开通，请联系管理员。支付（支付宝/微信）接入后可直接在此页购买。'}
        </p>

        {payModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => !paying && !wechatQr && setPayModal(null)}
          >
            <div
              className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              {wechatQr ? (
                <>
                  <h3 className="text-lg font-semibold text-gray-800">微信扫码支付</h3>
                  <p className="mt-1 text-sm text-gray-500">{wechatQr.message}</p>
                  <div className="mt-4 flex justify-center rounded-lg bg-white p-4">
                    <QRCodeSVG value={wechatQr.codeUrl} size={200} level="M" />
                  </div>
                  <button
                    onClick={() => { setWechatQr(null) }}
                    className="mt-4 w-full text-sm text-gray-500 hover:text-gray-700"
                  >
                    关闭
                  </button>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-semibold text-gray-800">购买 {payModal.name}</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    ¥{payModal.price_monthly}/月
                    {payModal.price_yearly != null && payModal.price_yearly > 0
                      ? ` · 年付 ¥${payModal.price_yearly}（省约 ${Math.round((1 - payModal.price_yearly / (payModal.price_monthly * 12)) * 100)}%）`
                      : ` · 年付 ¥${(payModal.price_monthly * 12).toFixed(0)}`}
                  </p>
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => setSelectedMonths(1)}
                      disabled={paying}
                      className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60 ${
                        selectedMonths === 1
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      1 个月
                    </button>
                    <button
                      onClick={() => setSelectedMonths(12)}
                      disabled={paying}
                      className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60 ${
                        selectedMonths === 12
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      12 个月（推荐）
                    </button>
                  </div>
                  <div className="mt-3 flex gap-2">
                    {alipayEnabled && (
                      <button
                        onClick={() => handlePay(payModal, selectedMonths, 'alipay')}
                        disabled={paying}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-600 bg-white px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-60"
                      >
                        <CreditCard className="h-4 w-4" />
                        支付宝
                      </button>
                    )}
                    {wechatEnabled && (
                      <button
                        onClick={() => handlePay(payModal, selectedMonths, 'wechat')}
                        disabled={paying}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-green-600 bg-white px-3 py-2 text-sm font-medium text-green-600 hover:bg-green-50 disabled:opacity-60"
                      >
                        <Smartphone className="h-4 w-4" />
                        微信扫码
                      </button>
                    )}
                  </div>
                  {payError && (
                    <p className="mt-3 text-sm text-red-600">{payError}</p>
                  )}
                  <button
                    onClick={() => !paying && setPayModal(null)}
                    className="mt-4 w-full text-sm text-gray-500 hover:text-gray-700"
                  >
                    取消
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
