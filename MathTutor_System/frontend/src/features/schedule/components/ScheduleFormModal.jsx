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
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-modal-title"
    >
      <div
        className="schedule-modal-panel flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl shadow-2xl"
        style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--color-border-subtle)', backgroundColor: 'color-mix(in srgb, var(--color-bg-panel) 50%, transparent)' }}>
          <div className="h-9 w-1 rounded-full" style={{ backgroundColor: 'var(--color-primary-500)' }} aria-hidden />
          <h2 id="schedule-modal-title" className="flex-1 text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {editingSchedule ? '编辑排课' : '添加排课'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
              e.currentTarget.style.color = 'var(--color-text-primary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = 'var(--color-text-muted)'
            }}
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <div className="space-y-5">
              <div className="space-y-4">
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>基本信息</p>
                <div>
                  <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>学生</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => onSetFormStudentDropdownOpen((v) => !v)}
                      className="flex h-11 w-full items-center justify-between rounded-xl px-4 text-sm shadow-sm transition-all"
                      style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-primary-500)'
                        e.currentTarget.style.boxShadow = '0 0 0 2px color-mix(in srgb, var(--color-primary-500) 25%, transparent)'
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-border-primary)'
                        e.currentTarget.style.boxShadow = ''
                      }}
                      onMouseEnter={(e) => {
                        if (e.currentTarget !== document.activeElement) {
                          e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 30%, var(--color-border-primary))'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (e.currentTarget !== document.activeElement) {
                          e.currentTarget.style.borderColor = 'var(--color-border-primary)'
                        }
                      }}
                    >
                      <span style={{ color: selectedStudent ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                        {selectedStudent ? selectedStudent.name : '请选择学生'}
                      </span>
                      <ChevronDown className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
                    </button>
                    {formStudentDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-10" aria-hidden onClick={() => onSetFormStudentDropdownOpen(false)} />
                        <div className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-52 overflow-auto rounded-xl py-1 shadow-xl" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)', boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.05)' }}>
                          {students.map((student) => (
                            <button
                              key={student.id}
                              type="button"
                              onClick={() => {
                                onSetForm((prev) => ({ ...prev, student_id: student.id }))
                                onSetFormStudentDropdownOpen(false)
                              }}
                              className="flex w-full px-4 py-2.5 text-left text-sm transition-colors"
                              style={
                                form.student_id === student.id
                                  ? { backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)', color: 'var(--color-primary-600)', fontWeight: 500 }
                                  : { color: 'var(--color-text-primary)' }
                              }
                              onMouseEnter={(e) => {
                                if (form.student_id !== student.id) {
                                  e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (form.student_id !== student.id) {
                                  e.currentTarget.style.backgroundColor = 'transparent'
                                }
                              }}
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
                  <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>日期</label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={form.schedule_date}
                      onChange={(e) => onSetForm((prev) => ({ ...prev, schedule_date: e.target.value }))}
                      className="h-11 flex-1 rounded-xl px-4 text-sm shadow-sm transition-all"
                      style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-primary-500)'
                        e.currentTarget.style.boxShadow = '0 0 0 2px color-mix(in srgb, var(--color-primary-500) 25%, transparent)'
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-border-primary)'
                        e.currentTarget.style.boxShadow = ''
                      }}
                      required
                    />
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => onSetForm((prev) => ({ ...prev, schedule_date: todayStr() }))}
                        className="h-11 rounded-xl px-3 text-xs font-medium transition-colors"
                        style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-panel)', color: 'var(--color-text-primary)' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--color-bg-panel)'
                        }}
                        onMouseDown={(e) => {
                          e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--color-bg-card-hover) 80%, black)'
                        }}
                        onMouseUp={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                        }}
                      >
                        今天
                      </button>
                      <button
                        type="button"
                        onClick={() => onSetForm((prev) => ({ ...prev, schedule_date: tomorrowStr() }))}
                        className="h-11 rounded-xl px-3 text-xs font-medium transition-colors"
                        style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-panel)', color: 'var(--color-text-primary)' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--color-bg-panel)'
                        }}
                        onMouseDown={(e) => {
                          e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--color-bg-card-hover) 80%, black)'
                        }}
                        onMouseUp={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                        }}
                      >
                        明天
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>开始时间</label>
                    <input
                      type="time"
                      value={form.start_time}
                      onChange={(e) => onSetForm((prev) => ({ ...prev, start_time: e.target.value }))}
                      className="h-11 w-full rounded-xl px-4 text-sm shadow-sm transition-all"
                      style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-primary-500)'
                        e.currentTarget.style.boxShadow = '0 0 0 2px color-mix(in srgb, var(--color-primary-500) 25%, transparent)'
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-border-primary)'
                        e.currentTarget.style.boxShadow = ''
                      }}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>结束时间</label>
                    <input
                      type="time"
                      value={form.end_time}
                      onChange={(e) => onSetForm((prev) => ({ ...prev, end_time: e.target.value }))}
                      className="h-11 w-full rounded-xl px-4 text-sm shadow-sm transition-all"
                      style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-primary-500)'
                        e.currentTarget.style.boxShadow = '0 0 0 2px color-mix(in srgb, var(--color-primary-500) 25%, transparent)'
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-border-primary)'
                        e.currentTarget.style.boxShadow = ''
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-xl p-4" style={{ border: '1px solid var(--color-border-subtle)', backgroundColor: 'color-mix(in srgb, var(--color-bg-panel) 50%, transparent)' }}>
                <div className="flex items-center gap-2">
                  <Repeat className="h-4 w-4" style={{ color: '#a78bfa' }} />
                  <label className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>每周重复</label>
                </div>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>勾选星期几则在该日固定上课；不选为单次排课。</p>
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
                        className="min-w-[2.75rem] rounded-lg py-2 text-sm font-medium transition-all"
                        style={
                          selected
                            ? { border: '1px solid #a78bfa', backgroundColor: 'color-mix(in srgb, #a78bfa 10%, transparent)', color: '#a78bfa', boxShadow: '0 1px 2px 0 rgba(167, 139, 250, 0.1)' }
                            : { border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-secondary)' }
                        }
                        onMouseEnter={(e) => {
                          if (!selected) {
                            e.currentTarget.style.borderColor = 'var(--color-border-strong)'
                            e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!selected) {
                            e.currentTarget.style.borderColor = 'var(--color-border-primary)'
                            e.currentTarget.style.backgroundColor = 'var(--color-bg-input)'
                          }
                        }}
                      >
                        {WEEKDAY_LABELS_CN[weekday]}
                      </button>
                    )
                  })}
                </div>
                {(form.recurrence_weekdays || []).length > 0 && (
                  <p className="text-xs font-medium" style={{ color: '#a78bfa' }}>
                    已选：{(form.recurrence_weekdays || []).map((weekday) => WEEKDAY_LABELS_CN[weekday]).join('、')}
                  </p>
                )}
              </div>

              <div className="space-y-4 pt-4" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>选填</p>
                <div>
                  <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>主题</label>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => onSetForm((prev) => ({ ...prev, subject: e.target.value }))}
                    placeholder="如：二次函数复习"
                    className="h-11 w-full rounded-xl px-4 text-sm transition-all"
                    style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-primary-500)'
                      e.currentTarget.style.boxShadow = '0 0 0 2px color-mix(in srgb, var(--color-primary-500) 25%, transparent)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-border-primary)'
                      e.currentTarget.style.boxShadow = ''
                    }}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>备注</label>
                  <input
                    type="text"
                    value={form.note}
                    onChange={(e) => onSetForm((prev) => ({ ...prev, note: e.target.value }))}
                    placeholder="补充说明"
                    className="h-11 w-full rounded-xl px-4 text-sm transition-all"
                    style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-primary-500)'
                      e.currentTarget.style.boxShadow = '0 0 0 2px color-mix(in srgb, var(--color-primary-500) 25%, transparent)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-border-primary)'
                      e.currentTarget.style.boxShadow = ''
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="shrink-0 px-5 py-4" style={{ borderTop: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }}>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
                style={{ border: '1px solid var(--color-border-primary)', color: 'var(--color-text-primary)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all disabled:opacity-60"
                style={{ background: 'linear-gradient(to right, var(--color-primary-600), var(--color-primary-700))' }}
                onMouseEnter={(e) => {
                  if (!saving) {
                    e.currentTarget.style.opacity = '0.9'
                    e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(59, 130, 246, 0.3)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!saving) {
                    e.currentTarget.style.opacity = '1'
                    e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                  }
                }}
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
