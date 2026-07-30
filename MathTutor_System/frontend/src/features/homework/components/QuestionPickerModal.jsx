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
      <button type="button" aria-label="关闭" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : list.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">{emptyText}</p>
          ) : (
            <ul className="space-y-3">
              {list.map((item) => (
                <li key={item.id} className="flex items-start gap-3 rounded-lg border border-gray-100 p-3 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggle(item.id)}
                    className="mt-1.5 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600"
                  />
                  <div className="min-w-0 flex-1 break-words text-sm text-gray-700">
                    <span className="inline">
                      <Latex>{normalizeLatexForKaTeX((item.content ?? '').trim() || '（无题干）')}</Latex>
                    </span>
                    {Array.isArray(item.options) && item.options.length > 0 && (
                      <ul className="mt-1.5 list-none space-y-0.5 pl-0 text-gray-600">
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
        <div className="flex shrink-0 justify-end gap-2 border-t border-gray-200 px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={selected.size === 0}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            加入 {selected.size} 题
          </button>
        </div>
      </div>
    </div>
  )
}
