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
        className="absolute inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />
      <div className="relative flex max-h-[85vh] w-full max-w-md flex-col rounded-xl bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-800">布置作业 — 选择学生</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {noContentHint && (
            <div className="shrink-0 border-b border-amber-100 bg-amber-50/80 px-5 py-3 text-sm text-amber-800">
              当前页面暂无题目，请先生成题目后再确认布置，或前往「我的试卷」选择已有试卷进行布置。
            </div>
          )}
          {allowEditTitle && (
            <div className="shrink-0 border-b border-gray-100 px-5 py-3">
              <label className="mb-1 block text-xs font-medium text-gray-500">作业标题（可选）</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={defaultTitle || '如：勾股定理练习'}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          )}
          <div className="shrink-0 flex items-center justify-between border-b border-gray-100 px-5 py-2">
            <span className="text-sm text-gray-500">已选 {selectedIds.size} 人</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="text-sm text-blue-600 hover:underline"
              >
                全选
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="text-sm text-gray-500 hover:underline"
              >
                清空
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
                <p className="mt-3 text-sm text-gray-500">加载学生列表...</p>
              </div>
            ) : students.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Users className="h-12 w-12 text-gray-300" />
                <p className="mt-3 text-sm text-gray-500">暂无学生，请先在「学生管理」中添加</p>
              </div>
            ) : (
              <ul className="space-y-1">
                {students.map((s) => (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(s.id)}
                        onChange={() => toggle(s.id)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="font-medium text-gray-800">{s.name}</span>
                      <span className="text-sm text-gray-500">
                        {s.grade} · {s.class_name}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="shrink-0 flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selectedIds.size === 0 || submitting}
              title={selectedIds.size === 0 ? '请至少选择一名学生' : undefined}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
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
