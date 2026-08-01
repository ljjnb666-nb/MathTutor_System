import {
  AlertTriangle,
  CalendarDays,
  Clock,
  Copy,
  Edit,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'

import { useStudent } from '../contexts/StudentContext'
import ScheduleFormModal from '../features/schedule/components/ScheduleFormModal'
import { useSchedulePageState } from '../features/schedule/hooks/useSchedulePageState'
import { getMonthBounds, getWeekBounds, todayStr } from '../features/schedule/utils/dateRanges'
import { buildConflictMap, formatDuration, formatWeekday, sortSchedules, timeToMinutes } from '../features/schedule/utils/scheduleMath'
import {
  EmptyState,
  LoadingState,
  PageHeader,
  PageShell,
  SectionCard,
  StatusBadge,
  Toolbar,
} from '../components/UiV2'

const DAY_MS = 24 * 60 * 60 * 1000
const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const TIME_MARKS = ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00', '18:00']
const START_MINUTES = 8 * 60
const END_MINUTES = 19 * 60
const SUBJECT_TONES = ['violet', 'emerald', 'blue', 'amber']
const SCHEDULE_TONE_STYLES = {
  violet: {
    backgroundImage: 'linear-gradient(135deg, rgba(124,58,237,.96), rgba(67,56,202,.88))',
    borderColor: 'rgba(196,181,253,.44)',
  },
  emerald: {
    backgroundImage: 'linear-gradient(135deg, rgba(5,150,105,.96), rgba(6,95,70,.88))',
    borderColor: 'rgba(110,231,183,.42)',
  },
  blue: {
    backgroundImage: 'linear-gradient(135deg, rgba(37,99,235,.96), rgba(30,64,175,.88))',
    borderColor: 'rgba(147,197,253,.42)',
  },
  amber: {
    backgroundImage: 'linear-gradient(135deg, rgba(180,83,9,.96), rgba(146,64,14,.88))',
    borderColor: 'rgba(251,191,36,.42)',
  },
}

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T12:00:00`)
  date.setTime(date.getTime() + days * DAY_MS)
  return date.toISOString().slice(0, 10)
}

function makeWeekDays() {
  const [weekStart] = getWeekBounds()
  return DAY_LABELS.map((label, index) => {
    const date = addDays(weekStart, index)
    return {
      date,
      day: date.slice(8, 10),
      label,
      monthDay: date.slice(5),
    }
  })
}

function makeMonthDays(activeDates) {
  const [monthStart, monthEnd] = getMonthBounds()
  const start = Number(monthStart.slice(8, 10))
  const end = Number(monthEnd.slice(8, 10))
  return Array.from({ length: end - start + 1 }, (_, index) => {
    const day = start + index
    const date = `${monthStart.slice(0, 8)}${String(day).padStart(2, '0')}`
    return { day, date, active: activeDates.has(date), today: date === todayStr() }
  })
}

function formatRangeLabel() {
  const [from, to] = getWeekBounds()
  return `${from.slice(5).replace('-', '/')} - ${to.slice(5).replace('-', '/')}`
}

function getSubjectTone(schedule) {
  const source = `${schedule.subject ?? schedule.student_name ?? schedule.id ?? ''}`
  const hash = Array.from(source).reduce((total, char) => total + char.charCodeAt(0), 0)
  return SUBJECT_TONES[hash % SUBJECT_TONES.length]
}

function groupByDate(schedules) {
  return schedules.reduce((acc, schedule) => {
    const key = schedule.schedule_date
    if (!acc[key]) acc[key] = []
    acc[key].push(schedule)
    return acc
  }, {})
}

function rangeLabel(dateRange, allRangeSub) {
  if (dateRange === 'week') return '本周'
  if (dateRange === 'month') return '本月'
  if (allRangeSub === '6m') return '未来六个月'
  if (allRangeSub === 'custom') return '自定义'
  return '未来三个月'
}

function viewLabel(scheduleView) {
  return scheduleView === 'history' ? '历史记录' : '即将上课'
}

function ScheduleBlock({ schedule, conflict, onCopy, onDelete, onEdit }) {
  const start = timeToMinutes(schedule.start_time)
  const end = timeToMinutes(schedule.end_time)
  const top = Math.max(0, ((start - START_MINUTES) / (END_MINUTES - START_MINUTES)) * 100)
  const height = Math.max(9, ((end - start) / (END_MINUTES - START_MINUTES)) * 100)
  const tone = getSubjectTone(schedule)

  return (
    <article
      className={`v2-schedule-block ${conflict ? 'v2-schedule-conflict' : ''}`}
      style={{ top: `${top}%`, height: `${height}%`, ...SCHEDULE_TONE_STYLES[tone] }}
    >
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h3>{schedule.subject || '未命名课程'}</h3>
          {conflict && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
        </div>
        <p>{schedule.student_name ?? `学生 #${schedule.student_id}`}</p>
        <p>{schedule.start_time?.slice(0, 5)} - {schedule.end_time?.slice(0, 5)}</p>
        {schedule.note && <p className="truncate opacity-80">{schedule.note}</p>}
      </div>
      <div className="v2-schedule-actions">
        <button type="button" title="复制排课" onClick={() => onCopy(schedule)}>
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button type="button" title="编辑排课" onClick={() => onEdit(schedule)}>
          <Edit className="h-3.5 w-3.5" />
        </button>
        <button type="button" title="删除排课" onClick={() => onDelete(schedule)}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </article>
  )
}

