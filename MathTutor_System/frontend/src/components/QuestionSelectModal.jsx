import { useState, useEffect } from 'react'
import { X, Search, Loader2 } from 'lucide-react'
import { getQuestions } from '../services/api'
import QuestionCard from './QuestionCard'
import toast from 'react-hot-toast'

/**
 * 选择参考题目弹窗：从题库搜索并选择一题，用于生成变式题等场景。
 * Props: open, onClose, onSelect(questionData)
 */
export default function QuestionSelectModal({ open, onClose, onSelect }) {
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    if (!open) return
    setSearchTerm('')
    setLoading(true)
    getQuestions()
      .then((res) => setQuestions(Array.isArray(res.data) ? res.data : []))
      .catch((e) => {
        toast.error('加载题库失败：' + (e.response?.data?.detail ?? e.message))
        setQuestions([])
      })
      .finally(() => setLoading(false))
  }, [open])

  const filtered = searchTerm.trim()
    ? questions.filter((item) => {
        const q = searchTerm.trim().toLowerCase()
        const content = (item.content ?? item.body ?? '').toLowerCase()
        const kp = (item.knowledge_point ?? '').toLowerCase()
        const answer = (item.answer ?? '').toLowerCase()
        const analysis = (item.analysis ?? '').toLowerCase()
        return content.includes(q) || kp.includes(q) || answer.includes(q) || analysis.includes(q)
      })
    : questions

  const handleSelect = (questionData) => {
    onSelect?.(questionData)
    onClose?.()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 半透明遮罩 */}
      <button
        type="button"
        aria-label="关闭"
        className="absolute inset-0 transition-opacity"
        style={{ backgroundColor: 'var(--color-bg-overlay)' }}
        onClick={onClose}
      />
      {/* 弹窗 w-3/4 h-5/6 */}
      <div
        className="relative flex h-5/6 w-3/4 max-w-4xl flex-col rounded-xl shadow-xl"
        style={{ backgroundColor: 'var(--color-bg-card)' }}
      >
        {/* Header */}
        <div
          className="flex shrink-0 items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--color-border-primary)' }}
        >
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>选择参考题目</h2>
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

        {/* Content: 搜索栏 + 列表区 */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            className="shrink-0 px-5 py-3"
            style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜索题干、知识点、答案或解析"
                className="w-full rounded-lg py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2"
                style={{
                  border: '1px solid var(--color-border-primary)',
                  backgroundColor: 'var(--color-bg-input)',
                  color: 'var(--color-text-primary)'
                }}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="h-10 w-10 animate-spin" style={{ color: 'var(--color-primary-600)' }} />
                <p className="mt-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>加载题库中...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  {searchTerm.trim() ? '未找到匹配题目，请换个关键词' : '题库暂无题目'}
                </p>
              </div>
            ) : (
              <ul className="space-y-4">
                {filtered.map((q, i) => (
                  <li
                    key={q.id ?? i}
                    className="flex items-stretch gap-3 rounded-xl p-3"
                    style={{
                      border: '1px solid var(--color-border-primary)',
                      backgroundColor: 'var(--color-bg-panel)'
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <QuestionCard
                        data={{
                          content: q.content ?? q.body,
                          options: q.options ?? [],
                          answer: q.answer,
                          analysis: q.analysis,
                          difficulty: q.difficulty,
                          question_type: q.question_type,
                        }}
                        index={i + 1}
                      />
                    </div>
                    <div className="flex shrink-0 items-center">
                      <button
                        type="button"
                        onClick={() => handleSelect(q)}
                        className="rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors"
                        style={{ backgroundColor: 'var(--color-primary-600)' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--color-primary-700)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--color-primary-600)'
                        }}
                      >
                        选择此题
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
