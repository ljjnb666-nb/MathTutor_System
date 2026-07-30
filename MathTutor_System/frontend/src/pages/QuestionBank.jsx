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
    <div className="flex min-h-full flex-col animate-fade-in-up space-y-4">
      <header className="shrink-0 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black tracking-tight text-slate-900">
            {currentStudent ? `${currentStudent.name} 的专属收藏题库` : '题库资产中心'}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            集中管理收藏的优质考题，支持一键勾选组卷生成标准数学试卷
          </p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-5 overflow-hidden">
        {/* 左侧筛选面板 */}
        <aside className="pro-glass-card flex w-72 shrink-0 flex-col gap-4 rounded-3xl p-5">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">搜索知识点</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="输入知识点关键词…"
                value={knowledgePointFilter}
                onChange={(e) => setKnowledgePointFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold text-slate-700">题型分类</label>
            <div className="grid grid-cols-2 gap-2">
              {['', '选择', '填空', '解答'].map((t) => (
                <button
                  key={t || 'all'}
                  type="button"
                  onClick={() => setQuestionTypeFilter(t)}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
                    questionTypeFilter === t
                      ? 'border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {t || '全部题型'}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto border-t border-slate-100 pt-3">
            <span className="text-xs font-bold text-slate-500">题库现存: {list.length} 道精选题目</span>
          </div>
        </aside>

        {/* 主列表 */}
        <main className="min-w-0 flex-1 overflow-y-auto pr-1">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
              <p className="mt-3 text-xs font-bold">正在加载精选题库…</p>
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="pro-glass-card flex flex-col items-center justify-center rounded-3xl py-20 text-center">
              <FileQuestion className="h-14 w-14 text-slate-300 mb-3" />
              <p className="text-sm font-extrabold text-slate-700">暂无收藏题目</p>
              <p className="mt-1 text-xs text-slate-400">在智能出题或错题本中点击「收藏」按钮，即可添加至此处</p>
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <>
              <div className="mb-3 flex items-center justify-between">
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-700 bg-white border border-slate-200/80 px-3 py-1.5 rounded-xl">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  全选当前页面
                </label>
              </div>
              <ul className="space-y-4">
                {filtered.map((item, i) => (
                  <li key={item.id} className="flex items-start gap-3">
                    <label className="flex shrink-0 cursor-pointer items-start pt-5">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
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
                            className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-rose-600 hover:bg-rose-50 disabled:opacity-50 transition-colors"
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

      {/* 底部黑曜石悬浮组卷工具栏 */}
      {selectedCount > 0 && (
        <div className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-5 rounded-2xl border border-slate-700 bg-[#0B0F17]/95 px-6 py-3.5 text-white shadow-2xl backdrop-blur-2xl animate-fade-in-up">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
            <span className="text-xs font-bold">已选 <strong className="text-indigo-400 font-black text-sm">{selectedCount}</strong> 道题目</span>
          </div>
          <button
            type="button"
            onClick={handleComposeExam}
            className="btn-gradient-pro inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black"
          >
            <FileStack className="h-4 w-4" />
            生成预览试卷
          </button>
        </div>
      )}
    </div>
  )
}
