import {
  Calendar,
  CalendarClock,
  ChevronDown,
  History,
  Plus,
  User,
} from 'lucide-react'

import {
  ALL_RANGE_OPTIONS,
  DATE_RANGES,
  HISTORY_RANGE_OPTIONS,
  SCHEDULE_VIEWS,
  todayStr,
} from '../utils/dateRanges'

export default function ScheduleToolbar({
  allRangeSub,
  count,
  customFrom,
  customTo,
  dateRange,
  filterStudent,
  filterStudentId,
  historyCustomFrom,
  historyCustomTo,
  historyRangeSub,
  onOpenAdd,
  onSetAllRangeSub,
  onSetCustomFrom,
  onSetCustomTo,
  onSetDateRange,
  onSetFilterStudentId,
  onSetHistoryCustomFrom,
  onSetHistoryCustomTo,
  onSetHistoryRangeSub,
  onSetScheduleView,
  onSetStudentDropdownOpen,
  scheduleView,
  studentDropdownOpen,
  students,
}) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 px-4 py-4 shadow-sm" style={{ borderBottom: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-elevated)' }}>
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 15%, transparent)', color: 'var(--color-primary-600)' }}>
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>排课管理</h1>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>安排上课日期与时段</p>
          </div>
        </div>
        <span className="inline-flex items-center rounded-full px-2.5 py-1 text-sm font-medium" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)', color: 'var(--color-primary-700)' }}>
          共 {count} 条
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl p-1" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'color-mix(in srgb, var(--color-bg-panel) 80%, transparent)' }}>
          {SCHEDULE_VIEWS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => onSetScheduleView(key)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-200"
              style={
                scheduleView === key
                  ? { backgroundColor: 'var(--color-bg-elevated)', color: 'var(--color-primary-600)', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)', border: '1px solid color-mix(in srgb, var(--color-border-primary) 80%, transparent)' }
                  : { backgroundColor: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid transparent' }
              }
              onMouseEnter={(e) => {
                if (scheduleView !== key) {
                  e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--color-bg-elevated) 60%, transparent)'
                  e.currentTarget.style.color = 'var(--color-text-primary)'
                }
              }}
              onMouseLeave={(e) => {
                if (scheduleView !== key) {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = 'var(--color-text-secondary)'
                }
              }}
            >
              {key === 'upcoming' ? <CalendarClock className="h-4 w-4" /> : <History className="h-4 w-4" />}
              {label}
            </button>
          ))}
        </div>

        {scheduleView === 'upcoming' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl p-1" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'color-mix(in srgb, var(--color-bg-panel) 80%, transparent)' }}>
              {DATE_RANGES.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSetDateRange(key)}
                  className="rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-200"
                  style={
                    dateRange === key
                      ? { backgroundColor: 'var(--color-bg-elevated)', color: 'var(--color-primary-600)', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)', border: '1px solid color-mix(in srgb, var(--color-border-primary) 80%, transparent)' }
                      : { backgroundColor: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid transparent' }
                  }
                  onMouseEnter={(e) => {
                    if (dateRange !== key) {
                      e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--color-bg-elevated) 60%, transparent)'
                      e.currentTarget.style.color = 'var(--color-text-primary)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (dateRange !== key) {
                      e.currentTarget.style.backgroundColor = 'transparent'
                      e.currentTarget.style.color = 'var(--color-text-secondary)'
                    }
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {dateRange === 'all' && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl p-1" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'color-mix(in srgb, var(--color-bg-panel) 80%, transparent)' }}>
                  {ALL_RANGE_OPTIONS.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onSetAllRangeSub(key)}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium transition-all"
                      style={
                        allRangeSub === key
                          ? { backgroundColor: 'var(--color-bg-elevated)', color: '#a78bfa', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }
                          : { backgroundColor: 'transparent', color: 'var(--color-text-secondary)' }
                      }
                      onMouseEnter={(e) => {
                        if (allRangeSub !== key) {
                          e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--color-bg-elevated) 60%, transparent)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (allRangeSub !== key) {
                          e.currentTarget.style.backgroundColor = 'transparent'
                        }
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {allRangeSub === 'custom' && (
                  <div className="flex items-center gap-2 rounded-xl px-3 py-1.5" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-elevated)' }}>
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => onSetCustomFrom(e.target.value)}
                      className="h-9 rounded-lg border-0 bg-transparent text-sm focus:ring-0"
                      style={{ color: 'var(--color-text-primary)' }}
                    />
                    <span style={{ color: 'var(--color-text-muted)' }}>至</span>
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => onSetCustomTo(e.target.value)}
                      className="h-9 rounded-lg border-0 bg-transparent text-sm focus:ring-0"
                      style={{ color: 'var(--color-text-primary)' }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {scheduleView === 'history' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl p-1" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'color-mix(in srgb, var(--color-bg-panel) 80%, transparent)' }}>
              {HISTORY_RANGE_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSetHistoryRangeSub(key)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium transition-all"
                  style={
                    historyRangeSub === key
                      ? { backgroundColor: 'var(--color-bg-elevated)', color: '#f59e0b', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }
                      : { backgroundColor: 'transparent', color: 'var(--color-text-secondary)' }
                  }
                  onMouseEnter={(e) => {
                    if (historyRangeSub !== key) {
                      e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--color-bg-elevated) 60%, transparent)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (historyRangeSub !== key) {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {historyRangeSub === 'custom' && (
              <div className="flex items-center gap-2 rounded-xl px-3 py-1.5" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-elevated)' }}>
                <input
                  type="date"
                  value={historyCustomFrom}
                  onChange={(e) => onSetHistoryCustomFrom(e.target.value)}
                  className="h-9 rounded-lg border-0 bg-transparent text-sm focus:ring-0"
                  style={{ color: 'var(--color-text-primary)' }}
                />
                <span style={{ color: 'var(--color-text-muted)' }}>至</span>
                <input
                  type="date"
                  value={historyCustomTo}
                  onChange={(e) => onSetHistoryCustomTo(e.target.value)}
                  max={todayStr()}
                  className="h-9 rounded-lg border-0 bg-transparent text-sm focus:ring-0"
                  style={{ color: 'var(--color-text-primary)' }}
                />
              </div>
            )}
          </div>
        )}

        <div className="relative">
          <button
            type="button"
            onClick={() => onSetStudentDropdownOpen((v) => !v)}
            className="inline-flex h-10 items-center gap-2 rounded-xl pl-3 pr-2.5 text-sm shadow-sm transition-colors"
            style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-primary-500)'
              e.currentTarget.style.backgroundColor = 'var(--color-bg-panel)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border-primary)'
              e.currentTarget.style.backgroundColor = 'var(--color-bg-elevated)'
            }}
          >
            <User className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
            <span className="min-w-[4rem] text-left">{filterStudent ? filterStudent.name : '全部学生'}</span>
            <ChevronDown className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
          </button>
          {studentDropdownOpen && (
            <>
              <div className="fixed inset-0 z-10" aria-hidden onClick={() => onSetStudentDropdownOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-2 max-h-56 w-44 overflow-auto rounded-xl py-1 shadow-xl" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-elevated)', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
                <button
                  type="button"
                  onClick={() => {
                    onSetFilterStudentId(null)
                    onSetStudentDropdownOpen(false)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                  style={
                    filterStudentId == null
                      ? { backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)', color: 'var(--color-primary-700)' }
                      : { backgroundColor: 'transparent', color: 'var(--color-text-primary)' }
                  }
                  onMouseEnter={(e) => {
                    if (filterStudentId != null) {
                      e.currentTarget.style.backgroundColor = 'var(--color-bg-panel)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (filterStudentId != null) {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }
                  }}
                >
                  全部学生
                </button>
                {students.map((student) => (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => {
                      onSetFilterStudentId(student.id)
                      onSetStudentDropdownOpen(false)
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                    style={
                      filterStudentId === student.id
                        ? { backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)', color: 'var(--color-primary-700)' }
                        : { backgroundColor: 'transparent', color: 'var(--color-text-primary)' }
                    }
                    onMouseEnter={(e) => {
                      if (filterStudentId !== student.id) {
                        e.currentTarget.style.backgroundColor = 'var(--color-bg-panel)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (filterStudentId !== student.id) {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }
                    }}
                  >
                    {student.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onOpenAdd}
          disabled={students.length === 0}
          className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-white shadow-sm transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
          style={{ backgroundColor: 'var(--color-primary-600)' }}
          onMouseEnter={(e) => {
            if (students.length > 0) {
              e.currentTarget.style.backgroundColor = 'var(--color-primary-700)'
              e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
            }
          }}
          onMouseLeave={(e) => {
            if (students.length > 0) {
              e.currentTarget.style.backgroundColor = 'var(--color-primary-600)'
              e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
            }
          }}
          title={students.length === 0 ? '请先在学生管理中添加学生' : undefined}
        >
          <Plus className="h-4 w-4" />
          添加排课
        </button>
      </div>
    </div>
  )
}
