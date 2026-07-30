import { todayStr } from './dateRanges'

export const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
export const WEEKDAY_KEYS = [0, 1, 2, 3, 4, 5, 6]
export const WEEKDAY_LABELS_CN = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

export function formatWeekday(dateStr) {
  if (!dateStr) return ''
  const d = new Date(`${dateStr}T12:00:00`)
  return WEEKDAY_LABELS[d.getDay()]
}

export function timeToMinutes(t) {
  const [h, m] = (t || '0:0').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function formatDuration(start, end) {
  const mins = timeToMinutes(end) - timeToMinutes(start)
  if (mins <= 0) return '--'
  if (mins >= 60 && mins % 60 === 0) return `${mins / 60}h`
  if (mins >= 60) return `${Math.floor(mins / 60)}h${mins % 60}min`
  return `${mins}min`
}

export function timeRangesOverlap(start1, end1, start2, end2) {
  const s1 = timeToMinutes(start1)
  const e1 = timeToMinutes(end1)
  const s2 = timeToMinutes(start2)
  const e2 = timeToMinutes(end2)
  return s1 < e2 && e1 > s2
}

export function sortSchedules(list, order = 'timeAsc') {
  return [...list].sort((a, b) => {
    if (a.schedule_date !== b.schedule_date) {
      return order === 'timeDesc'
        ? (b.schedule_date < a.schedule_date ? -1 : 1)
        : (a.schedule_date < b.schedule_date ? -1 : 1)
    }
    const ta = timeToMinutes(a.start_time)
    const tb = timeToMinutes(b.start_time)
    return order === 'timeDesc' ? tb - ta : ta - tb
  })
}

export function buildConflictMap(schedules) {
  const map = new Map()
  for (let i = 0; i < schedules.length; i += 1) {
    const a = schedules[i]
    const conflicts = []
    for (let j = 0; j < schedules.length; j += 1) {
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

export function getNextHour() {
  const d = new Date()
  d.setHours(d.getHours() + 1, 0, 0, 0)
  return `${String(d.getHours()).padStart(2, '0')}:00`
}

export function getDefaultEndTime() {
  const d = new Date()
  d.setHours(d.getHours() + 2, 0, 0, 0)
  return `${String(d.getHours()).padStart(2, '0')}:00`
}

export function getCurrentTimeStr() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function isScheduleStillUpcoming(schedule) {
  const today = todayStr()
  const now = getCurrentTimeStr()
  if (schedule.schedule_date > today) return true
  if (schedule.schedule_date < today) return false
  const endTime = (schedule.end_time || '').slice(0, 5)
  return timeToMinutes(endTime) > timeToMinutes(now)
}

export function isScheduleEnded(schedule) {
  const today = todayStr()
  const now = getCurrentTimeStr()
  if (schedule.schedule_date < today) return true
  if (schedule.schedule_date > today) return false
  const endTime = (schedule.end_time || '').slice(0, 5)
  return timeToMinutes(endTime) <= timeToMinutes(now)
}
