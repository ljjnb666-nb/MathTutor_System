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
import { EmptyState, ErrorState, MetricCard, PageHero, PageShell, SectionCard, StatusBadge } from '../components/UiV2'

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

  const reloadDashboard = () => {
    setError(null)
    setLoading(true)
    getDashboardStats()
      .then((res) => setStats(res.data || MOCK_STATS))
      .catch((err) => setError(err.response?.data?.detail || err.message || '加载失败'))
      .finally(() => setLoading(false))
  }

  return (
    <PageShell>
      <PageHero
        title={`欢迎回来，${user?.username || '老师'}`}
        description={`今天是 ${today}。优先处理待办、关注学生状态，并从常用教学入口继续工作。`}
        stats={[
          { label: '当前学生', value: currentStudent?.name || '未选择', icon: <Users className="h-4 w-4 text-emerald-300" /> },
          { label: '今日待复习', value: loading ? '...' : stats.today_review_count ?? 0, icon: <CalendarCheck className="h-4 w-4 text-blue-300" /> },
          { label: '待攻克错题', value: loadingMistakes ? '...' : pendingMistakeCount ?? '待选择', icon: <AlertCircle className="h-4 w-4 text-amber-300" /> },
        ]}
        actions={
          <>
            <Link to="/smart-gen" className="v2-btn-primary">
              <Sparkles className="h-4 w-4" />
              智能出题
            </Link>
            <Link to="/chat" className="v2-btn-secondary">
              AI 对话
            </Link>
          </>
        }
      />

      <div className={`grid grid-cols-1 gap-4 md:grid-cols-2 ${isTeacher ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}>
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
            <MetricCard label="题库总量" value={stats.total_questions ?? 0} hint="真实题库记录" icon={Database} />
            <MetricCard label="学生档案" value={stats.total_students ?? 0} hint="已录入学生" icon={Users} tone="success" />
            <MetricCard label="试卷存档" value={stats.total_exams ?? 0} hint="我的试卷" icon={FileText} tone="info" />
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
        <ErrorState title="首页数据加载失败" description={error} onRetry={reloadDashboard} />
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_30rem]">
        <div className="space-y-4">
          <SectionCard title="快捷操作" description="只展示当前系统已有入口，避免无效动作">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Link
                to="/smart-gen"
                className="v2-btn-primary"
              >
                <Sparkles className="h-4 w-4 shrink-0" />
                智能出题
              </Link>
              <Link
                to="/mistake-book"
                className="v2-btn-secondary"
              >
                <BookOpen className="h-4 w-4 shrink-0" />
                错题本
              </Link>
              <Link
                to="/student-mgmt"
                className="v2-btn-secondary"
              >
                <UserPlus className="h-4 w-4 shrink-0" />
                录入学生档案
              </Link>
            </div>
          </SectionCard>

          <SectionCard
            title="学情概览"
            description="基于当前学生的近 8 周趋势"
            actions={currentStudent && <StatusBadge tone="primary">{currentStudent.name}</StatusBadge>}
          >
            {!currentStudent ? (
              <EmptyState icon={Users} title="未选择学生" description="请先在侧栏选择学生档案" />
            ) : loadingTrend ? (
              <ChartSkeleton />
            ) : trendWeeks.length === 0 ? (
              <EmptyState icon={Users} title="暂无趋势数据" description="学生完成更多练习后会显示趋势" />
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
          </SectionCard>

          <SectionCard title="题库知识点热度" description="来自当前题库知识点分布">
            {loading ? (
              <ChartSkeleton />
            ) : chartData.length === 0 ? (
              <EmptyState icon={Database} title="暂无题目数据" description="题库有数据后会显示知识点热度" />
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
          </SectionCard>
        </div>

        <aside className="space-y-4">
          <SectionCard title="今日待办" description="基于当前可用数据汇总">
            <div className="space-y-2">
              <button type="button" onClick={() => navigate('/mistake-book?review_due=1')} className="v2-mobile-row w-full text-left">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-slate-100">复习到期错题</span>
                  <StatusBadge tone={(stats.today_review_count ?? 0) > 0 ? 'warning' : 'success'}>
                    {stats.today_review_count ?? 0} 题
                  </StatusBadge>
                </div>
              </button>
              <button type="button" onClick={() => navigate('/mistake-book')} className="v2-mobile-row w-full text-left">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-slate-100">待攻克错题</span>
                  <StatusBadge tone={pendingMistakeCount ? 'warning' : 'neutral'}>
                    {pendingMistakeCount ?? '待选择'}
                  </StatusBadge>
                </div>
              </button>
            </div>
          </SectionCard>

          <SectionCard
            title="最近存档试卷"
            description="真实试卷记录"
            actions={
              <Link to="/exams" className="text-xs font-bold text-indigo-400 hover:text-indigo-300">
                全部试卷
              </Link>
            }
          >
            {loading ? (
              <ListSkeleton />
            ) : !stats.recent_exams?.length ? (
              <EmptyState icon={FileText} title="暂无试卷记录" description="保存试卷后会出现在这里" />
            ) : (
              <ul className="space-y-2.5 min-w-0">
                {stats.recent_exams.map((exam) => (
                  <li key={exam.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/exams/${exam.id}`)}
                      className="v2-mobile-row w-full text-left transition-all active:scale-[0.99]"
                    >
                      <p className="truncate text-sm font-extrabold" style={{ color: 'var(--color-text-primary)' }} title={exam.title}>
                        {exam.title || '未命名试卷'}
                      </p>
                      <p className="mt-1 truncate text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                        {formatDate(exam.created_at)}
                        {exam.student_name ? ` · ${exam.student_name}` : ''}
                      </p>
                      {exam.student_id != null && (
                        <div className="mt-2">
                          {exam.graded_at ? (
                            <StatusBadge tone="success">
                              已批改
                              {exam.grade_summary?.total != null &&
                                ` ${exam.grade_summary.correct}/${exam.grade_summary.total}`}
                            </StatusBadge>
                          ) : (
                            <StatusBadge tone="warning">未批改</StatusBadge>
                          )}
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </aside>
      </div>
    </PageShell>
  )
}