function WeekCalendar({ conflictMap, loading, onCopy, onDelete, onEdit, schedules }) {
  const weekDays = makeWeekDays()
  const byDate = groupByDate(schedules)
  const hasWeekSchedules = weekDays.some((day) => byDate[day.date]?.length)

  if (loading) return <LoadingState title="正在加载排课" description="正在读取教师日程。" />

  return (
    <div className="overflow-x-auto">
      <div className="v2-schedule-calendar">
        <div className="v2-schedule-head v2-schedule-time-head">时间</div>
        {weekDays.map((day) => (
          <div key={day.date} className={`v2-schedule-head ${day.date === todayStr() ? 'v2-schedule-today' : ''}`}>
            <span>{day.label}</span>
            <strong>{day.monthDay}</strong>
          </div>
        ))}
        <div className="v2-schedule-time-axis">
          {TIME_MARKS.map((mark) => <span key={mark}>{mark}</span>)}
        </div>
        {weekDays.map((day) => (
          <div key={day.date} className="v2-schedule-day-column">
            {(byDate[day.date] || []).map((schedule) => (
              <ScheduleBlock
                key={schedule.id}
                conflict={(conflictMap.get(schedule.id) || []).length > 0}
                onCopy={onCopy}
                onDelete={onDelete}
                onEdit={onEdit}
                schedule={schedule}
              />
            ))}
          </div>
        ))}
        {!hasWeekSchedules && (
          <div className="v2-schedule-calendar-empty">
            <EmptyState icon={CalendarDays} title="本周暂无排课" description="当前筛选条件下，本周日历画布没有课程。" />
          </div>
        )}
      </div>
    </div>
  )
}

