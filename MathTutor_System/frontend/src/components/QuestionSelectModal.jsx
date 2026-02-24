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
        className="absolute inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />
      {/* 白色弹窗 w-3/4 h-5/6 */}
      <div className="relative flex h-5/6 w-3/4 max-w-4xl flex-col rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-800">选择参考题目</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content: 搜索栏 + 列表区 */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-gray-100 px-5 py-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜索题干、知识点、答案或解析"
                className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-4 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
                <p className="mt-3 text-sm text-gray-500">加载题库中...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-sm text-gray-500">
                  {searchTerm.trim() ? '未找到匹配题目，请换个关键词' : '题库暂无题目'}
                </p>
              </div>
            ) : (
              <ul className="space-y-4">
                {filtered.map((q, i) => (
                  <li key={q.id ?? i} className="flex items-stretch gap-3 rounded-xl border border-gray-200 bg-gray-50/50 p-3">
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
                        className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
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
