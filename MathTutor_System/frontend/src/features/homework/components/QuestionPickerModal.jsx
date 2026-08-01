import { useEffect, useState } from 'react'
import Latex from 'react-latex-next'
import { Loader2, X } from 'lucide-react'

import { normalizeLatexForKaTeX } from '../../../utils/latex'
import { getOptionDisplayText } from '../utils/homeworkUtils'

export default function QuestionPickerModal({
  emptyText,
  fetchList,
  onClose,
  onConfirm,
  open,
  title,
}) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(new Set())

  useEffect(() => {
    if (!open) return
    setSelected(new Set())
    setLoading(true)
    fetchList()
      .then((res) => setList(Array.isArray(res.data) ? res.data : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [fetchList, open])

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleConfirm = () => {
    onConfirm?.(list.filter((item) => selected.has(item.id)))
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="关闭" className="absolute inset-0" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }} onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl shadow-xl" style={{ backgroundColor: 'var(--color-bg-card)' }}>
        <div className="flex shrink-0 items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--color-border-primary)' }}>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
              e.currentTarget.style.color = 'var(--color-text-secondary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = 'var(--color-text-muted)'
            }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--color-primary-600)' }} />
            </div>
          ) : list.length === 0 ? (
            <p className="py-6 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>{emptyText}</p>
          ) : (
            <ul className="space-y-3">
              {list.map((item) => (
                <li key={item.id} className="flex items-start gap-3 rounded-lg p-3 transition-colors" style={{ border: '1px solid var(--color-border-subtle)' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)' }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}>
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggle(item.id)}
                    className="mt-1.5 h-4 w-4 shrink-0 rounded"
                    style={{ borderColor: 'var(--color-border-primary)', color: 'var(--color-primary-600)' }}
                  />
                  <div className="min-w-0 flex-1 break-words text-sm" style={{ color: 'var(--color-text-primary)' }}>
                    <span className="inline">
                      <Latex>{normalizeLatexForKaTeX((item.content ?? '').trim() || '（无题干）')}</Latex>
                    </span>
                    {Array.isArray(item.options) && item.options.length > 0 && (
                      <ul className="mt-1.5 list-none space-y-0.5 pl-0" style={{ color: 'var(--color-text-secondary)' }}>
                        {item.options.slice(0, 4).map((opt, i) => (
                          <li key={i} className="flex gap-1.5">
                            <span className="shrink-0">{String.fromCharCode(65 + i)}.</span>
                            <span className="inline">
                              <Latex>{normalizeLatexForKaTeX(getOptionDisplayText(opt))}</Latex>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex shrink-0 justify-end gap-2 px-4 py-3" style={{ borderTop: '1px solid var(--color-border-primary)' }}>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-medium transition-all"
            style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-panel)', color: 'var(--color-text-primary)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-bg-panel)'
            }}
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={selected.size === 0}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 transition-all"
            style={{ background: 'linear-gradient(to right, var(--color-primary-600), var(--color-primary-700))' }}
            onMouseEnter={(e) => {
              if (selected.size > 0) {
                e.currentTarget.style.opacity = '0.9'
              }
            }}
            onMouseLeave={(e) => {
              if (selected.size > 0) {
                e.currentTarget.style.opacity = '1'
              }
            }}
          >
            加入 {selected.size} 题
          </button>
        </div>
      </div>
    </div>
  )
}
