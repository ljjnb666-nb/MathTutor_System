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
    <div className="h-28 animate-pulse rounded-xl bg-gray-200/60" />
  )
}

function ChartSkeleton() {
  return (
    <div className="h-64 w-full animate-pulse rounded-xl bg-gray-200/60" />
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-200/60" />
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

/**
 * 当前套餐与到期卡：教师显示套餐名、学生数、到期日及即将到期提示，可点进定价页。
 */
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
      className="w-full rounded-mobile-lg md:rounded-xl border border-gray-100 md:border-gray-200 bg-white p-4 sm:p-5 text-left shadow-mobile-card md:shadow-sm transition-shadow hover:shadow-md active:shadow-sm"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
          <CreditCard className="h-5 w-5 sm:h-6 sm:w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm font-medium text-gray-500">当前套餐</p>
          <p className="text-base sm:text-lg font-bold text-gray-900">
            {subscription.plan.name} · {subscription.student_count}/{subscription.max_students} 学生
          </p>
          {isTeacher && periodEndDate && (
            <p className={`mt-0.5 text-sm ${isExpiringSoon ? 'font-medium text-amber-600' : 'text-gray-500'}`}>
              有效期至 {formatDate(periodEndDate)}
              {isExpiringSoon && daysLeft >= 0 && ` · ${daysLeft} 天后到期`}
            </p>
          )}
          {isTeacher && !periodEndDate && subscription.plan.code !== 'free' && (
            <p className="mt-0.5 text-sm text-gray-500">长期有效</p>
          )}
        </div>
      </div>
    </button>
  )
}

/**
 * 待攻克错题汇总卡：展示当前学生 pending 错题数，点击跳转错题本。
 * - count === 0: 绿色 "All Clear! 🎉"
 * - count > 0: 红/橙 "Needs Review"
 */
