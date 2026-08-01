import {
  AlertTriangle,
  ArrowUpDown,
  Calendar,
  Copy,
  Edit,
  History,
  Loader2,
  Repeat,
  Trash2,
  Users,
} from 'lucide-react'

import { formatDuration, formatWeekday } from '../utils/scheduleMath'
import { todayStr } from '../utils/dateRanges'

function EmptyState({ scheduleView, schedules, students, filterStudentId, dateRange }) {
  const showUpcomingDone = scheduleView === 'upcoming' && schedules.length > 0
  const showNoStudents = students.length === 0

  return (
    <div className=”flex flex-col items-center justify-center rounded-2xl py-20 shadow-sm” style={{ border: '1px solid color-mix(in srgb, var(--color-border-primary) 80%, transparent)', backgroundColor: 'var(--color-bg-card)' }}>
      {showUpcomingDone ? (
        <>
          <div className=”flex h-20 w-20 items-center justify-center rounded-full bg-amber-50”>
            <History className=”h-10 w-10 text-amber-500” />
          </div>
          <p className=”mt-5 text-base font-semibold” style={{ color: 'var(--color-text-primary)' }}>当前没有即将开始的排课</p>
          <p className=”mt-2 max-w-xs text-center text-sm” style={{ color: 'var(--color-text-muted)' }}>
            今日已结束的课程不会显示在这里，可切换到”历史记录”查看。
          </p>
        </>
      ) : showNoStudents ? (
        <>
          <div className=”flex h-20 w-20 items-center justify-center rounded-full” style={{ backgroundColor: 'var(--color-bg-panel)' }}>
            <Users className=”h-10 w-10” style={{ color: 'var(--color-text-muted)' }} />
          </div>
          <p className=”mt-5 text-base font-semibold” style={{ color: 'var(--color-text-primary)' }}>暂无学生</p>
          <p className=”mt-2 max-w-xs text-center text-sm” style={{ color: 'var(--color-text-muted)' }}>请先在”学生管理”中添加学生，再到此排课。</p>
        </>
      ) : (
        <>
          <div className={`flex h-20 w-20 items-center justify-center rounded-full ${scheduleView === 'history' ? 'bg-amber-50' : 'bg-blue-50'}`}>
            {scheduleView === 'history' ? (
              <History className=”h-10 w-10 text-amber-500” />
            ) : (
              <Calendar className=”h-10 w-10” style={{ color: 'var(--color-primary-500)' }} />
            )}
          </div>
          <p className=”mt-5 text-base font-semibold” style={{ color: 'var(--color-text-primary)' }}>
            {scheduleView === 'history' ? '该时间段暂无历史记录' : '暂无排课'}
          </p>
          <p className=”mt-2 max-w-xs text-center text-sm” style={{ color: 'var(--color-text-muted)' }}>
            {scheduleView === 'history'
              ? '历史记录仅展示已经结束的课程，可切换时间范围继续查看。'
              : filterStudentId != null || dateRange !== 'all'
                ? '试试调整筛选条件或选择”全部”。'
                : '点击上方”添加排课”开始安排课程。'}
          </p>
        </>
      )}
    </div>
  )
}

function buildConflictText(schedule, conflictMap, sortedSchedules) {
  const conflictIds = conflictMap.get(schedule.id) || []
  if (conflictIds.length === 0) return ''
  const conflictWith = sortedSchedules.filter((item) => conflictIds.includes(item.id))
  return `与以下排课时段冲突：${conflictWith.map((item) => `${item.student_name ?? '学生'} ${item.start_time}-${item.end_time}`).join('、')}`
}

