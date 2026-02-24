import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileQuestion, Loader2, Search, Trash2, FileStack } from 'lucide-react'
import toast from 'react-hot-toast'
import { getBankList, deleteFromBank } from '../services/api'
import { useStudent } from '../contexts/StudentContext'
import QuestionCard from '../components/QuestionCard'

export default function QuestionBank() {
  const { currentStudent } = useStudent()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState([])
  const [knowledgePointFilter, setKnowledgePointFilter] = useState('')
  const [questionTypeFilter, setQuestionTypeFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [deletingId, setDeletingId] = useState(null)

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (knowledgePointFilter.trim()) params.knowledge_point = knowledgePointFilter.trim()
      if (questionTypeFilter.trim()) params.question_type = questionTypeFilter.trim()
      if (currentStudent?.id != null) params.student_id = currentStudent.id
      const res = await getBankList(params)
      setList(Array.isArray(res.data) ? res.data : [])
    } catch (e) {
      toast.error('加载收藏题库失败：' + (e.response?.data?.detail ?? e.message))
      setList([])
    } finally {
      setLoading(false)
    }
  }, [knowledgePointFilter, questionTypeFilter, currentStudent?.id])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const filtered = list

  const selectedCount = selectedIds.size
  const selectedItems = useMemo(() => {
    return filtered.filter((item) => selectedIds.has(item.id))
  }, [filtered, selectedIds])

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size >= filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map((item) => item.id)))
    }
  }, [filtered, selectedIds.size])

  const handleComposeExam = useCallback(() => {
    if (selectedItems.length === 0) {
      toast.error('请至少选择一道题')
      return
    }
    const questions = selectedItems.map((q) => ({
      content: q.content ?? '',
      options: q.options ?? [],
      answer: q.answer ?? '',
      analysis: q.analysis ?? '',
      question_type: q.question_type,
      difficulty: q.difficulty,
      knowledge_point: q.knowledge_point,
      source: q.source,
    }))
    navigate('/exams/compose', {
      state: { composeQuestions: questions, composeTitle: '' },
    })
  }, [selectedItems, navigate])

  const handleRemoveFromBank = useCallback(
    async (id) => {
      setDeletingId(id)
      try {
        await deleteFromBank(id)
        toast.success('已移出题库')
        setSelectedIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        fetchList()
      } catch (e) {
        toast.error('移出失败：' + (e.response?.data?.detail ?? e.message))
      } finally {
        setDeletingId(null)
      }
    },
    [fetchList]
  )

  return (
    <div className="flex min-h-full flex-col bg-gray-50/50">
      <header className="shrink-0 border-b border-gray-200 bg-white px-4 py-4 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-800">
          {currentStudent ? `${currentStudent.name} 的收藏题库` : '收藏题库'}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          从智能出题、错题本等处收藏的题目，可勾选后「生成试卷」预览与保存
        </p>
      </header>

      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden p-4">
        {/* 左侧筛选 */}
        <aside className="flex w-64 shrink-0 flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <label className="text-sm font-medium text-gray-700">知识点</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="输入知识点筛选…"
              value={knowledgePointFilter}
              onChange={(e) => setKnowledgePointFilter(e.target.value)}
              className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <label className="text-sm font-medium text-gray-700">题型</label>
          <div className="flex flex-wrap gap-2">
            {['', '选择', '填空', '解答'].map((t) => (
              <button
                key={t || 'all'}
                type="button"
                onClick={() => setQuestionTypeFilter(t)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  questionTypeFilter === t
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t || '全部'}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500">共 {list.length} 道</p>
        </aside>

        {/* 主列表 */}
        <main className="min-w-0 flex-1 overflow-y-auto">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
              <p className="mt-3 text-sm">加载中…</p>
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 shadow-sm">
              <FileQuestion className="h-14 w-14 text-gray-300" />
              <p className="mt-3 text-sm font-medium text-gray-500">暂无收藏题目</p>
              <p className="mt-1 text-xs text-gray-400">在智能出题、错题本等页点击题目卡片上的「收藏」即可加入</p>
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <>
              <div className="mb-3 flex items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  全选
                </label>
              </div>
              <ul className="mx-auto max-w-4xl space-y-4">
                {filtered.map((item, i) => (
                  <li key={item.id} className="flex items-start gap-3">
                    <label className="flex shrink-0 cursor-pointer items-start pt-5">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </label>
                    <div className="min-w-0 flex-1">
                      <QuestionCard
                        data={{
                          content: item.content,
                          options: item.options ?? [],
                          answer: item.answer,
                          analysis: item.analysis,
                          question_type: item.question_type,
                          difficulty: item.difficulty,
                          knowledge_point: item.knowledge_point,
                          source: item.source,
                          images: Array.isArray(item.images) ? item.images : [],
                        }}
                        index={i + 1}
                        mistakeSourceLabel="收藏题库"
                        actions={
                          <button
                            type="button"
                            onClick={() => handleRemoveFromBank(item.id)}
                            disabled={deletingId === item.id}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50"
                            title="移出题库"
                          >
                            {deletingId === item.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        }
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </main>
      </div>

      {/* 底部悬浮栏：已选 X 道题 + 生成试卷 */}
      {selectedCount > 0 && (
        <div className="fixed bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-4 rounded-xl border border-gray-300 bg-white px-6 py-3 shadow-lg">
          <span className="text-sm font-medium text-gray-700">已选 {selectedCount} 道题</span>
          <button
            type="button"
            onClick={handleComposeExam}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            <FileStack className="h-4 w-4" />
            生成试卷
          </button>
        </div>
      )}
    </div>
  )
}
