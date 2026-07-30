export const DATE_RANGES = [
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'all', label: '全部' },
]

export const ALL_RANGE_OPTIONS = [
  { key: '3m', label: '三个月' },
  { key: '6m', label: '六个月' },
  { key: 'custom', label: '自定义' },
]

export const SCHEDULE_VIEWS = [
  { key: 'upcoming', label: '即将上课' },
  { key: 'history', label: '历史记录' },
]

export const HISTORY_RANGE_OPTIONS = [
  { key: 'week', label: '最近一周' },
  { key: 'month', label: '最近一月' },
  { key: '3m', label: '最近三月' },
  { key: 'custom', label: '自定义' },
]

export function getMonthsRange(months) {
  const from = new Date()
  const to = new Date()
  to.setMonth(to.getMonth() + months)
  return [from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)]
}

export function getPastRange(days) {
  const end = new Date()
  const to = end.toISOString().slice(0, 10)
  const start = new Date(end)
  start.setDate(start.getDate() - days + 1)
  const from = start.toISOString().slice(0, 10)
  return [from, to]
}

export function getWeekBounds() {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  const mon = new Date(now)
  mon.setDate(diff)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return [mon.toISOString().slice(0, 10), sun.toISOString().slice(0, 10)]
}

export function getMonthBounds() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return [`${y}-${m}-01`, `${y}-${m}-${new Date(y, now.getMonth() + 1, 0).getDate()}`]
}

export const todayStr = () => new Date().toISOString().slice(0, 10)

export const tomorrowStr = () => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}
