import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileQuestion, Loader2, Search, Trash2, FileStack, BookOpen, Star, Tags } from 'lucide-react'
import toast from 'react-hot-toast'
import { getBankList, deleteFromBank } from '../services/api'
import { useStudent } from '../contexts/StudentContext'
import QuestionCard from '../components/QuestionCard'
import { EmptyState, MetricCard, PageHeader, PageShell, ResponsiveTable, SearchInput, SectionCard, StatusBadge, Toolbar } from '../components/UiV2'

export default function QuestionBank() {
  const { currentStudent } = useStudent()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState([])
  const [knowledgePointFilter, setKnowledgePointFilter] = useState('')
  const [questionTypeFilter, setQuestionTypeFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState('')
  const [previewId, setPreviewId] = useState(null)

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      setError('')
      const params = {}
      if (knowledgePointFilter.trim()) params.knowledge_point = knowledgePointFilter.trim()
      if (questionTypeFilter.trim()) params.question_type = questionTypeFilter.trim()
      if (currentStudent?.id != null) params.student_id = currentStudent.id
      const res = await getBankList(params)
      setList(Array.isArray(res.data) ? res.data : [])
    } catch (e) {
      const message = e.response?.data?.detail ?? e.message ?? '加载收藏题库失败'
      setError(message)
      toast.error('加载收藏题库失败：' + message)
      setList([])
    } finally {
      setLoading(false)
    }
  }, [knowledgePointFilter, questionTypeFilter, currentStudent?.id])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const filtered = list
  const previewItem = useMemo(() => {
    if (!filtered.length) return null
    return filtered.find((item) => item.id === previewId) || filtered[0]
  }, [filtered, previewId])

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
    <PageShell fit className="flex flex-col">
      <PageHeader
        title={currentStudent ? `${currentStudent.name} 的专属收藏题库` : '题库管理'}
        description="按参考图重构为筛选、指标、题目表格与右侧预览；题目仍来自当前题库 API。"
        icon={BookOpen}
        actions={
          <button
            type="button"
            onClick={handleComposeExam}
            disabled={selectedCount === 0}
            className="v2-btn-primary"
          >
            <FileStack className="h-4 w-4" />
            生成预览试卷
          </button>
        }
      />

      <Toolbar>
        <SearchInput
          value={knowledgePointFilter}
          onChange={(e) => setKnowledgePointFilter(e.target.value)}
          label="搜索知识点"
          placeholder="搜索题目、知识点..."
          className="flex-1"
        />
        <label className="text-xs font-bold" style={{ color: 'var(--color-text-secondary)' }}>
          题型
          <select
            value={questionTypeFilter}
            onChange={(e) => setQuestionTypeFilter(e.target.value)}
            className="mt-1 h-10 rounded-xl px-3 text-xs outline-none"
            style={{ border: '1px solid var(--color-border-primary)', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
          >
            <option value="">全部题型</option>
            <option value="选择">选择题</option>
            <option value="填空">填空题</option>
            <option value="解答">解答题</option>
          </select>
        </label>
        <button type="button" onClick={fetchList} className="v2-btn-secondary">
          刷新
        </button>
      </Toolbar>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-4">
        <MetricCard label="题库现存" value={list.length} hint="API 返回数量" icon={FileQuestion} />
        <MetricCard label="已选择" value={selectedCount} hint="用于组卷预览" icon={FileStack} tone="info" />
        <MetricCard label="当前题型" value={questionTypeFilter || '全部'} hint="筛选条件" icon={Tags} tone="warning" />
        <MetricCard label="收藏来源" value="真实题库" hint="不写入新业务" icon={Star} tone="success" />
      </div>

      {error && (
        <SectionCard>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-amber-300">
            <span>{error}</span>
            <button type="button" onClick={fetchList} className="v2-btn-secondary">重试</button>
          </div>
        </SectionCard>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <SectionCard
          title={`题目列表（${filtered.length}）`}
          description="桌面端使用表格，移动端自动改为卡片列表"
          actions={
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-bold" style={{ color: 'var(--color-text-primary)' }}>
              <input
                type="checkbox"
                checked={filtered.length > 0 && selectedIds.size === filtered.length}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded focus:ring"
              />
              全选
            </label>
          }
          className="min-h-0 overflow-auto"
        >
          <ResponsiveTable
            loading={loading}
            rows={filtered}
            rowKey={(row) => row.id}
            empty={<EmptyState icon={FileQuestion} title="暂无收藏题目" description="在智能出题或错题本中收藏题目后会显示在这里" />}
            columns={[
              {
                key: 'select',
                title: '',
                render: (item) => (
                  <input
                    aria-label={`选择题目 ${item.id}`}
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    className="h-4 w-4 rounded focus:ring"
                  />
                ),
              },
              {
                key: 'content',
                title: '题干',
                render: (item) => (
                  <button type="button" onClick={() => setPreviewId(item.id)} className="max-w-md truncate text-left font-bold hover:text-indigo-300" title={item.content}>
                    {item.content || '未命名题目'}
                  </button>
                ),
              },
              { key: 'question_type', title: '题型', render: (item) => <StatusBadge tone="primary">{item.question_type || '未标注'}</StatusBadge> },
              { key: 'difficulty', title: '难度', render: (item) => <StatusBadge tone="warning">{item.difficulty || '未标注'}</StatusBadge> },
              { key: 'knowledge_point', title: '知识点', render: (item) => item.knowledge_point || '未标注' },
              {
                key: 'actions',
                title: '操作',
                render: (item) => (
                  <button
                    type="button"
                    onClick={() => handleRemoveFromBank(item.id)}
                    disabled={deletingId === item.id}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-rose-400 hover:bg-rose-500/10 disabled:opacity-50"
                    aria-label="移出题库"
                  >
                    {deletingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                ),
              },
            ]}
            renderMobile={(item, index) => (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <input
                    aria-label={`选择题目 ${item.id}`}
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    className="mt-1 h-4 w-4 rounded focus:ring"
                  />
                  <button type="button" onClick={() => setPreviewId(item.id)} className="min-w-0 flex-1 text-left">
                    <p className="line-clamp-2 text-sm font-bold text-slate-100">{index + 1}. {item.content || '未命名题目'}</p>
                    <p className="mt-1 text-xs text-slate-400">{item.knowledge_point || '未标注知识点'}</p>
                  </button>
                </div>
              </div>
            )}
          />
        </SectionCard>

        <aside className="min-h-0 space-y-4 xl:overflow-auto">
          <SectionCard title="题目预览" description="预览当前选中题目">
            {previewItem ? (
              <QuestionCard
                data={{
                  content: previewItem.content,
                  options: previewItem.options ?? [],
                  answer: previewItem.answer,
                  analysis: previewItem.analysis,
                  question_type: previewItem.question_type,
                  difficulty: previewItem.difficulty,
                  knowledge_point: previewItem.knowledge_point,
                  source: previewItem.source,
                  images: Array.isArray(previewItem.images) ? previewItem.images : [],
                }}
                index={filtered.findIndex((item) => item.id === previewItem.id) + 1}
                mistakeSourceLabel="收藏题库"
              />
            ) : (
              <EmptyState icon={FileQuestion} title="暂无预览" description="列表有题目后会显示详情" />
            )}
          </SectionCard>
        </aside>
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
    </PageShell>
  )
}
