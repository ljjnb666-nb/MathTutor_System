import { useEffect, useState, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  Calendar,
  Plus,
  Edit,
  Trash2,
  Loader2,
  X,
  ChevronDown,
  User,
  Copy,
  Users,
  AlertTriangle,
  ArrowUpDown,
  Repeat,
  History,
  CalendarClock,
} from 'lucide-react'
import { getSchedules, createSchedule, updateSchedule, deleteSchedule } from '../services/api'
import { getStudents } from '../services/api'
import { useStudent } from '../contexts/StudentContext'
import toast from 'react-hot-toast'

const DATE_RANGES = [
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'all', label: '全部' },
]

/** 选择「全部」时的子选项 */
const ALL_RANGE_OPTIONS = [
  { key: '3m', label: '三个月' },
  { key: '6m', label: '六个月' },
  { key: 'custom', label: '自定义时间' },
]

/** 视图切换：即将上课 / 历史记录 */
const SCHEDULE_VIEWS = [
  { key: 'upcoming', label: '即将上课' },
  { key: 'history', label: '历史记录' },
]

/** 历史记录的时间范围选项（均为过去，结束日=昨天） */
const HISTORY_RANGE_OPTIONS = [
  { key: 'week', label: '最近一周' },
  { key: 'month', label: '最近一月' },
  { key: '3m', label: '最近三月' },
  { key: 'custom', label: '自定义时间' },
]

function getMonthsRange(months) {
  const from = new Date()
  const to = new Date()
  to.setMonth(to.getMonth() + months)
  return [from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)]
}

/** 昨天日期 YYYY-MM-DD */
function getYesterdayStr() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** 历史记录：过去 N 天的起止（结束日=今天，以便今日已结束的课能出现在历史中） */
function getPastRange(days) {
  const end = new Date()
  const to = end.toISOString().slice(0, 10)
  const start = new Date(end)
  start.setDate(start.getDate() - days + 1)
  const from = start.toISOString().slice(0, 10)
  return [from, to]
}

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
/** 与后端一致：0=周一 1=周二 … 6=周日（Python weekday） */
const WEEKDAY_KEYS = [0, 1, 2, 3, 4, 5, 6]
const WEEKDAY_LABELS_CN = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function getWeekBounds() {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  const mon = new Date(now)
  mon.setDate(diff)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return [
    mon.toISOString().slice(0, 10),
    sun.toISOString().slice(0, 10),
  ]
}

function getMonthBounds() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return [`${y}-${m}-01`, `${y}-${m}-${new Date(y, now.getMonth() + 1, 0).getDate()}`]
}

function formatWeekday(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00')
  return WEEKDAY_LABELS[d.getDay()]
}

