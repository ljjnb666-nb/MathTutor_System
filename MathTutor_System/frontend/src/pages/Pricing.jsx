import { useEffect, useState } from 'react'
import { Check, CreditCard, Loader2, RefreshCw, Smartphone, WalletCards, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { createOrder, getPaymentConfig, getPlans } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { useSubscription } from '../contexts/SubscriptionContext'
import { EmptyState, ErrorState, LoadingState, MetricCard, PageHeader, PageShell, SectionCard, StatusBadge } from '../components/UiV2'

export default function Pricing() {
  const { user } = useAuth()
  const { subscription, refreshSubscription } = useSubscription()
  const isTeacher = user?.role !== 'admin'
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [alipayEnabled, setAlipayEnabled] = useState(false)
  const [wechatEnabled, setWechatEnabled] = useState(false)
  const [payModal, setPayModal] = useState(null)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState('')
  const [wechatQr, setWechatQr] = useState(null)
  const [selectedMonths, setSelectedMonths] = useState(12)

  const loadPricing = async () => {
    setLoading(true)
    setError('')
    try {
      const [planList, paymentConfig] = await Promise.all([
        getPlans(),
        getPaymentConfig().catch(() => ({})),
      ])
      setPlans(Array.isArray(planList) ? planList : [])
      setAlipayEnabled(!!paymentConfig?.alipay_enabled)
      setWechatEnabled(!!paymentConfig?.wechat_enabled)
    } catch (err) {
      setPlans([])
      setError(err?.response?.data?.detail || err?.message || '套餐加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPricing()
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('paid') === '1' || params.get('from') === 'alipay') {
      refreshSubscription?.()
      if (params.get('paid') === '1') window.history.replaceState({}, '', window.location.pathname)
    }
  }, [refreshSubscription])

  const currentPlanCode = subscription?.plan?.code
  const periodEnd = subscription?.period_end
  const periodEndDate = periodEnd ? (typeof periodEnd === 'string' ? new Date(periodEnd) : periodEnd) : null
  const daysLeft = periodEndDate ? Math.ceil((periodEndDate.getTime() - Date.now()) / 86400000) : null
  const paymentEnabled = alipayEnabled || wechatEnabled
  const formatDate = (date) => (date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : '未设置')

  const handlePay = async (plan, periodMonths, paymentMethod = 'alipay') => {
    setPaying(true)
    setPayError('')
    setWechatQr(null)
    try {
      const result = await createOrder({ plan_code: plan.code, payment_method: paymentMethod, period_months: periodMonths })
      if (result.pay_url) {
        window.open(result.pay_url, '_blank', 'noopener,noreferrer')
        setPayModal(null)
      } else if (result.code_url) {
        setWechatQr({ codeUrl: result.code_url, message: result.message || '请使用微信扫码支付' })
      } else {
        setPayError(result.message || '创建订单失败')
      }
    } catch (err) {
      setPayError(err.response?.data?.detail || err.message || '请求失败')
    } finally {
      setPaying(false)
    }
  }

  if (loading) {
    return <PageShell><LoadingState title="正在加载套餐" description="读取真实套餐与支付配置。" /></PageShell>
  }

  return (
    <PageShell className="space-y-5">
      <PageHeader
        title="套餐与定价"
        description="展示后端返回的套餐、当前订阅和真实可用支付方式。"
        icon={WalletCards}
        meta={<StatusBadge tone={paymentEnabled ? 'success' : 'warning'}>{paymentEnabled ? '在线支付已启用' : '在线支付未启用'}</StatusBadge>}
        actions={<button type="button" className="v2-btn-secondary" onClick={loadPricing}><RefreshCw className="h-4 w-4" />刷新</button>}
      />

      {error ? (
        <ErrorState title="套餐加载失败" description={error} onRetry={loadPricing} />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <MetricCard label="当前套餐" value={subscription?.plan?.name ?? '免费试用版'} hint={`账号角色：${user?.role || 'teacher'}`} icon={WalletCards} />
            <MetricCard label="学生席位" value={`${subscription?.student_count ?? 0} / ${subscription?.max_students ?? 0}`} hint="来自订阅状态" icon={Check} tone="success" />
            <MetricCard label="服务有效期" value={isTeacher ? formatDate(periodEndDate) : '管理员'} hint={daysLeft != null && daysLeft >= 0 ? `剩余 ${daysLeft} 天` : '按真实订阅返回'} icon={CreditCard} tone="warning" />
          </div>

          <section className="v2-pricing-layout">
            <main className="v2-pricing-plans">
              {plans.length === 0 ? (
                <EmptyState icon={WalletCards} title="暂无套餐" description="后端未返回套餐列表，页面不填充默认价格。" />
              ) : plans.map((plan) => {
                const isCurrent = plan.code === currentPlanCode
                const features = plan.features || {}
                const canBuy = plan.price_monthly > 0 && !isCurrent && paymentEnabled
                return (
                  <article key={plan.id ?? plan.code} className={`v2-pricing-card ${isCurrent ? 'current' : ''}`}>
                    <div className="v2-pricing-card-head">
                      <div>
                        <h2>{plan.name}</h2>
                        <p>最多 {plan.max_students} 名学生</p>
                      </div>
                      {isCurrent && <StatusBadge tone="success">当前使用中</StatusBadge>}
                    </div>
                    <div className="v2-pricing-price">
                      {plan.price_monthly > 0 ? <><strong>¥{plan.price_monthly}</strong><span>/ 月</span></> : <strong>免费体验</strong>}
                    </div>
                    <ul className="v2-pricing-features">
                      <li><Check className="h-4 w-4" />学生席位：{plan.max_students} 名</li>
                      <li className={features.rag ? '' : 'disabled'}>{features.rag ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}向量知识库</li>
                      <li className={features.magic_ppt ? '' : 'disabled'}>{features.magic_ppt ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}Magic PPT</li>
                    </ul>
                    {plan.price_monthly > 0 && !isCurrent && (
                      <div className="v2-pricing-action">
                        {canBuy ? (
                          <button type="button" className="v2-btn-primary" onClick={() => { setSelectedMonths(12); setPayModal(plan); setWechatQr(null); setPayError('') }}>
                            <CreditCard className="h-4 w-4" />升级
                          </button>
                        ) : (
                          <p>在线收银系统未启用，暂不显示购买入口。</p>
                        )}
                      </div>
                    )}
                  </article>
                )
              })}
            </main>

            <aside className="v2-pricing-side">
              <SectionCard title="支付状态" description="由真实支付配置控制。">
                <div className="v2-pricing-payments">
                  <div className={alipayEnabled ? 'enabled' : ''}><CreditCard className="h-4 w-4" /><span>支付宝</span><strong>{alipayEnabled ? '可用' : '未启用'}</strong></div>
                  <div className={wechatEnabled ? 'enabled' : ''}><Smartphone className="h-4 w-4" /><span>微信支付</span><strong>{wechatEnabled ? '可用' : '未启用'}</strong></div>
                </div>
              </SectionCard>
              <SectionCard title="说明" description="页面不伪造已付款或当前套餐。">
                <div className="v2-pricing-note">
                  <p>支付完成后通过现有订阅刷新逻辑更新状态。</p>
                  <p>如果支付未启用，升级按钮不会出现。</p>
                </div>
              </SectionCard>
            </aside>
          </section>
        </>
      )}

      {payModal && (
        <div className="v2-modal-backdrop" onClick={() => !paying && !wechatQr && setPayModal(null)}>
          <div className="v2-payment-modal" onClick={(event) => event.stopPropagation()}>
            {wechatQr ? (
              <>
                <h2>微信扫码支付</h2>
                <p>{wechatQr.message}</p>
                <div className="v2-payment-qr"><QRCodeSVG value={wechatQr.codeUrl} size={200} level="M" /></div>
                <button type="button" className="v2-btn-secondary" onClick={() => setWechatQr(null)}>关闭</button>
              </>
            ) : (
              <>
                <h2>购买 {payModal.name}</h2>
                <p>¥{payModal.price_monthly}/月</p>
                <div className="v2-payment-periods">
                  <button type="button" className={selectedMonths === 1 ? 'active' : ''} disabled={paying} onClick={() => setSelectedMonths(1)}>1 个月</button>
                  <button type="button" className={selectedMonths === 12 ? 'active' : ''} disabled={paying} onClick={() => setSelectedMonths(12)}>12 个月</button>
                </div>
                <div className="v2-payment-actions">
                  {alipayEnabled && <button type="button" disabled={paying} onClick={() => handlePay(payModal, selectedMonths, 'alipay')}><CreditCard className="h-4 w-4" />支付宝</button>}
                  {wechatEnabled && <button type="button" disabled={paying} onClick={() => handlePay(payModal, selectedMonths, 'wechat')}><Smartphone className="h-4 w-4" />微信扫码</button>}
                </div>
                {payError && <p className="v2-inline-error" role="alert">{payError}</p>}
                <button type="button" className="v2-btn-secondary" disabled={paying} onClick={() => setPayModal(null)}>取消</button>
              </>
            )}
          </div>
        </div>
      )}
    </PageShell>
  )
}
