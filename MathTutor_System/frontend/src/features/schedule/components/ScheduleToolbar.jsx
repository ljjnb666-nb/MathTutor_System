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
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 py-4 shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">排课管理</h1>
            <p className="mt-0.5 text-xs text-gray-500">安排上课日期与时段</p>
          </div>
        </div>
        <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-sm font-medium text-blue-700">
          共 {count} 条
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-gray-200 bg-gray-100/80 p-1">
          {SCHEDULE_VIEWS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => onSetScheduleView(key)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
                scheduleView === key
                  ? 'bg-white text-blue-600 shadow-sm ring-1 ring-gray-200/80'
                  : 'text-gray-600 hover:bg-white/60 hover:text-gray-900'
              }`}
            >
              {key === 'upcoming' ? <CalendarClock className="h-4 w-4" /> : <History className="h-4 w-4" />}
              {label}
            </button>
          ))}
        </div>

        {scheduleView === 'upcoming' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-gray-200 bg-gray-100/80 p-1">
              {DATE_RANGES.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSetDateRange(key)}
                  className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
                    dateRange === key
                      ? 'bg-white text-blue-600 shadow-sm ring-1 ring-gray-200/80'
                      : 'text-gray-600 hover:bg-white/60 hover:text-gray-900'
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
                      onClick={() => onSetAllRangeSub(key)}
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
                      onChange={(e) => onSetCustomFrom(e.target.value)}
                      className="h-9 rounded-lg border-0 bg-transparent text-sm text-gray-800 focus:ring-0"
                    />
                    <span className="text-gray-400">至</span>
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => onSetCustomTo(e.target.value)}
                      className="h-9 rounded-lg border-0 bg-transparent text-sm text-gray-800 focus:ring-0"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {scheduleView === 'history' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-gray-200 bg-gray-100/80 p-1">
              {HISTORY_RANGE_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSetHistoryRangeSub(key)}
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
                  onChange={(e) => onSetHistoryCustomFrom(e.target.value)}
                  className="h-9 rounded-lg border-0 bg-transparent text-sm text-gray-800 focus:ring-0"
                />
                <span className="text-gray-400">至</span>
                <input
                  type="date"
                  value={historyCustomTo}
                  onChange={(e) => onSetHistoryCustomTo(e.target.value)}
                  max={todayStr()}
                  className="h-9 rounded-lg border-0 bg-transparent text-sm text-gray-800 focus:ring-0"
                />
              </div>
            )}
          </div>
        )}

        <div className="relative">
          <button
            type="button"
            onClick={() => onSetStudentDropdownOpen((v) => !v)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white pl-3 pr-2.5 text-sm text-gray-700 shadow-sm transition-colors hover:border-blue-200 hover:bg-gray-50"
          >
            <User className="h-4 w-4 text-gray-400" />
            <span className="min-w-[4rem] text-left">{filterStudent ? filterStudent.name : '全部学生'}</span>
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </button>
          {studentDropdownOpen && (
            <>
              <div className="fixed inset-0 z-10" aria-hidden onClick={() => onSetStudentDropdownOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-2 max-h-56 w-44 overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-xl ring-1 ring-black/5">
                <button
                  type="button"
                  onClick={() => {
                    onSetFilterStudentId(null)
                    onSetStudentDropdownOpen(false)
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                    filterStudentId == null ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                  }`}
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
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                      filterStudentId === student.id
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
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
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-blue-700 hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
          title={students.length === 0 ? '请先在学生管理中添加学生' : undefined}
        >
          <Plus className="h-4 w-4" />
          添加排课
        </button>
      </div>
    </div>
  )
}
