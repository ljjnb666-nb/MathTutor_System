import { useState, useEffect } from 'react'
import { X, Loader2, Users } from 'lucide-react'
import { getStudents } from '../services/api'
import toast from 'react-hot-toast'

/**
 * 布置作业：多选学生弹窗。
 * Props: open, onClose, onConfirm(selectedStudents[, title]) => Promise | void
 *        defaultTitle?: string  默认作业标题（当 allowEditTitle 时显示可编辑）
 *        allowEditTitle?: boolean  是否显示标题输入框
 * 若 onConfirm 返回 Promise，则等待完成后再关闭弹窗，确认按钮显示 loading。
 */
export default function StudentSelectorModal({
  open,
  onClose,
  onConfirm,
  defaultTitle = '',
  allowEditTitle = false,
  noContentHint = false,
}) {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [title, setTitle] = useState(defaultTitle)

  useEffect(() => {
    if (!open) return
    setSelectedIds(new Set())
    setTitle(defaultTitle || '')
    setLoading(true)
    getStudents()
      .then((res) => setStudents(Array.isArray(res.data) ? res.data : []))
      .catch((e) => {
        toast.error('加载学生列表失败：' + (e.response?.data?.detail ?? e.message))
        setStudents([])
      })
      .finally(() => setLoading(false))
  }, [open, defaultTitle])

  const toggle = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedIds(new Set(students.map((s) => s.id)))
  const clearAll = () => setSelectedIds(new Set())

  const handleConfirm = async () => {
    const selected = students.filter((s) => selectedIds.has(s.id))
    if (selected.length === 0) return
    const titleVal = allowEditTitle ? (title.trim() || defaultTitle || '').trim() : undefined
    const result = allowEditTitle ? onConfirm?.(selected, titleVal) : onConfirm?.(selected)
    if (!(result && typeof result.then === 'function')) {
      onClose?.()
      return
    }
    setSubmitting(true)
    try {
      await result
      onClose?.()
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="关闭"
        className="absolute inset-0 transition-opacity"
        style={{ backgroundColor: 'var(--color-bg-overlay)' }}
        onClick={onClose}
      />
      <div
        className="relative flex max-h-[85vh] w-full max-w-md flex-col rounded-xl shadow-xl"
        style={{ backgroundColor: 'var(--color-bg-card)' }}
      >
        <div
          className="flex shrink-0 items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--color-border-primary)' }}
        >
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>布置作业 — 选择学生</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 transition-colors"
            style={{ color: 'var(--color-text-secondary)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
              e.currentTarget.style.color = 'var(--color-text-primary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = 'var(--color-text-secondary)'
            }}
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {noContentHint && (
            <div
              className="shrink-0 px-5 py-3 text-sm"
              style={{
                borderBottom: '1px solid rgba(251, 191, 36, 0.2)',
                backgroundColor: 'color-mix(in srgb, #fbbf24 10%, var(--color-bg-card))',
                color: '#92400e'
              }}
            >
              当前页面暂无题目，请先生成题目后再确认布置，或前往「我的试卷」选择已有试卷进行布置。
            </div>
          )}
          {allowEditTitle && (
            <div
              className="shrink-0 px-5 py-3"
              style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
            >
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>作业标题（可选）</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={defaultTitle || '如：勾股定理练习'}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1"
                style={{
                  border: '1px solid var(--color-border-primary)',
                  backgroundColor: 'var(--color-bg-input)',
                  color: 'var(--color-text-primary)'
                }}
              />
            </div>
          )}
          <div
            className="shrink-0 flex items-center justify-between px-5 py-2"
            style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
          >
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>已选 {selectedIds.size} 人</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="text-sm hover:underline"
                style={{ color: 'var(--color-primary-600)' }}
              >
                全选
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="text-sm hover:underline"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                清空
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="h-10 w-10 animate-spin" style={{ color: 'var(--color-primary-600)' }} />
                <p className="mt-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>加载学生列表...</p>
              </div>
            ) : students.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Users className="h-12 w-12" style={{ color: 'var(--color-border-primary)' }} />
                <p className="mt-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>暂无学生，请先在「学生管理」中添加</p>
              </div>
            ) : (
              <ul className="space-y-1">
                {students.map((s) => (
                  <li key={s.id}>
                    <label
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(s.id)}
                        onChange={() => toggle(s.id)}
                        className="h-4 w-4 rounded focus:ring-1"
                        style={{
                          borderColor: 'var(--color-border-primary)',
                          color: 'var(--color-primary-600)'
                        }}
                      />
                      <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{s.name}</span>
                      <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                        {s.grade} · {s.class_name}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div
            className="shrink-0 flex justify-end gap-2 px-5 py-4"
            style={{ borderTop: '1px solid var(--color-border-subtle)' }}
          >
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              style={{
                border: '1px solid var(--color-border-primary)',
                color: 'var(--color-text-primary)'
              }}
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
              type="button"
              onClick={handleConfirm}
              disabled={selectedIds.size === 0 || submitting}
              title={selectedIds.size === 0 ? '请至少选择一名学生' : undefined}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
              style={{ backgroundColor: 'var(--color-primary-600)' }}
              onMouseEnter={(e) => {
                if (selectedIds.size > 0 && !submitting) {
                  e.currentTarget.style.backgroundColor = 'var(--color-primary-700)'
                }
              }}
              onMouseLeave={(e) => {
                if (selectedIds.size > 0 && !submitting) {
                  e.currentTarget.style.backgroundColor = 'var(--color-primary-600)'
                }
              }}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? '布置中…' : '确认布置'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
