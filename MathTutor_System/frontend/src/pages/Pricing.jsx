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
    <div className="flex flex-col animate-fade-in-up space-y-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-black tracking-tight text-slate-900">订阅套餐与专业服务权益</h1>
          <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-[10px] font-black text-amber-600 uppercase">SUBSCRIBE PRO</span>
        </div>
        <p className="text-xs text-slate-500">
          当前已生效套餐：<strong className="text-indigo-600 font-black">{subscription?.plan?.name ?? '免费试用版'}</strong> · 学生席位已占用 {subscription?.student_count ?? 0} / {subscription?.max_students ?? 0} 人
          {isTeacher && periodEndDate && (
            <span className="ml-2 font-bold text-slate-700">
              · 服务有效期至 {formatDate(periodEndDate)}
              {isExpiringSoon && (
                <span className="ml-1 text-rose-600 font-extrabold">（仅剩 {daysLeft} 天到期）</span>
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
              className={`pro-glass-card flex flex-col justify-between rounded-3xl p-6 transition-all ${
                isCurrent ? 'ring-2 ring-indigo-500 shadow-xl border-indigo-500/50' : 'hover:border-slate-300'
              }`}
            >
              <div>
                {isCurrent && (
                  <span className="mb-3 inline-block rounded-full bg-indigo-600 px-3 py-1 text-[10px] font-black text-white uppercase tracking-wider shadow-sm">
                    当前使用中
                  </span>
                )}
                <h2 className="text-base font-black text-slate-900">{plan.name}</h2>
                <div className="mt-3 flex items-baseline gap-1">
                  {plan.price_monthly != null && plan.price_monthly > 0 ? (
                    <>
                      <span className="text-3xl font-black text-slate-900">¥{plan.price_monthly}</span>
                      <span className="text-xs font-bold text-slate-400">/ 月</span>
                    </>
                  ) : (
                    <span className="text-3xl font-black text-slate-900">免费体验</span>
                  )}
                </div>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  支持最多 <span className="text-indigo-600">{plan.max_students}</span> 名在籍辅导学生
                </p>
                <ul className="mt-6 space-y-3 border-t border-slate-100 pt-4">
                  <li className="flex items-center gap-2 text-xs font-bold text-slate-700">
                    <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                    学生席位：{plan.max_students} 名
                  </li>
                  <li className="flex items-center gap-2 text-xs font-bold text-slate-700">
                    {features.rag ? (
                      <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <span className="h-4 w-4 shrink-0 text-slate-300">—</span>
                    )}
                    向量本地知识库 (RAG 检索)
                  </li>
                  <li className="flex items-center gap-2 text-xs font-bold text-slate-700">
                    {features.magic_ppt ? (
                      <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <span className="h-4 w-4 shrink-0 text-slate-300">—</span>
                    )}
                    Magic PPT 一键课件生成
                  </li>
                </ul>
              </div>

              {plan.price_monthly != null && plan.price_monthly > 0 && !isCurrent && (
                <div className="mt-6 pt-4 border-t border-slate-100">
                  {(alipayEnabled || wechatEnabled) ? (
                    <button
                      onClick={() => { setSelectedMonths(12); setPayModal(plan); setWechatQr(null); setPayError('') }}
                      className="btn-gradient-pro flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-xs font-black"
                    >
                      <CreditCard className="h-4 w-4" />
                      升级解锁专业版
                    </button>
                  ) : (
                    <p className="text-[11px] font-bold text-slate-400 text-center">
                      在线收银系统接入中
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-4 text-center text-xs font-medium text-slate-400">
        {(alipayEnabled || wechatEnabled)
          ? '支付完成刷新页面后，专业版所有权益将自动秒级开通激活。'
          : '如需定制机构批量席位或企业级部署，请联系客服团队获得专人辅导开通。'}
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
  )
}
