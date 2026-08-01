import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Database, Users, FileText, Sparkles, BookOpen, UserPlus, BookMarked, AlertCircle, CreditCard, CalendarCheck } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { getDashboardStats, getMistakes, getStudentTrend } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { useStudent } from '../contexts/StudentContext'
import { useSubscription } from '../contexts/SubscriptionContext'

function formatDate(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(iso)
  }
}

function StatCardSkeleton() {
  return (
    <div className="h-28 animate-pulse rounded-xl" style={{ backgroundColor: 'var(--color-bg-card-hover)' }} />
  )
}

function ChartSkeleton() {
  return (
    <div className="h-64 w-full animate-pulse rounded-xl" style={{ backgroundColor: 'var(--color-bg-card-hover)' }} />
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg" style={{ backgroundColor: 'var(--color-bg-card-hover)' }} />
      ))}
    </div>
  )
}

const MOCK_STATS = {
  total_questions: 0,
  total_exams: 0,
  total_students: 0,
  today_review_count: 0,
  recent_exams: [],
  knowledge_distribution: [],
}

function SubscriptionCard({ subscription, isTeacher, onNavigate }) {
  if (!subscription?.plan) return null
  const periodEnd = subscription.period_end
  const periodEndDate = periodEnd ? (typeof periodEnd === 'string' ? new Date(periodEnd) : periodEnd) : null
  const daysLeft = periodEndDate
    ? Math.ceil((periodEndDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null
  const isExpiringSoon = daysLeft != null && daysLeft >= 0 && daysLeft <= 7
  const formatDate = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '')

  return (
    <button
      type="button"
      onClick={onNavigate}
      className="pro-glass-card group relative overflow-hidden rounded-2xl p-5 text-left active:scale-[0.99]"
    >
      <div className="flex items-center gap-3.5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 ring-1 ring-indigo-500/20 group-hover:scale-105 transition-transform">
          <CreditCard className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>当前订阅套餐</p>
          <p className="text-base font-extrabold truncate" style={{ color: 'var(--color-text-primary)' }}>
            {subscription.plan.name} · {subscription.student_count}/{subscription.max_students} 学生
          </p>
          {isTeacher && periodEndDate && (
            <p className={`mt-0.5 text-xs ${isExpiringSoon ? 'font-bold text-amber-600' : ''}`} style={!isExpiringSoon ? { color: 'var(--color-text-secondary)' } : {}}>
              到期 {formatDate(periodEndDate)}
              {isExpiringSoon && daysLeft >= 0 && ` · ${daysLeft} 天后到期`}
            </p>
          )}
          {isTeacher && !periodEndDate && subscription.plan.code !== 'free' && (
            <p className="mt-0.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>长期有效</p>
          )}
        </div>
      </div>
    </button>
  )
}

function PendingMistakeCard({ count, loading, hasStudent, onNavigate }) {
  const isClear = count === 0
  const isZeroOrNum = count !== null && count !== undefined
  const displayValue = isZeroOrNum ? String(count) : '—'
  const statusText = isZeroOrNum ? (isClear ? '知识掌握 100% 🎉' : '需重点突破') : (hasStudent ? '加载中…' : '请先选择学生')
  const bgIcon = isZeroOrNum && !isClear ? 'bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20' : 'bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20'
  const statusCls = isZeroOrNum && !isClear ? 'text-amber-600' : 'text-emerald-600'

  return (
    <button
      type="button"
      onClick={onNavigate}
      className="pro-glass-card group relative overflow-hidden rounded-2xl p-5 text-left active:scale-[0.99]"
    >
      <div className="flex items-center gap-3.5">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${bgIcon} group-hover:scale-105 transition-transform`}>
          {loading ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <AlertCircle className="h-6 w-6" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>待攻克错题</p>
          <p className="text-2xl font-black tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{displayValue}</p>
          <p className={`text-xs font-bold ${statusCls}`}>{statusText}</p>
        </div>
      </div>
    </button>
  )
}

function TodayReviewCard({ count, loading, onNavigate }) {
  const n = count != null && Number.isFinite(count) ? Number(count) : 0
  const hasDue = n > 0

  return (
    <button
      type="button"
      onClick={onNavigate}
      className="pro-glass-card group relative overflow-hidden rounded-2xl p-5 text-left active:scale-[0.99]"
    >
      <div className="flex items-center gap-3.5">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${hasDue ? 'bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20' : 'bg-slate-100 text-slate-500'} group-hover:scale-105 transition-transform`}>
          {loading ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <CalendarCheck className="h-6 w-6" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>今日待复习</p>
          <p className="text-2xl font-black tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{loading ? '—' : n}</p>
          <p className={`text-xs font-bold ${hasDue ? 'text-amber-600' : ''}`} style={!hasDue ? { color: 'var(--color-text-secondary)' } : {}}>
            {hasDue ? '点击立即复习' : '保持完美记录'}
          </p>
        </div>
      </div>
    </button>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { currentStudent } = useStudent()
  const { subscription, loading: subscriptionLoading } = useSubscription()
  const isTeacher = user?.role !== 'admin'
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(MOCK_STATS)
  const [error, setError] = useState(null)
  const [pendingMistakeCount, setPendingMistakeCount] = useState(null)
  const [loadingMistakes, setLoadingMistakes] = useState(false)
  const [trendWeeks, setTrendWeeks] = useState([])
  const [loadingTrend, setLoadingTrend] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getDashboardStats()
      .then((res) => setStats(res.data || MOCK_STATS))
      .catch((err) => setError(err.response?.data?.detail || err.message || '加载失败'))
      .finally(() => setLoading(false))
  }, [])

  const fetchPendingMistakes = useCallback(async () => {
    if (currentStudent?.id == null) {
      setPendingMistakeCount(null)
      return
    }
    setLoadingMistakes(true)
    try {
      const res = await getMistakes({ student_id: currentStudent.id, status: 'pending' })
      const list = Array.isArray(res.data) ? res.data : []
      setPendingMistakeCount(list.length)
    } catch {
      setPendingMistakeCount(null)
    } finally {
      setLoadingMistakes(false)
    }
  }, [currentStudent?.id])

  useEffect(() => {
    fetchPendingMistakes()
  }, [fetchPendingMistakes])

  useEffect(() => {
    if (currentStudent?.id == null) {
      setTrendWeeks([])
      return
    }
    setLoadingTrend(true)
    getStudentTrend(currentStudent.id, 8)
      .then((data) => setTrendWeeks(Array.isArray(data?.weeks) ? data.weeks : []))
      .catch(() => setTrendWeeks([]))
      .finally(() => setLoadingTrend(false))
  }, [currentStudent?.id])

  const today = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })

  const chartData = (stats.knowledge_distribution || []).map(({ tag, count }) => ({
    name: tag || '未分类',
    count,
  }))

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in-up">
      {/* 黑曜石旗舰 Hero 控制台 Banner */}
      <header className="relative overflow-hidden rounded-3xl bg-[#0B0F17] p-6 md:p-8 text-white border border-slate-800 shadow-2xl">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-72 w-72 rounded-full bg-indigo-600/20 blur-3xl" />
        <div className="absolute right-36 bottom-0 h-48 w-48 rounded-full bg-purple-600/15 blur-2xl" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-400 border border-emerald-500/30">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                SYSTEM ONLINE
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/15 px-3 py-1 text-xs font-bold text-indigo-300 border border-indigo-500/30">
                <Sparkles className="h-3.5 w-3.5" />
                AI Model: DeepSeek-V3
              </span>
              {currentStudent && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/15 px-3 py-1 text-xs font-bold text-purple-300 border border-purple-500/30">
                  <Users className="h-3.5 w-3.5" />
                  当前学生: {currentStudent.name}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-black tracking-tight md:text-3xl lg:text-4xl text-white">
              MathTutor <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-pink-400 bg-clip-text text-transparent">Command Center</span>
            </h1>
            <p className="mt-2 text-xs md:text-sm text-slate-400 max-w-xl">
              今天是 {today}。智能试卷生成引擎与考点向量数据库已全面就绪。
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-3">
            <Link
              to="/smart-gen"
              className="btn-gradient-pro inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-xs font-bold tracking-wide"
            >
              <Sparkles className="h-4 w-4" />
              一键智能 AI 出题
            </Link>
          </div>
        </div>
      </header>

      {/* KPI 指标 4 卡片阵列 */}
      <div className={`grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 ${isTeacher ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
        {isTeacher && (
          subscription?.plan ? (
            <SubscriptionCard
              subscription={subscription}
              isTeacher={isTeacher}
              onNavigate={() => navigate('/pricing')}
            />
          ) : subscriptionLoading ? (
            <StatCardSkeleton />
          ) : (
            <button
              type="button"
              onClick={() => navigate('/pricing')}
              className="pro-glass-card group relative overflow-hidden rounded-2xl p-5 text-left active:scale-[0.99]"
            >
              <div className="flex items-center gap-3.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 ring-1 ring-indigo-500/20 group-hover:scale-105 transition-transform">
                  <CreditCard className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>套餐与定价</p>
                  <p className="text-base font-extrabold" style={{ color: 'var(--color-text-primary)' }}>查看当前套餐与升级</p>
                </div>
              </div>
            </button>
          )
        )}
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <div className="pro-glass-card group relative overflow-hidden rounded-2xl p-5">
              <div className="flex items-center gap-3.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 ring-1 ring-indigo-500/20 group-hover:scale-105 transition-transform">
                  <Database className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>题库总量</p>
                  <p className="text-2xl font-black tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{stats.total_questions ?? 0}</p>
                </div>
              </div>
            </div>
            <div className="pro-glass-card group relative overflow-hidden rounded-2xl p-5">
              <div className="flex items-center gap-3.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20 group-hover:scale-105 transition-transform">
                  <Users className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>学生档案</p>
                  <p className="text-2xl font-black tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{stats.total_students ?? 0}</p>
                </div>
              </div>
            </div>
            <div className="pro-glass-card group relative overflow-hidden rounded-2xl p-5">
              <div className="flex items-center gap-3.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600 ring-1 ring-violet-500/20 group-hover:scale-105 transition-transform">
                  <FileText className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>试卷存档</p>
                  <p className="text-2xl font-black tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{stats.total_exams ?? 0}</p>
                </div>
              </div>
            </div>
            <PendingMistakeCard
              count={pendingMistakeCount}
              loading={loadingMistakes}
              hasStudent={!!currentStudent}
              onNavigate={() => navigate('/mistake-book')}
            />
            <TodayReviewCard
              count={stats.today_review_count}
              loading={loading}
              onNavigate={() => navigate('/mistake-book?review_due=1')}
            />
          </>
        )}
      </div>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-amber-800 backdrop-blur-md">
          <span className="text-xs font-bold">{error}</span>
          <button
            type="button"
            onClick={() => {
              setError(null)
              setLoading(true)
              getDashboardStats()
                .then((res) => setStats(res.data || MOCK_STATS))
                .catch((err) => setError(err.response?.data?.detail || err.message || '加载失败'))
                .finally(() => setLoading(false))
            }}
            className="shrink-0 rounded-xl bg-amber-200/80 px-4 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-300/80 transition-colors"
          >
            重试
          </button>
        </div>
      )}

      {/* 主面板布局 */}
      <div className="grid grid-cols-1 gap-6 md:gap-8 lg:grid-cols-3">
        {/* 左侧 2/3: 快捷矩阵 + 图表 */}
        <div className="space-y-6 lg:col-span-2">
          <section className="pro-glass-card rounded-3xl p-6">
            <h2 className="mb-4 text-sm font-black uppercase tracking-wider" style={{ color: 'var(--color-text-primary)' }}>快捷功能发射台</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <Link
                to="/smart-gen"
                className="btn-gradient-pro flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-xs font-extrabold"
              >
                <Sparkles className="h-4 w-4 shrink-0" />
                智能 AI 出题
              </Link>
              <Link
                to="/mistake-book"
                className="flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-xs font-bold transition-all active:scale-[0.98]"
                style={{
                  border: '1px solid var(--color-border-primary)',
                  backgroundColor: 'var(--color-bg-card-hover)',
                  color: 'var(--color-text-primary)'
                }}
              >
                <BookOpen className="h-4 w-4 shrink-0" style={{ color: 'var(--color-text-secondary)' }} />
                错题本精炼
              </Link>
              <Link
                to="/student-mgmt"
                className="flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-xs font-bold transition-all active:scale-[0.98]"
                style={{
                  border: '1px solid var(--color-border-primary)',
                  backgroundColor: 'var(--color-bg-card-hover)',
                  color: 'var(--color-text-primary)'
                }}
              >
                <UserPlus className="h-4 w-4 shrink-0" style={{ color: 'var(--color-text-secondary)' }} />
                录入学生档案
              </Link>
            </div>
          </section>

          {/* 学情趋势 */}
          <section className="pro-glass-card rounded-3xl p-6 w-full min-w-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: 'var(--color-text-primary)' }}>学情趋势分析（近 8 周）</h2>
              {currentStudent && (
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full">
                  学生: {currentStudent.name}
                </span>
              )}
            </div>
            {!currentStudent ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl text-xs" style={{ backgroundColor: 'var(--color-bg-card-hover)', color: 'var(--color-text-muted)' }}>
                <Users className="h-8 w-8 mb-2" style={{ color: 'var(--color-text-muted)' }} />
                请先在左侧黑曜石侧栏选择学生
              </div>
            ) : loadingTrend ? (
              <ChartSkeleton />
            ) : trendWeeks.length === 0 ? (
              <div className="flex min-h-[220px] items-center justify-center rounded-2xl text-xs" style={{ backgroundColor: 'var(--color-bg-card-hover)', color: 'var(--color-text-muted)' }}>
                暂无趋势数据
              </div>
            ) : (
              <div className="w-full min-w-0" style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height={260} minWidth={0}>
                  <BarChart data={trendWeeks} margin={{ top: 8, right: 8, left: -20, bottom: 8 }}>
                    <defs>
                      <linearGradient id="mistakeGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={1} />
                        <stop offset="100%" stopColor="#d97706" stopOpacity={0.8} />
                      </linearGradient>
                      <linearGradient id="masteredGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                        <stop offset="100%" stopColor="#059669" stopOpacity={0.8} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-secondary)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }} axisLine={{ stroke: 'var(--color-border-primary)' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }} allowDecimals={false} axisLine={false} />
                    <Tooltip
                      formatter={(value, name) => [value, name === 'new_mistakes' ? '新增错题' : '新掌握']}
                      labelFormatter={(label) => `第 ${label} 周`}
                      contentStyle={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)', borderRadius: '16px', border: '1px solid var(--color-border-primary)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}
                    />
                    <Bar dataKey="new_mistakes" fill="url(#mistakeGradient)" radius={[6, 6, 0, 0]} name="新增错题" />
                    <Bar dataKey="new_mastered" fill="url(#masteredGradient)" radius={[6, 6, 0, 0]} name="新掌握" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {/* Top 5 知识点分布 */}
          <section className="pro-glass-card rounded-3xl p-6 w-full min-w-0">
            <h2 className="mb-4 text-sm font-black uppercase tracking-wider" style={{ color: 'var(--color-text-primary)' }}>题库知识点热度 Top 5</h2>
            {loading ? (
              <ChartSkeleton />
            ) : chartData.length === 0 ? (
              <div className="flex min-h-[280px] items-center justify-center rounded-2xl text-xs" style={{ backgroundColor: 'var(--color-bg-card-hover)', color: 'var(--color-text-muted)' }}>
                暂无题目数据
              </div>
            ) : (
              <div className="w-full min-w-0" style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height={280} minWidth={0}>
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 8 }}>
                    <defs>
                      <linearGradient id="indigoBarGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={1} />
                        <stop offset="100%" stopColor="#4338ca" stopOpacity={0.8} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-secondary)" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                      axisLine={{ stroke: 'var(--color-border-primary)' }}
                      tickFormatter={(v) => (v.length > 6 ? v.slice(0, 6) + '…' : v)}
                    />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }} allowDecimals={false} axisLine={false} />
                    <Tooltip
                      formatter={(value) => [value, '题目数']}
                      labelFormatter={(label) => `知识点: ${label}`}
                      contentStyle={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)', borderRadius: '16px', border: '1px solid var(--color-border-primary)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}
                    />
                    <Bar dataKey="count" fill="url(#indigoBarGradient)" radius={[6, 6, 0, 0]} name="题目数" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        </div>

        {/* 右侧 1/3: 最近试卷 */}
        <div className="pro-glass-card rounded-3xl p-6 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: 'var(--color-text-primary)' }}>最近存档试卷</h2>
            <Link to="/exams" className="text-xs font-bold text-indigo-600 hover:text-indigo-700">
              全部试卷 →
            </Link>
          </div>
          {loading ? (
            <ListSkeleton />
          ) : !stats.recent_exams?.length ? (
            <div className="py-12 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>暂无试卷记录</div>
          ) : (
            <ul className="space-y-2.5 min-w-0">
              {stats.recent_exams.map((exam) => (
                <li key={exam.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/exams/${exam.id}`)}
                    className="group w-full rounded-2xl p-3.5 text-left transition-all active:scale-[0.99]"
                    style={{
                      border: '1px solid var(--color-border-secondary)',
                      backgroundColor: 'var(--color-bg-card-hover)'
                    }}
                  >
                    <p className="truncate text-xs font-extrabold group-hover:text-indigo-600 transition-colors" style={{ color: 'var(--color-text-primary)' }} title={exam.title}>
                      {exam.title || '未命名试卷'}
                    </p>
                    <p className="mt-1 truncate text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                      {formatDate(exam.created_at)}
                      {exam.student_name ? ` · ${exam.student_name}` : ''}
                    </p>
                    {exam.student_id != null && (
                      <div className="mt-2 flex items-center gap-1.5 text-[11px]">
                        {exam.graded_at ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 font-bold text-emerald-700">
                            已批改
                            {exam.grade_summary?.total != null &&
                              ` ${exam.grade_summary.correct}/${exam.grade_summary.total}`}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200/60 px-2.5 py-0.5 font-bold text-amber-700">
                            未批改
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