/** 时间字符串转分钟数（用于比较与冲突检测） */
function timeToMinutes(t) {
  const [h, m] = (t || '0:0').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** 计算时长（分钟），返回如 "1h" / "45min" */
function formatDuration(start, end) {
  const mins = timeToMinutes(end) - timeToMinutes(start)
  if (mins <= 0) return '—'
  if (mins >= 60 && mins % 60 === 0) return `${mins / 60}h`
  if (mins >= 60) return `${Math.floor(mins / 60)}h${mins % 60}min`
  return `${mins}min`
}

/** 两时段是否重叠（同一天内） */
function timeRangesOverlap(start1, end1, start2, end2) {
  const s1 = timeToMinutes(start1)
  const e1 = timeToMinutes(end1)
  const s2 = timeToMinutes(start2)
  const e2 = timeToMinutes(end2)
  return s1 < e2 && e1 > s2
}

/** 按日期、开始时间排序（支持升序/降序） */
function sortSchedules(list, order = 'timeAsc') {
  return [...list].sort((a, b) => {
    if (a.schedule_date !== b.schedule_date) {
      return order === 'timeDesc' ? (b.schedule_date < a.schedule_date ? -1 : 1) : (a.schedule_date < b.schedule_date ? -1 : 1)
    }
    const ta = timeToMinutes(a.start_time)
    const tb = timeToMinutes(b.start_time)
    return order === 'timeDesc' ? tb - ta : ta - tb
  })
}

/** 计算冲突：同一日期、时段重叠即冲突（含不同学生，因同一时间只能上一节课）。返回 Map(scheduleId -> [与之冲突的其他 schedule 的 id 列表]) */
function buildConflictMap(schedules) {
  const map = new Map()
  for (let i = 0; i < schedules.length; i++) {
    const a = schedules[i]
    const conflicts = []
    for (let j = 0; j < schedules.length; j++) {
      if (i === j) continue
      const b = schedules[j]
      if (a.schedule_date !== b.schedule_date) continue
      if (timeRangesOverlap(a.start_time, a.end_time, b.start_time, b.end_time)) {
        conflicts.push(b.id)
      }
    }
    if (conflicts.length > 0) map.set(a.id, conflicts)
  }
  return map
}

/** 下一整点，如 14:30 → 15:00 */
function getNextHour() {
  const d = new Date()
  d.setHours(d.getHours() + 1, 0, 0, 0)
  return `${String(d.getHours()).padStart(2, '0')}:00`
}

/** 下一整点 + 1 小时，用作默认结束时间 */
function getDefaultEndTime() {
  const d = new Date()
  d.setHours(d.getHours() + 2, 0, 0, 0)
  return `${String(d.getHours()).padStart(2, '0')}:00`
}

const todayStr = () => new Date().toISOString().slice(0, 10)
const tomorrowStr = () => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** 当前时间 HH:MM（24 小时，补零），用于判断是否已过上课结束时间 */
function getCurrentTimeStr() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 判断排课是否仍属「即将上课」（未结束）：日期在未来，或日期为今天且结束时间晚于当前时间 */
function isScheduleStillUpcoming(schedule) {
  const today = todayStr()
  const now = getCurrentTimeStr()
  if (schedule.schedule_date > today) return true
  if (schedule.schedule_date < today) return false
  const endTime = (schedule.end_time || '').slice(0, 5)
  return timeToMinutes(endTime) > timeToMinutes(now)
}

/** 判断排课是否已结束（用于历史记录：只显示已上过的课） */
function isScheduleEnded(schedule) {
  const today = todayStr()
  const now = getCurrentTimeStr()
  if (schedule.schedule_date < today) return true
  if (schedule.schedule_date > today) return false
  const endTime = (schedule.end_time || '').slice(0, 5)
  return timeToMinutes(endTime) <= timeToMinutes(now)
}

export default function SchedulePage() {
  const { currentStudent } = useStudent()
  const [loading, setLoading] = useState(true)
  const [schedules, setSchedules] = useState([])
  const [students, setStudents] = useState([])
  const [scheduleView, setScheduleView] = useState('upcoming') // 'upcoming' | 'history'
  const [dateRange, setDateRange] = useState('week')
  const [allRangeSub, setAllRangeSub] = useState('3m') // 全部时的子选项：3m | 6m | custom
  const [customFrom, setCustomFrom] = useState(() => new Date().toISOString().slice(0, 10))
  const [customTo, setCustomTo] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 3)
    return d.toISOString().slice(0, 10)
  })
  const [historyRangeSub, setHistoryRangeSub] = useState('month') // 历史记录子选项
  const [historyCustomFrom, setHistoryCustomFrom] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().slice(0, 10)
  })
  const [historyCustomTo, setHistoryCustomTo] = useState(() => todayStr())
  const [filterStudentId, setFilterStudentId] = useState(null)
  const [studentDropdownOpen, setStudentDropdownOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formStudentDropdownOpen, setFormStudentDropdownOpen] = useState(false)
  const [sortOrder, setSortOrder] = useState('timeAsc') // 'timeAsc' | 'timeDesc'
  const [form, setForm] = useState({
    student_id: null,
    schedule_date: '',
    start_time: '14:00',
    end_time: '15:00',
    subject: '',
    note: '',
    recurrence_weekdays: [], // [0,1,2,...] 周一=0 周日=6，与后端一致；空为单次
  })

  const params = useMemo(() => {
    const p = {}
    if (filterStudentId != null) p.student_id = filterStudentId
    if (scheduleView === 'history') {
      // 历史记录：起止含今天，便于今日已结束的课出现在历史中；前端再过滤为仅显示已结束的
      if (historyRangeSub === 'week') {
        const [from, to] = getPastRange(7)
        p.from_date = from
        p.to_date = to
      } else if (historyRangeSub === 'month') {
        const [from, to] = getPastRange(30)
        p.from_date = from
        p.to_date = to
      } else if (historyRangeSub === '3m') {
        const [from, to] = getPastRange(90)
        p.from_date = from
        p.to_date = to
      } else {
        const from = historyCustomFrom <= historyCustomTo ? historyCustomFrom : historyCustomTo
        let to = historyCustomFrom <= historyCustomTo ? historyCustomTo : historyCustomFrom
        if (to > todayStr()) to = todayStr()
        p.from_date = from
        p.to_date = to
      }
      return p
    }
    // 即将上课
    if (dateRange === 'week') {
      const [from, to] = getWeekBounds()
      p.from_date = from
      p.to_date = to
    } else if (dateRange === 'month') {
      const [from, to] = getMonthBounds()
      p.from_date = from
      p.to_date = to
    } else {
      if (allRangeSub === '3m') {
        const [from, to] = getMonthsRange(3)
        p.from_date = from
        p.to_date = to
      } else if (allRangeSub === '6m') {
        const [from, to] = getMonthsRange(6)
        p.from_date = from
        p.to_date = to
      } else {
        if (customFrom <= customTo) {
          p.from_date = customFrom
          p.to_date = customTo
        } else {
          p.from_date = customTo
          p.to_date = customFrom
        }
      }
    }
    return p
  }, [scheduleView, dateRange, allRangeSub, customFrom, customTo, historyRangeSub, historyCustomFrom, historyCustomTo, filterStudentId])

  const fetchSchedules = async () => {
    setLoading(true)
    try {
      const data = await getSchedules(params)
      setSchedules(Array.isArray(data) ? data : [])
    } catch (e) {
      toast.error('加载排课失败：' + (e.response?.data?.detail ?? e.message))
      setSchedules([])
    } finally {
      setLoading(false)
    }
  }

  const fetchStudents = async () => {
    try {
      const res = await getStudents()
      setStudents(Array.isArray(res?.data) ? res.data : [])
    } catch {
      setStudents([])
    }
  }

  useEffect(() => {
    fetchStudents()
  }, [])

  useEffect(() => {
    fetchSchedules()
  }, [params])

  useEffect(() => {
    if (scheduleView === 'history') setSortOrder('timeDesc')
  }, [scheduleView])

  const openAdd = useCallback(() => {
    if (students.length === 0) {
      toast.error('请先在「学生管理」中添加学生后再排课')
      return
    }
    const today = todayStr()
    const start = getNextHour()
    const end = getDefaultEndTime()
    const defaultStudentId = currentStudent?.id ?? students[0]?.id ?? null
    setEditingSchedule(null)
    setForm({
      student_id: defaultStudentId,
      schedule_date: today,
      start_time: start,
      end_time: end,
      subject: '',
      note: '',
      recurrence_weekdays: [],
    })
    setModalOpen(true)
    setFormStudentDropdownOpen(false)
  }, [students, currentStudent?.id])

  const openCopy = useCallback((s) => {
    setEditingSchedule(null)
    setForm({
      student_id: s.student_id,
      schedule_date: s.schedule_date,
      start_time: s.start_time?.slice(0, 5) || '14:00',
      end_time: s.end_time?.slice(0, 5) || '15:00',
      subject: s.subject ?? '',
      note: s.note ?? '',
      recurrence_weekdays: Array.isArray(s.recurrence_weekdays) ? [...s.recurrence_weekdays] : [],
    })
    setModalOpen(true)
    setFormStudentDropdownOpen(false)
  }, [])

  const openEdit = (s) => {
    setEditingSchedule(s)
    setForm({
      student_id: s.student_id,
      schedule_date: s.schedule_date,
      start_time: s.start_time?.slice(0, 5) || '14:00',
      end_time: s.end_time?.slice(0, 5) || '15:00',
      subject: s.subject ?? '',
      note: s.note ?? '',
      recurrence_weekdays: Array.isArray(s.recurrence_weekdays) ? [...s.recurrence_weekdays] : [],
    })
    setModalOpen(true)
    setFormStudentDropdownOpen(false)
  }

  const closeModal = useCallback(() => {
    setModalOpen(false)
    setEditingSchedule(null)
  }, [])

  useEffect(() => {
    if (!modalOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') closeModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalOpen, closeModal])

  const checkFormConflict = useCallback(() => {
    const others = schedules.filter(
      (s) =>
        s.schedule_date === form.schedule_date &&
        (editingSchedule ? s.id !== editingSchedule.id : true)
    )
    return others.some((s) =>
      timeRangesOverlap(form.start_time, form.end_time, s.start_time, s.end_time)
    )
  }, [schedules, form, editingSchedule])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.student_id == null) {
      toast.error('请选择学生')
      return
    }
    if (!form.schedule_date?.trim()) {
      toast.error('请选择日期')
      return
    }
    if (form.start_time && form.end_time && timeToMinutes(form.end_time) <= timeToMinutes(form.start_time)) {
      toast.error('结束时间须晚于开始时间')
      return
    }
    if (checkFormConflict()) {
      const go = window.confirm(
        '该时段与已有排课重叠（同一时间只能上一节课）。是否仍要保存？'
      )
      if (!go) return
    }
    setSaving(true)
    try {
      const body = {
        student_id: form.student_id,
        schedule_date: form.schedule_date,
        start_time: form.start_time,
        end_time: form.end_time,
        subject: form.subject?.trim() || undefined,
        note: form.note?.trim() || undefined,
      }
      if (editingSchedule) {
        body.recurrence_weekdays = form.recurrence_weekdays ?? []
      } else if (form.recurrence_weekdays?.length > 0) {
        body.recurrence_weekdays = form.recurrence_weekdays
      }
      if (editingSchedule) {
        await updateSchedule(editingSchedule.id, body)
        toast.success('已更新')
      } else {
        await createSchedule(body)
        toast.success('已添加')
      }
      closeModal()
      fetchSchedules()
    } catch (e) {
      toast.error((e.response?.data?.detail ?? e.message) || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (s) => {
    const msg = s.is_recurring
      ? '此为每周重复排课，删除将取消所有重复日期。确定删除吗？'
      : '确定删除这条排课吗？'
    if (!window.confirm(msg)) return
    try {
      await deleteSchedule(s.id)
      toast.success('已删除')
      fetchSchedules()
    } catch (e) {
      toast.error('删除失败：' + (e.response?.data?.detail ?? e.message))
    }
  }

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === form.student_id),
    [students, form.student_id]
  )

  const filterStudent = useMemo(
    () => (filterStudentId != null ? students.find((s) => s.id === filterStudentId) : null),
    [students, filterStudentId]
  )

  /** 即将上课：只显示未结束的；历史记录：只显示已结束的（含今日已过结束时间的课） */
  const filteredSchedules = useMemo(() => {
    if (scheduleView === 'upcoming') return schedules.filter(isScheduleStillUpcoming)
    if (scheduleView === 'history') return schedules.filter(isScheduleEnded)
    return schedules
  }, [schedules, scheduleView])

  const sortedSchedules = useMemo(
    () => sortSchedules(filteredSchedules, sortOrder),
    [filteredSchedules, sortOrder]
  )

  const conflictMap = useMemo(() => buildConflictMap(filteredSchedules), [filteredSchedules])

  return (
    <div className="min-h-full flex flex-col bg-gray-50">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-gray-900">排课管理</h1>
              <p className="text-xs text-gray-500 mt-0.5">安排上课日期与时段</p>
            </div>
          </div>
          <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-sm font-medium text-blue-700">
            共 {filteredSchedules.length} 条
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* 视图切换：即将上课 / 历史记录 */}
          <div className="inline-flex rounded-xl border border-gray-200 bg-gray-100/80 p-1">
            {SCHEDULE_VIEWS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setScheduleView(key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
                  scheduleView === key
                    ? 'bg-white text-blue-600 shadow-sm ring-1 ring-gray-200/80'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
                }`}
              >
                {key === 'upcoming' ? <CalendarClock className="h-4 w-4" /> : <History className="h-4 w-4" />}
                {label}
              </button>
            ))}
          </div>
          {/* 即将上课：本周 / 本月 / 全部 */}
          {scheduleView === 'upcoming' && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border border-gray-200 bg-gray-100/80 p-1">
                {DATE_RANGES.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDateRange(key)}
                    className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
                      dateRange === key
                        ? 'bg-white text-blue-600 shadow-sm ring-1 ring-gray-200/80'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {dateRange === 'all' && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-xl border border-gray-200 bg-gray-100/80 p-1">
                    {ALL_RANGE_OPTIONS.map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setAllRangeSub(key)}
                        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                          allRangeSub === key
                            ? 'bg-white text-indigo-600 shadow-sm'
                            : 'text-gray-600 hover:bg-white/60'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {allRangeSub === 'custom' && (
                    <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-1.5">
                      <input
                        type="date"
                        value={customFrom}
                        onChange={(e) => setCustomFrom(e.target.value)}
                        className="h-9 rounded-lg border-0 bg-transparent text-sm text-gray-800 focus:ring-0"
                      />
                      <span className="text-gray-400">至</span>
                      <input
                        type="date"
                        value={customTo}
                        onChange={(e) => setCustomTo(e.target.value)}
                        className="h-9 rounded-lg border-0 bg-transparent text-sm text-gray-800 focus:ring-0"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {/* 历史记录：最近一周 / 一月 / 三月 / 自定义（均为过去，至昨天） */}
          {scheduleView === 'history' && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border border-gray-200 bg-gray-100/80 p-1">
                {HISTORY_RANGE_OPTIONS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setHistoryRangeSub(key)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                      historyRangeSub === key
                        ? 'bg-white text-amber-600 shadow-sm'
                        : 'text-gray-600 hover:bg-white/60'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {historyRangeSub === 'custom' && (
                <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-1.5">
                  <input
                    type="date"
                    value={historyCustomFrom}
                    onChange={(e) => setHistoryCustomFrom(e.target.value)}
                    className="h-9 rounded-lg border-0 bg-transparent text-sm text-gray-800 focus:ring-0"
                  />
                  <span className="text-gray-400">至</span>
                  <input
                    type="date"
                    value={historyCustomTo}
                    onChange={(e) => setHistoryCustomTo(e.target.value)}
                    max={todayStr()}
                    className="h-9 rounded-lg border-0 bg-transparent text-sm text-gray-800 focus:ring-0"
                  />
                </div>
              )}
            </div>
          )}
          {/* 学生筛选：自定义下拉 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setStudentDropdownOpen((v) => !v)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white pl-3 pr-2.5 text-sm text-gray-700 shadow-sm transition-colors hover:border-blue-200 hover:bg-gray-50"
            >
              <User className="h-4 w-4 text-gray-400" />
              <span className="min-w-[4rem] text-left">{filterStudent ? filterStudent.name : '全部学生'}</span>
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </button>
            {studentDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  aria-hidden
                  onClick={() => setStudentDropdownOpen(false)}
                />
                <div className="absolute right-0 top-full z-20 mt-2 max-h-56 w-44 overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-xl ring-1 ring-black/5">
                  <button
                    type="button"
                    onClick={() => {
                      setFilterStudentId(null)
                      setStudentDropdownOpen(false)
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                      filterStudentId == null ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    全部学生
                  </button>
                  {students.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setFilterStudentId(s.id)
                        setStudentDropdownOpen(false)
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                        filterStudentId === s.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={openAdd}
            disabled={students.length === 0}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-blue-700 hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
            title={students.length === 0 ? '请先在学生管理中添加学生' : undefined}
          >
            <Plus className="h-4 w-4" />
            添加排课
          </button>
        </div>
      </div>

      <div className="flex-1 px-4 py-6">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <div className="rounded-full bg-blue-50 p-4">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
            <p className="mt-4 text-sm font-medium text-gray-600">加载排课中…</p>
            <p className="mt-1 text-xs text-gray-400">请稍候</p>
          </div>
        )}

        {!loading && filteredSchedules.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200/80 bg-white py-20 shadow-sm">
            {scheduleView === 'upcoming' && schedules.length > 0 ? (
              <>
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-50">
                  <History className="h-10 w-10 text-amber-500" />
                </div>
                <p className="mt-5 text-base font-semibold text-gray-700">当前没有即将开始的排课</p>
                <p className="mt-2 max-w-xs text-center text-sm text-gray-500">
                  今日已过结束时间的排课不会显示在此处，可在「历史记录」中查看
                </p>
              </>
            ) : students.length === 0 ? (
              <>
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
                  <Users className="h-10 w-10 text-gray-400" />
                </div>
                <p className="mt-5 text-base font-semibold text-gray-700">暂无学生</p>
                <p className="mt-2 max-w-xs text-center text-sm text-gray-500">请先在「学生管理」中添加学生，再在此排课</p>
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
                    ? '历史记录显示已过日期的排课，便于查看何时上过课。可切换时间范围或选择「即将上课」查看未来排课。'
                    : filterStudentId != null || dateRange !== 'all'
                      ? '试试调整筛选条件或选择「全部」'
                      : '点击上方「添加排课」安排课程'}
                </p>
              </>
            )}
          </div>
        )}

        {!loading && filteredSchedules.length > 0 && (
          <>
            {scheduleView === 'history' && (
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-2.5 text-sm text-amber-800">
                <History className="h-4 w-4 shrink-0 text-amber-600" />
                <span>以下为已过日期的排课记录，便于查看何时上过课。默认按时间倒序（最近在先）。</span>
              </div>
            )}
            {/* 排序与冲突提示条 */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setSortOrder((o) => (o === 'timeAsc' ? 'timeDesc' : 'timeAsc'))}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-blue-200 hover:bg-gray-50 hover:text-gray-900"
                title={sortOrder === 'timeAsc' ? '当前：按开始时间升序，点击切换为降序' : '当前：按开始时间降序，点击切换为升序'}
              >
                <ArrowUpDown className="h-4 w-4 text-gray-500" />
                {sortOrder === 'timeAsc' ? '按开始时间升序' : '按开始时间降序'}
              </button>
              {conflictMap.size > 0 && (
                <span className="inline-flex items-center gap-2 rounded-xl bg-amber-50 px-3.5 py-2 text-sm font-medium text-amber-800 ring-1 ring-amber-200/80">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                  共 {conflictMap.size} 条时段冲突（同一时间只能排一节课）
                </span>
              )}
            </div>
            {/* 桌面：表格 */}
            <div className="hidden overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm md:block">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100">
                  <thead className="sticky top-0 z-[1] bg-gray-50/95">
                    <tr>
                      <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                        日期
                      </th>
                      <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                        时间 · 时长
                      </th>
                      <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                        学生
                      </th>
                      <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                        主题
                      </th>
                      <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                        备注
                      </th>
                      <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                        状态
                      </th>
                      <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {sortedSchedules.map((s) => {
                      const isToday = s.schedule_date === todayStr()
                      const conflictIds = conflictMap.get(s.id) || []
                      const hasConflict = conflictIds.length > 0
                      const conflictWith = hasConflict
                        ? sortedSchedules.filter((o) => conflictIds.includes(o.id))
                        : []
                      const conflictTip = hasConflict
                        ? `与以下排课时段冲突：${conflictWith.map((o) => `${o.student_name ?? '学生'} ${o.start_time}-${o.end_time}`).join('、')}`
                        : ''
                      return (
                        <tr
                          key={s.id}
                          className={`transition-colors duration-150 ${isToday ? 'bg-blue-50/50' : ''} ${hasConflict ? 'bg-amber-50/60' : ''} hover:bg-gray-50/80`}
                        >
                          <td className={`whitespace-nowrap px-5 py-3.5 text-sm ${isToday ? 'border-l-4 border-l-blue-500' : ''}`}>
                            <span className="font-medium text-gray-900">{s.schedule_date}</span>
                            <span className="ml-2 text-gray-500">{formatWeekday(s.schedule_date)}</span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-3.5 text-sm text-gray-700">
                            <span className="font-medium">{s.start_time} — {s.end_time}</span>
                            <span className="ml-2 text-gray-500">{formatDuration(s.start_time, s.end_time)}</span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-3.5 text-sm font-medium text-gray-800">
                            <span>{s.student_name ?? `学生 #${s.student_id}`}</span>
                            {s.is_recurring && (
                              <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700" title="每周重复">
                                <Repeat className="h-3 w-3" /> 每周
                              </span>
                            )}
                          </td>
                          <td className="max-w-[12rem] truncate px-5 py-3.5 text-sm text-gray-600">
                            {s.subject ?? '—'}
                          </td>
                          <td className="max-w-[12rem] truncate px-5 py-3.5 text-sm text-gray-500">
                            {s.note ?? '—'}
                          </td>
                          <td className="whitespace-nowrap px-5 py-3.5">
                            {hasConflict ? (
                              <span
                                className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800"
                                title={conflictTip}
                              >
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                冲突
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-0.5">
                              <button
                                type="button"
                                onClick={() => openCopy(s)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                                title="复制为新排课"
                              >
                                <Copy className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openEdit(s)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-blue-600 transition-colors hover:bg-blue-50"
                                title="编辑"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(s)}
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
            {/* 移动端：卡片列表 */}
            <div className="space-y-4 md:hidden">
              {sortedSchedules.map((s) => {
                const isToday = s.schedule_date === todayStr()
                const hasConflict = (conflictMap.get(s.id) || []).length > 0
                return (
                  <div
                    key={s.id}
                    className={`rounded-2xl border bg-white p-4 shadow-sm transition-shadow ${isToday ? 'border-l-4 border-l-blue-500 ring-1 ring-blue-100' : ''} ${hasConflict ? 'border-amber-300/80 bg-amber-50/40' : 'border-gray-200'} hover:shadow-md`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-gray-900">
                            {s.schedule_date}
                            <span className="ml-1.5 font-normal text-gray-500">{formatWeekday(s.schedule_date)}</span>
                          </p>
                          {hasConflict && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                              <AlertTriangle className="h-3 w-3" />
                              冲突
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-sm text-gray-600">
                          <span className="font-medium text-gray-800">{s.start_time} — {s.end_time}</span>
                          <span className="text-gray-500"> · {formatDuration(s.start_time, s.end_time)}</span>
                        </p>
                        <p className="mt-1.5 text-sm font-medium text-gray-800">
                          {s.student_name ?? `学生 #${s.student_id}`}
                          {s.is_recurring && (
                            <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-700">
                              <Repeat className="h-3 w-3" /> 每周
                            </span>
                          )}
                        </p>
                        {(s.subject || s.note) && (
                          <p className="mt-1 text-xs text-gray-500 line-clamp-2 max-w-[16rem]">
                            {[s.subject, s.note].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1 rounded-xl bg-gray-50 p-1">
                        <button
                          type="button"
                          onClick={() => openCopy(s)}
                          className="rounded-lg p-2.5 text-gray-500 transition-colors hover:bg-white hover:text-gray-700 hover:shadow-sm"
                          title="复制"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(s)}
                          className="rounded-lg p-2.5 text-blue-600 transition-colors hover:bg-white hover:shadow-sm"
                          title="编辑"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(s)}
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
        )}
      </div>

      {/* Add/Edit Modal：挂载到 body，避免受侧栏布局影响，保证相对视口居中 */}
      {modalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={(e) => e.target === e.currentTarget && closeModal()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="schedule-modal-title"
          >
            <div
              className="schedule-modal-panel w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
            {/* 标题栏：左侧色条 + 标题 + 关闭 */}
            <div className="flex shrink-0 items-center gap-3 border-b border-gray-100 bg-gray-50/50 px-5 py-4">
              <div className="h-9 w-1 rounded-full bg-blue-500" aria-hidden />
              <h2 id="schedule-modal-title" className="flex-1 text-lg font-semibold text-gray-900">
                {editingSchedule ? '编辑排课' : '添加排课'}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-800"
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 overflow-y-auto px-5 py-5">
                <div className="space-y-5">
                  {/* 基本信息分组 */}
                  <div className="space-y-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-gray-400">基本信息</p>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">学生</label>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setFormStudentDropdownOpen((v) => !v)}
                          className="flex h-11 w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 text-sm text-gray-800 shadow-sm transition-colors hover:border-blue-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/25"
                        >
                          <span className={selectedStudent ? 'text-gray-900' : 'text-gray-400'}>
                            {selectedStudent ? selectedStudent.name : '请选择学生'}
                          </span>
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        </button>
                        {formStudentDropdownOpen && (
                          <>
                            <div className="fixed inset-0 z-10" aria-hidden onClick={() => setFormStudentDropdownOpen(false)} />
                            <div className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-52 overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-xl ring-1 ring-black/5">
                              {students.map((s) => (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() => {
                                    setForm((f) => ({ ...f, student_id: s.id }))
                                    setFormStudentDropdownOpen(false)
                                  }}
                                  className={`flex w-full px-4 py-2.5 text-left text-sm transition-colors ${
                                    form.student_id === s.id ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                                  }`}
                                >
                                  {s.name} · {s.grade} {s.class_name}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">日期</label>
                      <div className="flex gap-2">
                        <input
                          type="date"
                          value={form.schedule_date}
                          onChange={(e) => setForm((f) => ({ ...f, schedule_date: e.target.value }))}
                          className="h-11 flex-1 rounded-xl border border-gray-200 px-4 text-sm text-gray-800 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/25"
                          required
                        />
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => setForm((f) => ({ ...f, schedule_date: todayStr() }))}
                            className="h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 active:bg-gray-200"
                          >
                            今天
                          </button>
                          <button
                            type="button"
                            onClick={() => setForm((f) => ({ ...f, schedule_date: tomorrowStr() }))}
                            className="h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 active:bg-gray-200"
                          >
                            明天
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700">开始时间</label>
                        <input
                          type="time"
                          value={form.start_time}
                          onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                          className="h-11 w-full rounded-xl border border-gray-200 px-4 text-sm text-gray-800 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/25"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700">结束时间</label>
                        <input
                          type="time"
                          value={form.end_time}
                          onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                          className="h-11 w-full rounded-xl border border-gray-200 px-4 text-sm text-gray-800 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/25"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 重复分组 */}
                  <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50/50 p-4">
                    <div className="flex items-center gap-2">
                      <Repeat className="h-4 w-4 text-indigo-500" />
                      <label className="text-sm font-medium text-gray-700">每周重复</label>
                    </div>
                    <p className="text-xs text-gray-500">勾选星期几则在该日固定上课；不选为单次排课。</p>
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAY_KEYS.map((wd) => {
                        const selected = (form.recurrence_weekdays || []).includes(wd)
                        return (
                          <button
                            key={wd}
                            type="button"
                            onClick={() => {
                              const cur = form.recurrence_weekdays || []
                              const next = selected ? cur.filter((d) => d !== wd) : [...cur, wd].sort((a, b) => a - b)
                              setForm((f) => ({ ...f, recurrence_weekdays: next }))
                            }}
                            className={`min-w-[2.75rem] rounded-lg border py-2 text-sm font-medium transition-all ${
                              selected
                                ? 'border-indigo-400 bg-indigo-50 text-indigo-700 shadow-sm'
                                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-white'
                            }`}
                          >
                            {WEEKDAY_LABELS_CN[wd]}
                          </button>
                        )
                      })}
                    </div>
                    {(form.recurrence_weekdays || []).length > 0 && (
                      <p className="text-xs font-medium text-indigo-600">
                        已选：{(form.recurrence_weekdays || []).map((d) => WEEKDAY_LABELS_CN[d]).join('、')}
                      </p>
                    )}
                  </div>

                  {/* 可选信息 */}
                  <div className="space-y-4 border-t border-gray-100 pt-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-gray-400">选填</p>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-600">主题</label>
                      <input
                        type="text"
                        value={form.subject}
                        onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                        placeholder="如：二次函数复习"
                        className="h-11 w-full rounded-xl border border-gray-200 px-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/25"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-600">备注</label>
                      <input
                        type="text"
                        value={form.note}
                        onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                        placeholder="补充说明"
                        className="h-11 w-full rounded-xl border border-gray-200 px-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/25"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 底部操作栏：固定 */}
              <div className="shrink-0 border-t border-gray-200 bg-white px-5 py-4">
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow-md disabled:opacity-60"
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {editingSchedule ? '保存' : '添加'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>,
          document.body
        )}
    </div>
  )
}