function TodayPanel({ schedules }) {
  const today = todayStr()
  const list = schedules.filter((schedule) => schedule.schedule_date === today).slice(0, 5)

  return (
    <SectionCard title="今日课程" description={`${today} ${formatWeekday(today)}`}>
      {list.length ? (
        <div className="space-y-3">
          {list.map((schedule) => (
            <div key={schedule.id} className="v2-schedule-side-row">
              <span className={`v2-schedule-dot v2-schedule-dot-${getSubjectTone(schedule)}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{schedule.subject || '未命名课程'}</p>
                <p>{schedule.start_time?.slice(0, 5)} - {schedule.end_time?.slice(0, 5)} · {schedule.student_name ?? `学生 #${schedule.student_id}`}</p>
              </div>
              <StatusBadge tone="info">{formatDuration(schedule.start_time, schedule.end_time)}</StatusBadge>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={Clock} title="今日暂无课程" description="没有真实排课数据时不显示示例课程。" />
      )}
    </SectionCard>
  )
}

function ConflictPanel({ conflictMap, schedules }) {
  const conflicts = schedules.filter((schedule) => (conflictMap.get(schedule.id) || []).length > 0)

  return (
    <SectionCard
      title="排课冲突提醒"
      actions={conflicts.length ? <StatusBadge tone="danger">{conflicts.length}</StatusBadge> : <StatusBadge tone="success">0</StatusBadge>}
    >
      {conflicts.length ? (
        <div className="space-y-3">
          {conflicts.slice(0, 4).map((schedule) => (
            <div key={schedule.id} className="v2-schedule-conflict-row">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
              <div className="min-w-0">
                <p className="truncate font-bold">{schedule.subject || '未命名课程'}</p>
                <p>{schedule.schedule_date} {schedule.start_time?.slice(0, 5)} - {schedule.end_time?.slice(0, 5)}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={AlertTriangle} title="暂无冲突" description="按当前筛选范围检测，没有发现重叠时段。" />
      )}
    </SectionCard>
  )
}

function MonthOverview({ schedules }) {
  const activeDates = new Set(schedules.map((schedule) => schedule.schedule_date))
  const monthDays = makeMonthDays(activeDates)
  const totalMinutes = schedules.reduce((sum, schedule) => {
    const minutes = timeToMinutes(schedule.end_time) - timeToMinutes(schedule.start_time)
    return sum + Math.max(minutes, 0)
  }, 0)
  const recurring = schedules.filter((schedule) => schedule.is_recurring).length
  const studentCount = new Set(schedules.map((schedule) => schedule.student_id)).size

  return (
    <SectionCard title="本月排课概览" description="基于当前接口返回的真实排课统计。">
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-[var(--color-text-secondary)]">
        {['一', '二', '三', '四', '五', '六', '日'].map((label) => <span key={label}>{label}</span>)}
        {monthDays.map((day) => (
          <span key={day.date} className={`v2-schedule-month-day ${day.active ? 'active' : ''} ${day.today ? 'today' : ''}`}>
            {day.day}
          </span>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="v2-mini-stat">
          <span>课时</span>
          <strong>{Math.round(totalMinutes / 60)}h</strong>
        </div>
        <div className="v2-mini-stat">
          <span>重复</span>
          <strong>{recurring}</strong>
        </div>
        <div className="v2-mini-stat">
          <span>学生</span>
          <strong>{studentCount}</strong>
        </div>
      </div>
    </SectionCard>
  )
}

export default function SchedulePage() {
  const { currentStudent } = useStudent()
  const { actions, derived, state } = useSchedulePageState(currentStudent?.id ?? null)

  const calendarSchedules = sortSchedules(state.dateRange === 'week' ? state.schedules : derived.filteredSchedules, state.sortOrder)
  const calendarConflictMap = buildConflictMap(calendarSchedules)

  return (
    <PageShell>
      <PageHeader
        title="排课"
        description="以周历画布查看课程安排，冲突和今日课程从真实排课数据推导。"
        icon={CalendarDays}
        meta={<StatusBadge tone="neutral">{viewLabel(state.scheduleView)} · {rangeLabel(state.dateRange, state.allRangeSub)}</StatusBadge>}
        actions={(
          <>
            <button type="button" className="v2-button v2-button-secondary" onClick={actions.refreshSchedules}>
              <RefreshCw className="h-4 w-4" />
              刷新
            </button>
            <button type="button" className="v2-button v2-button-primary" onClick={actions.openAdd}>
              <Plus className="h-4 w-4" />
              添加排课
            </button>
          </>
        )}
      />

      <Toolbar>
        <div className="flex flex-wrap gap-2">
          {[
            ['upcoming', '即将上课'],
            ['history', '历史记录'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={state.scheduleView === key ? 'v2-btn-primary' : 'v2-btn-secondary'}
              onClick={() => actions.setScheduleView(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="v2-control">
          <span>范围</span>
          <select value={state.dateRange} onChange={(event) => actions.setDateRange(event.target.value)}>
            <option value="week">本周</option>
            <option value="month">本月</option>
            <option value="all">全部</option>
          </select>
        </label>
        {state.dateRange === 'all' && (
          <label className="v2-control">
            <span>跨度</span>
            <select value={state.allRangeSub} onChange={(event) => actions.setAllRangeSub(event.target.value)}>
              <option value="3m">三个月</option>
              <option value="6m">六个月</option>
              <option value="custom">自定义</option>
            </select>
          </label>
        )}
        <label className="v2-control">
          <span>学生</span>
          <select
            value={state.filterStudentId ?? ''}
            onChange={(event) => actions.setFilterStudentId(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">全部学生</option>
            {state.students.map((student) => (
              <option key={student.id} value={student.id}>{student.name}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="v2-btn-secondary"
          onClick={() => actions.setSortOrder((value) => (value === 'timeAsc' ? 'timeDesc' : 'timeAsc'))}
        >
          {state.sortOrder === 'timeAsc' ? '时间正序' : '时间倒序'}
        </button>
      </Toolbar>

      <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <SectionCard
          title="周课程表"
          description={`当前周：${formatRangeLabel()}。日历仅展示本周课程，更多记录保留在筛选统计与侧栏中。`}
          actions={<StatusBadge tone="neutral">{calendarSchedules.length} 条</StatusBadge>}
          className="min-w-0"
        >
          <WeekCalendar
            conflictMap={calendarConflictMap}
            loading={state.loading}
            onCopy={actions.openCopy}
            onDelete={actions.handleDelete}
            onEdit={actions.openEdit}
            schedules={calendarSchedules}
          />
        </SectionCard>

        <aside className="space-y-4">
          <TodayPanel schedules={calendarSchedules} />
          <ConflictPanel conflictMap={calendarConflictMap} schedules={calendarSchedules} />
          <MonthOverview schedules={calendarSchedules} />
        </aside>
      </div>

      <ScheduleFormModal
        editingSchedule={state.editingSchedule}
        form={state.form}
        formStudentDropdownOpen={state.formStudentDropdownOpen}
        modalOpen={state.modalOpen}
        onClose={actions.closeModal}
        onSetForm={actions.setForm}
        onSetFormStudentDropdownOpen={actions.setFormStudentDropdownOpen}
        onSubmit={actions.handleSubmit}
        saving={state.saving}
        selectedStudent={derived.selectedStudent}
        students={state.students}
      />
    </PageShell>
  )
}
