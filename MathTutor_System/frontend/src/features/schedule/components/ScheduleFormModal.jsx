import { createPortal } from 'react-dom'
import { ChevronDown, Loader2, Repeat, X } from 'lucide-react'

import { tomorrowStr, todayStr } from '../utils/dateRanges'
import { WEEKDAY_KEYS, WEEKDAY_LABELS_CN } from '../utils/scheduleMath'

export default function ScheduleFormModal({
  editingSchedule,
  form,
  formStudentDropdownOpen,
  modalOpen,
  onClose,
  onSetForm,
  onSetFormStudentDropdownOpen,
  onSubmit,
  saving,
  selectedStudent,
  students,
}) {
  if (!modalOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-modal-title"
    >
      <div
        className="schedule-modal-panel flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-gray-100 bg-gray-50/50 px-5 py-4">
          <div className="h-9 w-1 rounded-full bg-blue-500" aria-hidden />
          <h2 id="schedule-modal-title" className="flex-1 text-lg font-semibold text-gray-900">
            {editingSchedule ? '编辑排课' : '添加排课'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-800"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <div className="space-y-5">
              <div className="space-y-4">
                <p className="text-xs font-medium uppercase tracking-wider text-gray-400">基本信息</p>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">学生</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => onSetFormStudentDropdownOpen((v) => !v)}
                      className="flex h-11 w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 text-sm text-gray-800 shadow-sm transition-colors hover:border-blue-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/25"
                    >
                      <span className={selectedStudent ? 'text-gray-900' : 'text-gray-400'}>
                        {selectedStudent ? selectedStudent.name : '请选择学生'}
                      </span>
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    </button>
                    {formStudentDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-10" aria-hidden onClick={() => onSetFormStudentDropdownOpen(false)} />
                        <div className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-52 overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-xl ring-1 ring-black/5">
                          {students.map((student) => (
                            <button
                              key={student.id}
                              type="button"
                              onClick={() => {
                                onSetForm((prev) => ({ ...prev, student_id: student.id }))
                                onSetFormStudentDropdownOpen(false)
                              }}
                              className={`flex w-full px-4 py-2.5 text-left text-sm transition-colors ${
                                form.student_id === student.id
                                  ? 'bg-blue-50 font-medium text-blue-700'
                                  : 'text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              {student.name} / {student.grade} {student.class_name}
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
                      onChange={(e) => onSetForm((prev) => ({ ...prev, schedule_date: e.target.value }))}
                      className="h-11 flex-1 rounded-xl border border-gray-200 px-4 text-sm text-gray-800 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/25"
                      required
                    />
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => onSetForm((prev) => ({ ...prev, schedule_date: todayStr() }))}
                        className="h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 active:bg-gray-200"
                      >
                        今天
                      </button>
                      <button
                        type="button"
                        onClick={() => onSetForm((prev) => ({ ...prev, schedule_date: tomorrowStr() }))}
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
                      onChange={(e) => onSetForm((prev) => ({ ...prev, start_time: e.target.value }))}
                      className="h-11 w-full rounded-xl border border-gray-200 px-4 text-sm text-gray-800 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/25"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">结束时间</label>
                    <input
                      type="time"
                      value={form.end_time}
                      onChange={(e) => onSetForm((prev) => ({ ...prev, end_time: e.target.value }))}
                      className="h-11 w-full rounded-xl border border-gray-200 px-4 text-sm text-gray-800 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/25"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50/50 p-4">
                <div className="flex items-center gap-2">
                  <Repeat className="h-4 w-4 text-indigo-500" />
                  <label className="text-sm font-medium text-gray-700">每周重复</label>
                </div>
                <p className="text-xs text-gray-500">勾选星期几则在该日固定上课；不选为单次排课。</p>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_KEYS.map((weekday) => {
                    const selected = (form.recurrence_weekdays || []).includes(weekday)
                    return (
                      <button
                        key={weekday}
                        type="button"
                        onClick={() => {
                          const current = form.recurrence_weekdays || []
                          const next = selected
                            ? current.filter((item) => item !== weekday)
                            : [...current, weekday].sort((a, b) => a - b)
                          onSetForm((prev) => ({ ...prev, recurrence_weekdays: next }))
                        }}
                        className={`min-w-[2.75rem] rounded-lg border py-2 text-sm font-medium transition-all ${
                          selected
                            ? 'border-indigo-400 bg-indigo-50 text-indigo-700 shadow-sm'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-white'
                        }`}
                      >
                        {WEEKDAY_LABELS_CN[weekday]}
                      </button>
                    )
                  })}
                </div>
                {(form.recurrence_weekdays || []).length > 0 && (
                  <p className="text-xs font-medium text-indigo-600">
                    已选：{(form.recurrence_weekdays || []).map((weekday) => WEEKDAY_LABELS_CN[weekday]).join('、')}
                  </p>
                )}
              </div>

              <div className="space-y-4 border-t border-gray-100 pt-4">
                <p className="text-xs font-medium uppercase tracking-wider text-gray-400">选填</p>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-600">主题</label>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => onSetForm((prev) => ({ ...prev, subject: e.target.value }))}
                    placeholder="如：二次函数复习"
                    className="h-11 w-full rounded-xl border border-gray-200 px-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/25"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-600">备注</label>
                  <input
                    type="text"
                    value={form.note}
                    onChange={(e) => onSetForm((prev) => ({ ...prev, note: e.target.value }))}
                    placeholder="补充说明"
                    className="h-11 w-full rounded-xl border border-gray-200 px-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/25"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="shrink-0 border-t border-gray-200 bg-white px-5 py-4">
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
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
  )
}
