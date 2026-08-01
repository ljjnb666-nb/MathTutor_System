import {
  AlertTriangle,
  BarChart3,
  Download,
  Edit,
  GitBranch,
  LayoutDashboard,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { useSubscription } from '../contexts/SubscriptionContext'
import { useStudent } from '../contexts/StudentContext'
import StudentFormModal from '../features/student-mgmt/components/StudentFormModal'
import { getAvatarStyle, getInitial } from '../features/student-mgmt/utils/studentMgmtUtils'
import { useStudentMgmtState } from '../features/student-mgmt/hooks/useStudentMgmtState'
import {
  EmptyState,
  LoadingState,
  MetricCard,
  PageHeader,
  PageShell,
  ResponsiveTable,
  SearchInput,
  SectionCard,
  StatusBadge,
  Toolbar,
} from '../components/UiV2'

function getRisk(student, overview) {
  const score = Number(student.performance_score ?? student.average_accuracy ?? 0)
  const weak = Number(overview?.weak_point_count ?? 0)
  const pending = Number(overview?.pending_mistake_count ?? 0)
  if ((score > 0 && score < 60) || weak >= 5 || pending >= 10) return { label: '高风险', tone: 'danger' }
  if ((score > 0 && score < 78) || weak >= 3 || pending >= 4) return { label: '中风险', tone: 'warning' }
  return { label: '低风险', tone: 'success' }
}

function pct(value, total) {
  if (!total) return 0
  return Math.round((value / total) * 100)
}

function gradeLabel(student) {
  return [student.grade, student.class_name].filter(Boolean).join(' / ') || '未设置'
}

function StudentIdentity({ student, current }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black ${getAvatarStyle(student.name)}`}>
        {getInitial(student.name)}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-bold text-[var(--color-text-primary)]">{student.name || '未命名'}</p>
          {current && <StatusBadge tone="info">当前</StatusBadge>}
        </div>
        <p className="truncate text-xs text-[var(--color-text-secondary)]">{student.student_no || student.login_code || '无学号'}</p>
      </div>
    </div>
  )
}

export default function StudentMgmt() {
  const navigate = useNavigate()
  const { atStudentLimit, refreshSubscription } = useSubscription()
  const { currentStudent, selectStudent } = useStudent()

  const { actions, derived, state } = useStudentMgmtState({
    atStudentLimit,
    navigate,
    refreshSubscription,
    selectStudent,
  })

  const total = state.students.length
  const filteredTotal = derived.filtered.length
  const activeCount = state.students.filter((student) => Number(student.performance_score ?? 0) >= 80).length
  const watched = state.students.filter((student) => {
    const overview = state.overviewMap[student.id]
    return getRisk(student, overview).tone !== 'success'
  })
  const newThisWeek = state.students.filter((student) => {
    if (!student.created_at) return false
    const createdAt = new Date(student.created_at).getTime()
    return Number.isFinite(createdAt) && Date.now() - createdAt <= 7 * 24 * 60 * 60 * 1000
  }).length
  const gradeCounts = state.students.reduce((acc, student) => {
    const key = student.grade || '未设置'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
  const topClasses = Object.entries(
    state.students.reduce((acc, student) => {
      const key = gradeLabel(student)
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 5)

  const columns = [
    {
      key: 'student',
      title: '学生',
      render: (student) => <StudentIdentity student={student} current={currentStudent?.id === student.id} />,
    },
    { key: 'class', title: '班级', render: (student) => gradeLabel(student) },
    {
      key: 'activity',
      title: '学情活跃',
      render: (student) => {
        const overview = state.overviewMap[student.id] || {}
        const score = Number(student.performance_score ?? 0)
        return (
          <div className="min-w-[8rem] space-y-1">
            <div className="flex justify-between text-xs">
              <span>{score ? `${score}%` : '暂无'}</span>
              <span className="text-[var(--color-text-secondary)]">{overview.today_review_count ?? 0} 待复习</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--color-bg-panel-muted)]">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(score || 0, 100)}%` }} />
            </div>
          </div>
        )
      },
    },
    {
      key: 'risk',
      title: '风险等级',
      render: (student) => {
        const risk = getRisk(student, state.overviewMap[student.id])
        return <StatusBadge tone={risk.tone}>{risk.label}</StatusBadge>
      },
    },
    {
      key: 'actions',
      title: '操作',
      render: (student) => (
        <div className="flex items-center gap-1">
          <button type="button" className="v2-icon-button" title="学情图谱" onClick={() => actions.handleSelectAndGo(student.id, '/knowledge-graph')}>
            <GitBranch className="h-4 w-4" />
          </button>
          <button type="button" className="v2-icon-button" title="首页" onClick={() => actions.handleSelectAndGo(student.id, '/')}>
            <LayoutDashboard className="h-4 w-4" />
          </button>
          <button type="button" className="v2-icon-button" title="下载学习报告" onClick={() => actions.handleDownloadReport(student)} disabled={state.reportDownloadingId === student.id}>
            <Download className="h-4 w-4" />
          </button>
          <button type="button" className="v2-icon-button" title="编辑" onClick={() => actions.openEdit(student)}>
            <Edit className="h-4 w-4" />
          </button>
          <button type="button" className="v2-icon-button text-rose-400" title="删除" onClick={() => actions.handleDelete(student)}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <PageShell>
      <PageHeader
        title="学生管理与总览"
        description="集中查看学生档案、学情风险和常用管理入口。"
        icon={Users}
        actions={(
          <button
            type="button"
            onClick={actions.openAdd}
            disabled={state.atStudentLimit}
            title={state.atStudentLimit ? '当前套餐学生数已满，请升级' : undefined}
            className="v2-button v2-button-primary"
          >
            <Plus className="h-4 w-4" />
            {state.atStudentLimit ? '已达上限' : '添加学生'}
          </button>
        )}
      />

      <Toolbar>
        <SearchInput
          value={state.searchTerm}
          onChange={(event) => actions.setSearchTerm(event.target.value)}
          placeholder="搜索学生姓名、学号或班级..."
          label="搜索学生"
          className="md:min-w-[24rem]"
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="v2-button v2-button-secondary" onClick={() => actions.setSearchTerm('')} disabled={!state.searchTerm.trim()}>
            <Search className="h-4 w-4" />
            重置
          </button>
        </div>
      </Toolbar>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="学生总数" value={state.loading ? '...' : total} hint={state.searchTerm.trim() ? `筛选后 ${filteredTotal} 人` : '当前档案'} icon={Users} tone="primary" />
        <MetricCard label="活跃学生" value={state.loading ? '...' : activeCount} hint="按真实表现分统计" icon={BarChart3} tone="success" />
        <MetricCard label="待关注学生" value={state.loading ? '...' : watched.length} hint="由分数、错题和弱项推导" icon={AlertTriangle} tone="warning" />
        <MetricCard label="本周新增" value={state.loading ? '...' : newThisWeek} hint="按 created_at 统计" icon={Plus} tone="info" />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <SectionCard title="全部学生" actions={<StatusBadge tone="neutral">共 {filteredTotal} 条</StatusBadge>}>
          {state.loading ? (
            <LoadingState title="正在加载学生" description="正在读取学生档案和学情概览。" />
          ) : (
            <ResponsiveTable
              columns={columns}
              rows={derived.filtered}
              rowKey={(student) => student.id}
              empty={(
                <EmptyState
                  icon={Users}
                  title="暂无学生"
                  description={state.searchTerm.trim() ? '没有符合搜索条件的学生。' : '点击添加学生录入新档案。'}
                  action={state.searchTerm.trim() ? (
                    <button type="button" className="v2-button v2-button-secondary" onClick={() => actions.setSearchTerm('')}>清空搜索</button>
                  ) : null}
                />
              )}
              renderMobile={(student) => {
                const overview = state.overviewMap[student.id]
                const risk = getRisk(student, overview)
                return (
                  <div className="space-y-3">
                    <StudentIdentity student={student} current={currentStudent?.id === student.id} />
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <span className="text-[var(--color-text-secondary)]">班级</span>
                      <span className="text-right font-semibold">{gradeLabel(student)}</span>
                      <span className="text-[var(--color-text-secondary)]">待复习</span>
                      <span className="text-right font-semibold">{overview?.today_review_count ?? 0}</span>
                      <span className="text-[var(--color-text-secondary)]">弱项</span>
                      <span className="text-right font-semibold">{overview?.weak_point_count ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <StatusBadge tone={risk.tone}>{risk.label}</StatusBadge>
                      {columns.find((column) => column.key === 'actions').render(student)}
                    </div>
                  </div>
                )
              }}
            />
          )}
        </SectionCard>

        <aside className="space-y-4">
          <SectionCard title="学生分布">
            {total ? (
              <div className="space-y-3">
                {Object.entries(gradeCounts).map(([label, value]) => (
                  <div key={label} className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-[var(--color-text-primary)]">{label}</span>
                      <span className="text-[var(--color-text-secondary)]">{value} 人 · {pct(value, total)}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--color-bg-panel-muted)]">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct(value, total)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="暂无分布" description="录入学生后按真实年级统计。" />
            )}
          </SectionCard>

          <SectionCard title="风险预警">
            {watched.length ? (
              <ul className="space-y-3">
                {watched.slice(0, 5).map((student) => {
                  const overview = state.overviewMap[student.id] || {}
                  const risk = getRisk(student, overview)
                  return (
                    <li key={student.id} className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <StudentIdentity student={student} current={currentStudent?.id === student.id} />
                        <StatusBadge tone={risk.tone}>{risk.label}</StatusBadge>
                      </div>
                      <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                        错题 {overview.pending_mistake_count ?? 0} · 弱项 {overview.weak_point_count ?? 0}
                      </p>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyState title="暂无风险预警" description="当前没有可由真实数据推导出的风险项。" />
            )}
          </SectionCard>

          <SectionCard title="班级活跃排行">
            {topClasses.length ? (
              <div className="space-y-3">
                {topClasses.map(([label, value], index) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--color-bg-panel)] text-xs font-black text-[var(--color-text-primary)]">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between text-xs">
                        <span className="truncate font-semibold text-[var(--color-text-primary)]">{label}</span>
                        <span className="text-[var(--color-text-secondary)]">{value} 人</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--color-bg-panel-muted)]">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct(value, total)}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="暂无排行" description="录入学生后显示真实班级分布。" />
            )}
          </SectionCard>
        </aside>
      </div>

      <StudentFormModal
        editingStudent={state.editingStudent}
        form={state.form}
        modalOpen={state.modalOpen}
        onClose={actions.closeModal}
        onSetForm={actions.setForm}
        onSubmit={actions.handleSubmit}
        saving={state.saving}
      />
    </PageShell>
  )
}