export default function ScheduleList({
  conflictMap,
  filteredSchedules,
  filterStudentId,
  loading,
  onDelete,
  onEdit,
  onOpenCopy,
  onToggleSort,
  scheduleView,
  schedules,
  sortOrder,
  sortedSchedules,
  students,
  dateRange,
}) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20" style={{ color: 'var(--color-text-muted)' }}>
        <div className="rounded-full p-4" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)' }}>
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--color-primary-500)' }} />
        </div>
        <p className="mt-4 text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>加载排课中…</p>
        <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>请稍候</p>
      </div>
    )
  }

  if (filteredSchedules.length === 0) {
    return (
      <EmptyState
        dateRange={dateRange}
        filterStudentId={filterStudentId}
        scheduleView={scheduleView}
        schedules={schedules}
        students={students}
      />
    )
  }

  return (
    <>
      {scheduleView === 'history' && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-2.5 text-sm text-amber-800">
          <History className="h-4 w-4 shrink-0 text-amber-600" />
          <span>以下为已经结束的排课记录，默认按时间倒序展示。</span>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onToggleSort}
          className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium shadow-sm transition-colors"
          style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-primary-500)'
            e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border-primary)'
            e.currentTarget.style.backgroundColor = 'var(--color-bg-input)'
          }}
          title={sortOrder === 'timeAsc' ? '当前按开始时间升序，点击切换为降序' : '当前按开始时间降序，点击切换为升序'}
        >
          <ArrowUpDown className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
          {sortOrder === 'timeAsc' ? '按开始时间升序' : '按开始时间降序'}
        </button>
        {conflictMap.size > 0 && (
          <span className="inline-flex items-center gap-2 rounded-xl bg-amber-50 px-3.5 py-2 text-sm font-medium text-amber-800 ring-1 ring-amber-200/80">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            共 {conflictMap.size} 条时段冲突
          </span>
        )}
      </div>

      <div className="hidden overflow-hidden rounded-2xl shadow-sm md:block" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }}>
        <div className="overflow-x-auto">
          <table className="min-w-full" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead className="sticky top-0 z-[1]" style={{ backgroundColor: 'color-mix(in srgb, var(--color-bg-panel) 95%, transparent)' }}>
              <tr>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>日期</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>时间 / 时长</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>学生</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>主题</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>备注</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>状态</th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {sortedSchedules.map((schedule) => {
                const isToday = schedule.schedule_date === todayStr()
                const hasConflict = (conflictMap.get(schedule.id) || []).length > 0
                const conflictTip = buildConflictText(schedule, conflictMap, sortedSchedules)

                return (
                  <tr
                    key={schedule.id}
                    className="transition-colors duration-150"
                    style={{
                      backgroundColor: isToday ? 'color-mix(in srgb, var(--color-primary-500) 5%, transparent)' : hasConflict ? 'color-mix(in srgb, #f59e0b 6%, transparent)' : 'transparent',
                      borderTop: '1px solid var(--color-border-subtle)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--color-bg-panel) 80%, transparent)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = isToday ? 'color-mix(in srgb, var(--color-primary-500) 5%, transparent)' : hasConflict ? 'color-mix(in srgb, #f59e0b 6%, transparent)' : 'transparent'
                    }}
                  >
                    <td className="whitespace-nowrap px-5 py-3.5 text-sm" style={isToday ? { borderLeft: '4px solid var(--color-primary-500)' } : {}}>
                      <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{schedule.schedule_date}</span>
                      <span className="ml-2" style={{ color: 'var(--color-text-muted)' }}>{formatWeekday(schedule.schedule_date)}</span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-sm" style={{ color: 'var(--color-text-primary)' }}>
                      <span className="font-medium">{schedule.start_time} - {schedule.end_time}</span>
                      <span className="ml-2" style={{ color: 'var(--color-text-muted)' }}>{formatDuration(schedule.start_time, schedule.end_time)}</span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      <span>{schedule.student_name ?? `学生 #${schedule.student_id}`}</span>
                      {schedule.is_recurring && (
                        <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700" title="每周重复">
                          <Repeat className="h-3 w-3" /> 每周
                        </span>
                      )}
                    </td>
                    <td className="max-w-[12rem] truncate px-5 py-3.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{schedule.subject ?? '--'}</td>
                    <td className="max-w-[12rem] truncate px-5 py-3.5 text-sm" style={{ color: 'var(--color-text-muted)' }}>{schedule.note ?? '--'}</td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      {hasConflict ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800" title={conflictTip}>
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          冲突
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>--</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          onClick={() => onOpenCopy(schedule)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
                          style={{ color: 'var(--color-text-muted)' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                            e.currentTarget.style.color = 'var(--color-text-primary)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent'
                            e.currentTarget.style.color = 'var(--color-text-muted)'
                          }}
                          title="复制为新排课"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onEdit(schedule)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
                          style={{ color: 'var(--color-primary-600)' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent'
                          }}
                          title="编辑"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(schedule)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-600 transition-colors"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'color-mix(in srgb, #dc2626 10%, transparent)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent'
                          }}
                          title="删除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4 md:hidden">
        {sortedSchedules.map((schedule) => {
          const isToday = schedule.schedule_date === todayStr()
          const hasConflict = (conflictMap.get(schedule.id) || []).length > 0

          return (
            <div
              key={schedule.id}
              className="rounded-2xl p-4 shadow-sm transition-shadow"
              style={{
                border: isToday ? '1px solid var(--color-primary-500)' : hasConflict ? '1px solid color-mix(in srgb, #f59e0b 60%, transparent)' : '1px solid var(--color-border-primary)',
                backgroundColor: hasConflict ? 'color-mix(in srgb, #f59e0b 8%, transparent)' : 'var(--color-bg-card)',
                borderLeft: isToday ? '4px solid var(--color-primary-500)' : undefined,
                boxShadow: isToday ? '0 0 0 1px color-mix(in srgb, var(--color-primary-500) 20%, transparent)' : undefined
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
              }}
              onMouseLeave={(e) => {
                if (isToday) {
                  e.currentTarget.style.boxShadow = '0 0 0 1px color-mix(in srgb, var(--color-primary-500) 20%, transparent)'
                } else {
                  e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                }
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                      {schedule.schedule_date}
                      <span className="ml-1.5 font-normal" style={{ color: 'var(--color-text-muted)' }}>{formatWeekday(schedule.schedule_date)}</span>
                    </p>
                    {hasConflict && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        <AlertTriangle className="h-3 w-3" />
                        冲突
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{schedule.start_time} - {schedule.end_time}</span>
                    <span style={{ color: 'var(--color-text-muted)' }}> / {formatDuration(schedule.start_time, schedule.end_time)}</span>
                  </p>
                  <p className="mt-1.5 text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    {schedule.student_name ?? `学生 #${schedule.student_id}`}
                    {schedule.is_recurring && (
                      <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-700">
                        <Repeat className="h-3 w-3" /> 每周
                      </span>
                    )}
                  </p>
                  {(schedule.subject || schedule.note) && (
                    <p className="mt-1 line-clamp-2 max-w-[16rem] text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {[schedule.subject, schedule.note].filter(Boolean).join(' / ')}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1 rounded-xl p-1" style={{ backgroundColor: 'var(--color-bg-panel)' }}>
                  <button
                    type="button"
                    onClick={() => onOpenCopy(schedule)}
                    className="rounded-lg p-2.5 transition-colors"
                    style={{ color: 'var(--color-text-muted)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--color-bg-elevated)'
                      e.currentTarget.style.color = 'var(--color-text-primary)'
                      e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                      e.currentTarget.style.color = 'var(--color-text-muted)'
                      e.currentTarget.style.boxShadow = ''
                    }}
                    title="复制"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(schedule)}
                    className="rounded-lg p-2.5 transition-colors"
                    style={{ color: 'var(--color-primary-600)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--color-bg-elevated)'
                      e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                      e.currentTarget.style.boxShadow = ''
                    }}
                    title="编辑"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(schedule)}
                    className="rounded-lg p-2.5 text-red-600 transition-colors"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--color-bg-elevated)'
                      e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                      e.currentTarget.style.boxShadow = ''
                    }}
                    title="删除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
