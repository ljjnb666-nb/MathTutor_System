import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Sparkles,
  Bot,
  Calendar,
  Users,
  BookOpen,
  ArrowRight,
  Database,
  FileText,
  AlertCircle,
  CreditCard,
  CalendarCheck,
  CheckCircle2,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { getDashboardStats, getMistakes } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { useStudent } from '../contexts/StudentContext'
import { useSubscription } from '../contexts/SubscriptionContext'
import {
  Button,
  Card,
  Badge,
  StatusBadge,
  EmptyState,
  ErrorState,
  Skeleton,
} from '../components/ui'
import { normalizeApiError } from '../utils/normalizeApiError'
import { getTimeOfDayGreeting, formatCurrentDate, formatDateTime } from '../utils/date'

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { currentStudent } = useStudent()
  const { subscription, loading: subscriptionLoading } = useSubscription()
  const isTeacher = user?.role !== 'admin'

  const [stats, setStats] = useState(null)
  const [loadingStats, setLoadingStats] = useState(true)
  const [statsError, setStatsError] = useState(null)

  const [pendingMistakeCount, setPendingMistakeCount] = useState(null)
  const [loadingMistakes, setLoadingMistakes] = useState(false)
  const [mistakesError, setMistakesError] = useState(null)

  // Stale request guard for student switching
  const studentReqSeq = useRef(0)

  const fetchStats = useCallback(async () => {
    setLoadingStats(true)
    setStatsError(null)
    try {
      const res = await getDashboardStats()
      setStats(res.data || null)
    } catch (err) {
      setStatsError(normalizeApiError(err, '工作台统计数据加载失败'))
    } finally {
      setLoadingStats(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  useEffect(() => {
    const seq = ++studentReqSeq.current
    if (!currentStudent?.id) {
      setPendingMistakeCount(null)
      setMistakesError(null)
      setLoadingMistakes(false)
      return
    }

    setPendingMistakeCount(null)
    setMistakesError(null)
    setLoadingMistakes(true)

    getMistakes({ student_id: currentStudent.id, status: 'pending' })
      .then((res) => {
        if (seq !== studentReqSeq.current) return
        const list = Array.isArray(res.data) ? res.data : []
        setPendingMistakeCount(list.length)
        setMistakesError(null)
      })
      .catch((err) => {
        if (seq !== studentReqSeq.current) return
        setPendingMistakeCount(null)
        setMistakesError(err)
      })
      .finally(() => {
        if (seq === studentReqSeq.current) {
          setLoadingMistakes(false)
        }
      })
  }, [currentStudent?.id])

  const chartData = (stats?.knowledge_distribution || []).map(({ tag, count }) => ({
    name: tag || '未分类',
    count,
  }))

  const greeting = getTimeOfDayGreeting()
  const todayText = formatCurrentDate()

  // Subscription expiry calculation
  const periodEnd = subscription?.period_end
  const periodEndDate = periodEnd ? (typeof periodEnd === 'string' ? new Date(periodEnd) : periodEnd) : null
  const daysLeft = periodEndDate
    ? Math.ceil((periodEndDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null
  const isExpiringSoon = daysLeft != null && daysLeft >= 0 && daysLeft <= 7

  return (
    <div className="space-y-6 v2-page-shell">
      {/* 1. 工作台顶栏：克制、专业的问候与工作状态提示 */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-5 sm:p-6 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
            {greeting}，{user?.username || '老师'}
          </h1>
          <p className="mt-1 text-xs text-[var(--color-text-muted)] leading-relaxed">
            今天是 {todayText} · 全学科 AI 教学工作台
          </p>
        </div>

        {/* 订阅套餐状态简卡 (降级为 secondary utility，不干扰主教学视觉) */}
        {isTeacher && (
          <div className="flex items-center gap-3 self-start sm:self-auto">
            {subscriptionLoading ? (
              <Skeleton width="180px" height="36px" className="rounded-xl" />
            ) : subscription?.plan ? (
              <button
                type="button"
                onClick={() => navigate('/pricing')}
                className="flex items-center gap-2.5 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] px-3.5 py-2 text-left hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-secondary)] transition-all select-none"
                aria-label={`当前套餐：${subscription.plan.name}，点击管理订阅`}
              >
                <CreditCard className="h-4 w-4 text-[var(--color-brand-600)] shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-[var(--color-text-primary)] truncate">
                      {subscription.plan.name}
                    </span>
                    {isExpiringSoon && (
                      <Badge variant="warning" size="sm">
                        {daysLeft}天后到期
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-[var(--color-text-muted)]">
                    学生容量 {subscription.student_count ?? 0}/{subscription.max_students ?? 0}
                  </p>
                </div>
              </button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                icon={CreditCard}
                onClick={() => navigate('/pricing')}
              >
                套餐与方案
              </Button>
            )}
          </div>
        )}
      </section>

      {/* 2. 统计加载失败时的错误横幅 (不影响快捷导航和学生上下文继续操作) */}
      {statsError && (
        <ErrorState
          title="工作台统计加载受阻"
          message={statsError}
          onRetry={fetchStats}
        />
      )}

      {/* 3. 核心工作入口 (Primary Actions) */}
      <section aria-labelledby="section-primary-actions">
        <h2 id="section-primary-actions" className="sr-only">
          核心工作入口
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* AI 教师助手：核心中枢工作台入口 */}
          <div className="lg:col-span-5 rounded-2xl border border-[var(--color-brand-300)] bg-[var(--color-brand-subtle)] p-6 flex flex-col justify-between shadow-sm relative overflow-hidden">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-brand-600)] text-white shadow-sm">
                  <Bot className="h-5 w-5" aria-hidden="true" />
                </div>
                <Badge variant="brand" size="sm">核心中枢</Badge>
              </div>
              <h3 className="text-base font-bold text-[var(--color-text-primary)]">
                AI 教师助手
              </h3>
              <p className="mt-1.5 text-xs text-[var(--color-text-secondary)] leading-relaxed">
                基于教学目标、学生记录与现有资料辅助规划下一步教学任务，智能梳理教案与教研要点。
              </p>
            </div>
            <div className="mt-5">
              <Button
                variant="primary"
                size="sm"
                icon={ArrowRight}
                iconPosition="right"
                onClick={() => navigate('/teacher-agent')}
                className="w-full sm:w-auto"
              >
                进入助教工作区
              </Button>
            </div>
          </div>

          {/* 4 大常用教学动作快速启动网格 */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Link
              to="/smart-gen"
              className="flex items-start gap-3.5 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4 hover:border-[var(--color-brand-400)] hover:shadow-sm transition-all text-left group"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-subtle)] text-[var(--color-brand-text)] group-hover:scale-105 transition-transform">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-[var(--color-text-primary)] group-hover:text-[var(--color-brand-text)] transition-colors">
                  智能出题
                </h4>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)] line-clamp-2">
                  快速生成全学科练习题与教研测评题卡
                </p>
              </div>
            </Link>

            <Link
              to="/mistake-book"
              className="flex items-start gap-3.5 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4 hover:border-[var(--color-brand-400)] hover:shadow-sm transition-all text-left group"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 group-hover:scale-105 transition-transform">
                <BookOpen className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-[var(--color-text-primary)] group-hover:text-[var(--color-brand-text)] transition-colors">
                  错题巩固
                </h4>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)] line-clamp-2">
                  追踪薄弱知识点，安排错题针对性巩固
                </p>
              </div>
            </Link>

            <Link
              to="/schedule"
              className="flex items-start gap-3.5 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4 hover:border-[var(--color-brand-400)] hover:shadow-sm transition-all text-left group"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 group-hover:scale-105 transition-transform">
                <Calendar className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-[var(--color-text-primary)] group-hover:text-[var(--color-brand-text)] transition-colors">
                  排课日程
                </h4>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)] line-clamp-2">
                  查看与安排课时日程与每周授课规划
                </p>
              </div>
            </Link>

            <Link
              to="/student-mgmt"
              className="flex items-start gap-3.5 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4 hover:border-[var(--color-brand-400)] hover:shadow-sm transition-all text-left group"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 group-hover:scale-105 transition-transform">
                <Users className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-[var(--color-text-primary)] group-hover:text-[var(--color-brand-text)] transition-colors">
                  学生管理
                </h4>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)] line-clamp-2">
                  检索学生名册、建档录入与基础信息维护
                </p>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* 4. 教学业务工作区：当前关注学生 + 最近试卷存档 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* 左栏：当前学生上下文卡片 (Current Student Panel) */}
        <div className="lg:col-span-5">
          <Card
            title="当前聚焦学生"
            subtitle="针对选定学生的真实学习记录与待处理项"
            actions={
              currentStudent && (
                <StatusBadge status="info" label="已锁定档案" />
              )
            }
          >
            {currentStudent ? (
              <div className="space-y-4">
                {/* 学生基础属性 */}
                <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-3.5">
                  <div>
                    <h4 className="text-base font-bold text-[var(--color-text-primary)]">
                      {currentStudent.name}
                    </h4>
                    <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                      {[currentStudent.grade, currentStudent.class_name].filter(Boolean).join(' · ') || '未分班级'}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/student-mgmt')}
                  >
                    切换学生
                  </Button>
                </div>

                {/* 针对该学生的真实可用操作指标 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* 待攻克错题 */}
                  <button
                    type="button"
                    onClick={() => navigate('/mistake-book')}
                    className="flex flex-col justify-between rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-3.5 text-left hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-secondary)] transition-all"
                  >
                    <div className="flex items-center justify-between text-[var(--color-text-muted)] w-full">
                      <span className="text-xs font-medium">待巩固错题</span>
                      <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    </div>
                    <div className="my-2">
                      {loadingMistakes ? (
                        <Skeleton width="48px" height="28px" />
                      ) : mistakesError ? (
                        <span className="text-sm font-semibold text-[var(--color-danger)]">
                          暂不可用
                        </span>
                      ) : (
                        <span className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] tabular-nums">
                          {pendingMistakeCount ?? 0}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--color-text-muted)]">
                      {loadingMistakes
                        ? '正在查询…'
                        : mistakesError
                        ? '数据加载异常'
                        : pendingMistakeCount === 0
                        ? '当前暂无待巩固错题'
                        : '点击前往错题本攻克'}
                    </p>
                  </button>

                  {/* 今日待复习 (基于全局真实 stats 统计) */}
                  <button
                    type="button"
                    onClick={() => navigate('/mistake-book?review_due=1')}
                    className="flex flex-col justify-between rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-3.5 text-left hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-secondary)] transition-all"
                  >
                    <div className="flex items-center justify-between text-[var(--color-text-muted)] w-full">
                      <span className="text-xs font-medium">今日待复习</span>
                      <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    </div>
                    <div className="my-2">
                      {loadingStats ? (
                        <Skeleton width="48px" height="28px" />
                      ) : statsError ? (
                        <span className="text-sm font-semibold text-[var(--color-danger)]">
                          暂不可用
                        </span>
                      ) : (
                        <span className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] tabular-nums">
                          {stats?.today_review_count ?? 0}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--color-text-muted)]">
                      {loadingStats
                        ? '正在查询…'
                        : statsError
                        ? '数据加载异常'
                        : (stats?.today_review_count ?? 0) === 0
                        ? '今日暂无待复习记录'
                        : '点击开始今日到期复习'}
                    </p>
                  </button>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={Users}
                title="尚未选择学生"
                description="从左下角学生选择器切换，或前往学生管理查看完整档案与学情。"
                actionLabel="前往学生管理"
                onAction={() => navigate('/student-mgmt')}
              />
            )}
          </Card>
        </div>

        {/* 右栏：最近试卷存档 (Recent Exams) */}
        <div className="lg:col-span-7">
          <Card
            title="最近试卷存档"
            subtitle="真实保存的教学测评与试卷资产"
            actions={
              <Link
                to="/exams"
                className="text-xs font-semibold text-[var(--color-brand-600)] hover:text-[var(--color-brand-500)] inline-flex items-center gap-1 transition-colors"
              >
                全部试卷
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            }
          >
            {loadingStats ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} height="52px" className="rounded-xl" />
                ))}
              </div>
            ) : !stats?.recent_exams?.length ? (
              <EmptyState
                icon={FileText}
                title="暂无试卷记录"
                description="通过智能出题或导入试卷保存后，最新试卷会展示在此处。"
                actionLabel="去智能出题"
                onAction={() => navigate('/smart-gen')}
              />
            ) : (
              <ul className="space-y-2.5" aria-label="最近试卷列表">
                {stats.recent_exams.map((exam) => (
                  <li key={exam.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/exams/${exam.id}`)}
                      className="w-full flex items-center justify-between gap-4 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-3.5 hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-secondary)] transition-all text-left group"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate group-hover:text-[var(--color-brand-text)] transition-colors">
                          {exam.title || '未命名试卷'}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                          <span>{formatDateTime(exam.created_at)}</span>
                          {exam.student_name && (
                            <>
                              <span>·</span>
                              <span className="truncate max-w-[120px]">
                                {exam.student_name}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {exam.student_id != null || exam.graded_at ? (
                          exam.graded_at ? (
                            <StatusBadge
                              status="success"
                              label={`已批改${
                                exam.grade_summary?.total != null
                                  ? ` ${exam.grade_summary.correct}/${exam.grade_summary.total}`
                                  : ''
                              }`}
                            />
                          ) : (
                            <StatusBadge status="warning" label="待批改" />
                          )
                        ) : (
                          <Badge variant="neutral" size="sm">已归档</Badge>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* 5. 教学资产总览与题库内容分布 (Secondary Assets & Distribution) */}
      <section aria-labelledby="section-assets-distribution" className="space-y-4">
        <h2 id="section-assets-distribution" className="text-base font-bold text-[var(--color-text-primary)]">
          教学资产与题库分布
        </h2>

        {/* 教学资产概览：小型 Secondary Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <button
            type="button"
            onClick={() => navigate('/question-bank')}
            className="flex items-center gap-3.5 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4 hover:border-[var(--color-border-strong)] transition-all text-left"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 shrink-0">
              <Database className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-[var(--color-text-muted)]">题库题目</p>
              <p className="text-xl font-bold text-[var(--color-text-primary)] tabular-nums">
                {loadingStats ? '—' : stats?.total_questions ?? 0}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigate('/student-mgmt')}
            className="flex items-center gap-3.5 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4 hover:border-[var(--color-border-strong)] transition-all text-left"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 shrink-0">
              <Users className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-[var(--color-text-muted)]">学生档案</p>
              <p className="text-xl font-bold text-[var(--color-text-primary)] tabular-nums">
                {loadingStats ? '—' : stats?.total_students ?? 0}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigate('/exams')}
            className="flex items-center gap-3.5 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4 hover:border-[var(--color-border-strong)] transition-all text-left"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 shrink-0">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-[var(--color-text-muted)]">试卷归档</p>
              <p className="text-xl font-bold text-[var(--color-text-primary)] tabular-nums">
                {loadingStats ? '—' : stats?.total_exams ?? 0}
              </p>
            </div>
          </button>
        </div>

        {/* 题库内容分布 (Knowledge Distribution) */}
        <Card
          title="题库内容分布"
          subtitle="按知识点统计个人题库题目数量（Top 5 真实题库记录）"
        >
          {loadingStats ? (
            <div className="h-56 w-full animate-pulse rounded-xl bg-[var(--color-bg-subtle)]" />
          ) : chartData.length === 0 ? (
            <EmptyState
              icon={Database}
              title="暂无题库分布数据"
              description="录入或生成题目后，这里将按知识点展示题目数量分布。"
              actionLabel="录入新题目"
              onAction={() => navigate('/smart-gen')}
            />
          ) : (
            <div>
              {/* 无障碍文本对照表格（满足 WCAG 2.1 规范） */}
              <div className="sr-only">
                <table>
                  <caption>题库内容分布统计</caption>
                  <thead>
                    <tr>
                      <th scope="col">知识点名称</th>
                      <th scope="col">题目数量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((d) => (
                      <tr key={d.name}>
                        <td>{d.name}</td>
                        <td>{d.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Recharts 纯语义化主题渲染 */}
              <div className="w-full min-w-0" style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height={240} minWidth={0}>
                  <BarChart data={chartData} margin={{ top: 12, right: 12, left: -16, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                      axisLine={{ stroke: 'var(--color-border-default)' }}
                      tickFormatter={(v) => (v.length > 8 ? v.slice(0, 8) + '…' : v)}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                      allowDecimals={false}
                      axisLine={false}
                    />
                    <Tooltip
                      formatter={(value) => [value, '题目数量']}
                      labelFormatter={(label) => `知识点：${label}`}
                      contentStyle={{
                        backgroundColor: 'var(--color-bg-surface-raised)',
                        borderColor: 'var(--color-border-default)',
                        borderRadius: '12px',
                        color: 'var(--color-text-primary)',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                        fontSize: '12px',
                      }}
                    />
                    <Bar
                      dataKey="count"
                      fill="var(--color-brand-600)"
                      radius={[6, 6, 0, 0]}
                      name="题目数量"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </Card>
      </section>
    </div>
  )
}