function PendingMistakeCard({ count, loading, hasStudent, onNavigate }) {
  const isClear = count === 0
  const isZeroOrNum = count !== null && count !== undefined
  const displayValue = isZeroOrNum ? String(count) : '—'
  const statusText = isZeroOrNum ? (isClear ? 'All Clear! 🎉' : 'Needs Review') : (hasStudent ? '加载中…' : '请先选择学生')
  const bgIcon = isZeroOrNum && !isClear ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'
  const statusCls = isZeroOrNum && !isClear ? 'text-orange-700' : 'text-green-700'

  return (
    <button
      type="button"
      onClick={onNavigate}
      className="w-full rounded-mobile-lg md:rounded-xl border border-gray-100 md:border-gray-200 bg-white p-4 sm:p-5 text-left shadow-mobile-card md:shadow-sm transition-shadow hover:shadow-md active:shadow-sm"
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl ${bgIcon}`}>
          {loading ? (
            <span className="h-5 w-5 sm:h-6 sm:w-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm font-medium text-gray-500">待攻克错题</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 tabular-nums">{displayValue}</p>
          <p className={`text-xs sm:text-sm font-medium ${statusCls}`}>{statusText}</p>
        </div>
      </div>
    </button>
  )
}

/**
 * 今日待复习卡：展示今日应复习的错题数，点击跳转错题本「今日待复习」筛选。
 */
function TodayReviewCard({ count, loading, onNavigate }) {
  const n = count != null && Number.isFinite(count) ? Number(count) : 0
  const hasDue = n > 0

  return (
    <button
      type="button"
      onClick={onNavigate}
      className="w-full rounded-mobile-lg md:rounded-xl border border-gray-100 md:border-gray-200 bg-white p-4 sm:p-5 text-left shadow-mobile-card md:shadow-sm transition-shadow hover:shadow-md active:shadow-sm"
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl ${hasDue ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-600'}`}>
          {loading ? (
            <span className="h-5 w-5 sm:h-6 sm:w-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <CalendarCheck className="h-5 w-5 sm:h-6 sm:w-6" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm font-medium text-gray-500">今日待复习</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 tabular-nums">{loading ? '—' : n}</p>
          <p className={`text-xs sm:text-sm font-medium ${hasDue ? 'text-amber-700' : 'text-slate-600'}`}>
            {hasDue ? '去复习' : '暂无'}
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
    <div className="space-y-6 md:space-y-8">
      {/* Welcome：移动端更紧凑、带渐变标题 */}
      <header className="md:pt-0">
        <h1 className="text-xl font-bold text-gray-900 md:text-3xl bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
          欢迎回来，MathTutor
        </h1>
        <p className="mt-1 text-sm md:text-base text-gray-500">今天是 {today}，准备好开始备课了吗？</p>
      </header>

      {/* Stats Cards：移动端大圆角 + 柔和阴影 */}
      <div className={`grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 ${isTeacher ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
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
              className="w-full rounded-mobile-lg md:rounded-xl border border-gray-100 md:border-gray-200 bg-white p-4 sm:p-5 text-left shadow-mobile-card md:shadow-sm transition-shadow hover:shadow-md active:shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                  <CreditCard className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-medium text-gray-500">套餐与定价</p>
                  <p className="text-base sm:text-lg font-bold text-gray-900">查看当前套餐与升级</p>
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
            <div className="rounded-mobile-lg md:rounded-xl border border-gray-100 md:border-gray-200 bg-white p-4 sm:p-5 shadow-mobile-card md:shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                  <Database className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-gray-500">题库总量</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 tabular-nums">{stats.total_questions ?? 0}</p>
                </div>
              </div>
            </div>
            <div className="rounded-mobile-lg md:rounded-xl border border-gray-100 md:border-gray-200 bg-white p-4 sm:p-5 shadow-mobile-card md:shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                  <Users className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-gray-500">学生档案</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 tabular-nums">{stats.total_students ?? 0}</p>
                </div>
              </div>
            </div>
            <div className="rounded-mobile-lg md:rounded-xl border border-gray-100 md:border-gray-200 bg-white p-4 sm:p-5 shadow-mobile-card md:shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                  <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-gray-500">试卷存档</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 tabular-nums">{stats.total_exams ?? 0}</p>
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
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
          <span>{error}</span>
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
            className="shrink-0 rounded-md bg-amber-200/80 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-200"
          >
            重试
          </button>
        </div>
      )}

      {/* Main: two columns */}
      <div className="grid grid-cols-1 gap-6 md:gap-8 lg:grid-cols-3">
        {/* Left 2/3: Quick Actions + Chart */}
        <div className="space-y-5 md:space-y-6 lg:col-span-2">
          <section className="rounded-mobile-lg md:rounded-xl border border-gray-100 md:border-gray-200 bg-white p-4 sm:p-6 shadow-mobile-card md:shadow-sm">
            <h2 className="mb-3 md:mb-4 text-base md:text-lg font-semibold text-gray-900">快捷入口</h2>
            <div className="flex flex-col sm:flex-row flex-wrap gap-3">
              <Link
                to="/smart-gen"
                className="flex items-center justify-center gap-2 rounded-xl md:rounded-lg bg-primary-600 px-5 py-3.5 sm:py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700 active:bg-primary-800"
              >
                <Sparkles className="h-5 w-5 shrink-0" />
                开始智能出题
              </Link>
              <Link
                to="/mistake-book"
                className="flex items-center justify-center gap-2 rounded-xl md:rounded-lg border border-gray-200 bg-white px-5 py-3.5 sm:py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-100"
              >
                <BookOpen className="h-5 w-5 shrink-0" />
                查看错题本
              </Link>
              <Link
                to="/student-mgmt"
                className="flex items-center justify-center gap-2 rounded-xl md:rounded-lg border border-gray-200 bg-white px-5 py-3.5 sm:py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-100"
              >
                <UserPlus className="h-5 w-5 shrink-0" />
                录入新学生
              </Link>
            </div>
          </section>

          {/* 学情趋势：仅当已选学生时展示 */}
          <section className="rounded-mobile-lg md:rounded-xl border border-gray-100 md:border-gray-200 bg-white p-4 sm:p-6 shadow-mobile-card md:shadow-sm w-full min-w-0">
            <h2 className="mb-3 md:mb-4 text-base md:text-lg font-semibold text-gray-900">学情趋势（近 8 周）</h2>
            {!currentStudent ? (
              <div className="flex min-h-[220px] items-center justify-center rounded-lg bg-gray-50 text-gray-500">
                请先在左侧选择学生，查看该生的错题新增与掌握趋势
              </div>
            ) : loadingTrend ? (
              <ChartSkeleton />
            ) : trendWeeks.length === 0 ? (
              <div className="flex min-h-[220px] items-center justify-center rounded-lg bg-gray-50 text-gray-500">
                暂无趋势数据
              </div>
            ) : (
              <div className="w-full min-w-0" style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height={260} minWidth={0}>
                  <BarChart data={trendWeeks} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip
                      formatter={(value, name) => [value, name === 'new_mistakes' ? '新增错题' : '新掌握']}
                      labelFormatter={(label) => `周 ${label}`}
                      contentStyle={{ borderRadius: 8 }}
                    />
                    <Bar dataKey="new_mistakes" fill="#f59e0b" radius={[4, 4, 0, 0]} name="新增错题" />
                    <Bar dataKey="new_mastered" fill="#10b981" radius={[4, 4, 0, 0]} name="新掌握" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="rounded-mobile-lg md:rounded-xl border border-gray-100 md:border-gray-200 bg-white p-4 sm:p-6 shadow-mobile-card md:shadow-sm w-full min-w-0">
            <h2 className="mb-3 md:mb-4 text-base md:text-lg font-semibold text-gray-900">题库知识点分布 (Top 5)</h2>
            {loading ? (
              <ChartSkeleton />
            ) : chartData.length === 0 ? (
              <div className="flex min-h-[300px] items-center justify-center rounded-lg bg-gray-50 text-gray-500">
                暂无题目数据
              </div>
            ) : (
              <div className="w-full min-w-0" style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height={300} minWidth={0}>
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12 }}
                      tickFormatter={(v) => (v.length > 6 ? v.slice(0, 6) + '…' : v)}
                    />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip
                      formatter={(value) => [value, '题目数']}
                      labelFormatter={(label) => `知识点: ${label}`}
                      contentStyle={{ borderRadius: 8 }}
                    />
                    <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} name="题目数" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        </div>

        {/* Right 1/3: Recent exams */}
        <div className="rounded-mobile-lg md:rounded-xl border border-gray-100 md:border-gray-200 bg-white p-4 sm:p-6 shadow-mobile-card md:shadow-sm min-w-0 overflow-x-auto">
          <h2 className="mb-3 md:mb-4 text-base md:text-lg font-semibold text-gray-900">最近试卷</h2>
          {loading ? (
            <ListSkeleton />
          ) : !stats.recent_exams?.length ? (
            <p className="text-sm text-gray-500">暂无试卷</p>
          ) : (
            <ul className="space-y-1 min-w-0">
              {stats.recent_exams.map((exam) => (
                <li key={exam.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/exams/${exam.id}`)}
                    className="w-full rounded-xl md:rounded-lg px-3 py-3 md:py-2.5 text-left transition-colors hover:bg-gray-50 active:bg-gray-100"
                  >
                    <p className="truncate text-sm font-medium text-gray-900" title={exam.title}>
                      {exam.title || '未命名试卷'}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {formatDate(exam.created_at)}
                      {exam.student_name ? ` · ${exam.student_name}` : ''}
                    </p>
                    {exam.student_id != null && (
                      <p className="mt-0.5 text-xs">
                        {exam.graded_at ? (
                          <span className="text-green-600">
                            已提交
                            {exam.grade_summary?.total != null &&
                              ` ${exam.grade_summary.correct}/${exam.grade_summary.total}`}
                          </span>
                        ) : (
                          <span className="text-amber-600">未提交</span>
                        )}
                      </p>
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
