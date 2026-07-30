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
    <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200/80 bg-white py-20 shadow-sm">
      {showUpcomingDone ? (
        <>
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-50">
            <History className="h-10 w-10 text-amber-500" />
          </div>
          <p className="mt-5 text-base font-semibold text-gray-700">当前没有即将开始的排课</p>
          <p className="mt-2 max-w-xs text-center text-sm text-gray-500">
            今日已结束的课程不会显示在这里，可切换到“历史记录”查看。
          </p>
        </>
      ) : showNoStudents ? (
        <>
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
            <Users className="h-10 w-10 text-gray-400" />
          </div>
          <p className="mt-5 text-base font-semibold text-gray-700">暂无学生</p>
          <p className="mt-2 max-w-xs text-center text-sm text-gray-500">请先在“学生管理”中添加学生，再到此排课。</p>
        </>
      ) : (
        <>
          <div className={`flex h-20 w-20 items-center justify-center rounded-full ${scheduleView === 'history' ? 'bg-amber-50' : 'bg-blue-50'}`}>
            {scheduleView === 'history' ? (
              <History className="h-10 w-10 text-amber-500" />
            ) : (
              <Calendar className="h-10 w-10 text-blue-500" />
            )}
          </div>
          <p className="mt-5 text-base font-semibold text-gray-700">
            {scheduleView === 'history' ? '该时间段暂无历史记录' : '暂无排课'}
          </p>
          <p className="mt-2 max-w-xs text-center text-sm text-gray-500">
            {scheduleView === 'history'
              ? '历史记录仅展示已经结束的课程，可切换时间范围继续查看。'
              : filterStudentId != null || dateRange !== 'all'
                ? '试试调整筛选条件或选择“全部”。'
                : '点击上方“添加排课”开始安排课程。'}
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
      <div className="flex flex-col items-center justify-center py-20 text-gray-500">
        <div className="rounded-full bg-blue-50 p-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
        <p className="mt-4 text-sm font-medium text-gray-600">加载排课中…</p>
        <p className="mt-1 text-xs text-gray-400">请稍候</p>
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
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-blue-200 hover:bg-gray-50 hover:text-gray-900"
          title={sortOrder === 'timeAsc' ? '当前按开始时间升序，点击切换为降序' : '当前按开始时间降序，点击切换为升序'}
        >
          <ArrowUpDown className="h-4 w-4 text-gray-500" />
          {sortOrder === 'timeAsc' ? '按开始时间升序' : '按开始时间降序'}
        </button>
        {conflictMap.size > 0 && (
          <span className="inline-flex items-center gap-2 rounded-xl bg-amber-50 px-3.5 py-2 text-sm font-medium text-amber-800 ring-1 ring-amber-200/80">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            共 {conflictMap.size} 条时段冲突
          </span>
        )}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="sticky top-0 z-[1] bg-gray-50/95">
              <tr>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">日期</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">时间 / 时长</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">学生</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">主题</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">备注</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">状态</th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {sortedSchedules.map((schedule) => {
                const isToday = schedule.schedule_date === todayStr()
                const hasConflict = (conflictMap.get(schedule.id) || []).length > 0
                const conflictTip = buildConflictText(schedule, conflictMap, sortedSchedules)

                return (
                  <tr
                    key={schedule.id}
                    className={`transition-colors duration-150 ${isToday ? 'bg-blue-50/50' : ''} ${hasConflict ? 'bg-amber-50/60' : ''} hover:bg-gray-50/80`}
                  >
                    <td className={`whitespace-nowrap px-5 py-3.5 text-sm ${isToday ? 'border-l-4 border-l-blue-500' : ''}`}>
                      <span className="font-medium text-gray-900">{schedule.schedule_date}</span>
                      <span className="ml-2 text-gray-500">{formatWeekday(schedule.schedule_date)}</span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-sm text-gray-700">
                      <span className="font-medium">{schedule.start_time} - {schedule.end_time}</span>
                      <span className="ml-2 text-gray-500">{formatDuration(schedule.start_time, schedule.end_time)}</span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-sm font-medium text-gray-800">
                      <span>{schedule.student_name ?? `学生 #${schedule.student_id}`}</span>
                      {schedule.is_recurring && (
                        <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700" title="每周重复">
                          <Repeat className="h-3 w-3" /> 每周
                        </span>
                      )}
                    </td>
                    <td className="max-w-[12rem] truncate px-5 py-3.5 text-sm text-gray-600">{schedule.subject ?? '--'}</td>
                    <td className="max-w-[12rem] truncate px-5 py-3.5 text-sm text-gray-500">{schedule.note ?? '--'}</td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      {hasConflict ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800" title={conflictTip}>
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          冲突
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">--</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          onClick={() => onOpenCopy(schedule)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                          title="复制为新排课"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onEdit(schedule)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-blue-600 transition-colors hover:bg-blue-50"
                          title="编辑"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(schedule)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-600 transition-colors hover:bg-red-50"
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
              className={`rounded-2xl border bg-white p-4 shadow-sm transition-shadow ${isToday ? 'border-l-4 border-l-blue-500 ring-1 ring-blue-100' : ''} ${hasConflict ? 'border-amber-300/80 bg-amber-50/40' : 'border-gray-200'} hover:shadow-md`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-gray-900">
                      {schedule.schedule_date}
                      <span className="ml-1.5 font-normal text-gray-500">{formatWeekday(schedule.schedule_date)}</span>
                    </p>
                    {hasConflict && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        <AlertTriangle className="h-3 w-3" />
                        冲突
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-gray-600">
                    <span className="font-medium text-gray-800">{schedule.start_time} - {schedule.end_time}</span>
                    <span className="text-gray-500"> / {formatDuration(schedule.start_time, schedule.end_time)}</span>
                  </p>
                  <p className="mt-1.5 text-sm font-medium text-gray-800">
                    {schedule.student_name ?? `学生 #${schedule.student_id}`}
                    {schedule.is_recurring && (
                      <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-700">
                        <Repeat className="h-3 w-3" /> 每周
                      </span>
                    )}
                  </p>
                  {(schedule.subject || schedule.note) && (
                    <p className="mt-1 line-clamp-2 max-w-[16rem] text-xs text-gray-500">
                      {[schedule.subject, schedule.note].filter(Boolean).join(' / ')}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1 rounded-xl bg-gray-50 p-1">
                  <button
                    type="button"
                    onClick={() => onOpenCopy(schedule)}
                    className="rounded-lg p-2.5 text-gray-500 transition-colors hover:bg-white hover:text-gray-700 hover:shadow-sm"
                    title="复制"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(schedule)}
                    className="rounded-lg p-2.5 text-blue-600 transition-colors hover:bg-white hover:shadow-sm"
                    title="编辑"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(schedule)}
                    className="rounded-lg p-2.5 text-red-600 transition-colors hover:bg-white hover:shadow-sm"
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
