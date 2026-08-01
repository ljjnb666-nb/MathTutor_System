import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BookMarked, CheckCircle2, GitBranch, Loader2, MessageCircle, Plus, RefreshCw, Sparkles, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  createMistake,
  deleteMistake,
  generateQuestions,
  getExams,
  getMistakes,
  incrementMistakeReview,
  markMistakeMaster,
  saveExam,
  updateExam,
} from '../services/api'
import { useStudent } from '../contexts/StudentContext'
import { useSmartGen } from '../contexts/SmartGenContext'
import { EmptyState, ErrorState, LoadingState, MetricCard, PageHeader, PageShell, SectionCard, StatusBadge } from '../components/UiV2'

const TOPICS = ['有理数', '整式', '一次方程', '几何初步', '二次根式', '勾股定理', '函数', '统计', '错题巩固', '其他']

function formatDate(value) {
  if (!value) return '未记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function mistakeToQuestion(mistake) {
  return {
    content: (mistake.content ?? '').trim() || '（无题干）',
    options: Array.isArray(mistake.options) ? mistake.options : [],
    answer: (mistake.solution ?? '').trim() || '',
    analysis: '',
    knowledge_point: (mistake.topic ?? '').trim() || '综合',
    question_type: Array.isArray(mistake.options) && mistake.options.length > 0 ? '选择' : '解答',
    difficulty: 'L3',
  }
}

function MistakeCard({ item, actionState, onReview, onMaster, onDelete, onAskAI, onAddHomework }) {
  return (
    <article className="v2-mistake-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge tone="warning">{item.topic || '综合'}</StatusBadge>
            <StatusBadge tone={item.status === 'mastered' ? 'success' : 'neutral'}>{item.status === 'mastered' ? '已掌握' : '待巩固'}</StatusBadge>
            {item.next_review_at && <span className="text-xs font-bold text-slate-400">下次复习 {formatDate(item.next_review_at)}</span>}
          </div>
          <p className="whitespace-pre-wrap text-sm font-black leading-7 text-slate-100">{item.content || '（无题干）'}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button type="button" className="v2-icon-button" title="问 AI" onClick={() => onAskAI(item)}><MessageCircle className="h-4 w-4" /></button>
          <button type="button" className="v2-icon-button" title="加入今日作业" disabled={actionState === 'homework'} onClick={() => onAddHomework(item)}>
            {actionState === 'homework' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </button>
          <button type="button" className="v2-icon-button danger" title="删除" disabled={actionState === 'delete'} onClick={() => onDelete(item)}>
            {actionState === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {item.options?.length > 0 && (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {item.options.map((option, index) => (
            <div key={`${option}-${index}`} className="v2-mistake-option">
              <span>{String.fromCharCode(65 + index)}</span>
              <p>{option}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div className="v2-mistake-note"><span>答案/订正</span><p>{item.solution || '未记录'}</p></div>
        <div className="v2-mistake-note"><span>复习次数</span><p>{item.review_count ?? 0} 次 · 来源 {item.source || '手动录入'}</p></div>
      </div>

      {item.status !== 'mastered' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="v2-btn-secondary" disabled={actionState === 'review'} onClick={() => onReview(item)}>
            {actionState === 'review' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            复习打卡
          </button>
          <button type="button" className="v2-btn-secondary" disabled={actionState === 'master'} onClick={() => onMaster(item)}>
            {actionState === 'master' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            标记掌握
          </button>
        </div>
      )}
    </article>
  )
}

export default function MistakeBook() {
  const { currentStudent } = useStudent()
  const { setQuestions, setParams, setSavedIndices, setBatchSaved, setLoading } = useSmartGen()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const filterKnowledgePoint = searchParams.get('knowledge_point')?.trim() || ''
  const filterReviewDue = searchParams.get('review_due') === '1' || searchParams.get('review_due') === 'true'

  const [activeTab, setActiveTab] = useState(filterReviewDue ? 'due' : 'pending')
  const [pendingList, setPendingList] = useState([])
  const [masteredList, setMasteredList] = useState([])
  const [dueList, setDueList] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState(false)
  const [actionState, setActionState] = useState({})
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ topic: filterKnowledgePoint || '函数', customTopic: '', source: '', content: '', solution: '' })

  const fetchLists = useCallback(async () => {
    if (currentStudent?.id == null) {
      setPendingList([])
      setMasteredList([])
      setDueList([])
      setLoadingList(false)
      return
    }
    setLoadingList(true)
    setError('')
    try {
      const [pendingRes, masteredRes, dueRes] = await Promise.all([
        getMistakes({ student_id: currentStudent.id, status: 'pending' }),
        getMistakes({ student_id: currentStudent.id, status: 'mastered' }),
        getMistakes({ student_id: currentStudent.id, review_due: true }),
      ])
      setPendingList(Array.isArray(pendingRes?.data) ? pendingRes.data : [])
      setMasteredList(Array.isArray(masteredRes?.data) ? masteredRes.data : [])
      setDueList(Array.isArray(dueRes?.data) ? dueRes.data : [])
    } catch (err) {
      const message = err?.response?.data?.detail || err?.message || '加载错题失败'
      setError(message)
      toast.error(message)
    } finally {
      setLoadingList(false)
    }
  }, [currentStudent?.id])

  useEffect(() => {
    fetchLists()
  }, [fetchLists])

  const lists = { pending: pendingList, mastered: masteredList, due: dueList }
  const activeList = useMemo(() => {
    const list = lists[activeTab] || []
    if (!filterKnowledgePoint) return list
    return list.filter((item) => String(item.topic || '').includes(filterKnowledgePoint))
  }, [activeTab, dueList, filterKnowledgePoint, masteredList, pendingList])

  const stats = {
    pending: pendingList.length,
    mastered: masteredList.length,
    due: dueList.length,
    topics: new Set([...pendingList, ...masteredList].map((item) => item.topic).filter(Boolean)).size,
  }

  const setItemAction = (id, action) => setActionState((prev) => ({ ...prev, [id]: action }))
  const clearItemAction = (id) => setActionState((prev) => {
    const next = { ...prev }
    delete next[id]
    return next
  })

  const handleReview = async (item) => {
    setItemAction(item.id, 'review')
    try {
      await incrementMistakeReview(item.id)
      setPendingList((prev) => prev.map((m) => (m.id === item.id ? { ...m, review_count: (m.review_count ?? 0) + 1 } : m)))
      setDueList((prev) => prev.filter((m) => m.id !== item.id))
      toast.success('复习打卡成功')
    } catch (err) {
      toast.error(err?.response?.data?.detail || '打卡失败')
    } finally {
      clearItemAction(item.id)
    }
  }

  const handleMaster = async (item) => {
    setItemAction(item.id, 'master')
    try {
      await markMistakeMaster(item.id)
      setPendingList((prev) => prev.filter((m) => m.id !== item.id))
      setDueList((prev) => prev.filter((m) => m.id !== item.id))
      setMasteredList((prev) => [{ ...item, status: 'mastered' }, ...prev])
      toast.success('已标记为掌握')
    } catch (err) {
      toast.error(err?.response?.data?.detail || '操作失败')
    } finally {
      clearItemAction(item.id)
    }
  }

  const handleDelete = async (item) => {
    setItemAction(item.id, 'delete')
    try {
      await deleteMistake(item.id)
      setPendingList((prev) => prev.filter((m) => m.id !== item.id))
      setDueList((prev) => prev.filter((m) => m.id !== item.id))
      setMasteredList((prev) => prev.filter((m) => m.id !== item.id))
      toast.success('已从错题本移除')
    } catch (err) {
      toast.error(err?.response?.data?.detail || '删除失败')
    } finally {
      clearItemAction(item.id)
    }
  }

  const handleGenerateReviewPaper = async () => {
    if (!currentStudent) {
      toast.error('请先选择学生')
      return
    }
    if (!pendingList.length) {
      toast.error('暂无待巩固错题')
      return
    }
    setGenerating(true)
    setLoading?.(true)
    try {
      const refContent = pendingList.map((item, index) => `【错题${index + 1}】${item.topic ? `（${item.topic}）` : ''}\n${item.content || ''}`).join('\n\n')
      const payload = {
        knowledge_point: filterKnowledgePoint || '错题巩固',
        difficulty: 'L3',
        question_type: '综合',
        count: Math.min(20, Math.max(pendingList.length, pendingList.length * 2)),
        scenario: 'error_analysis',
        reference_question: refContent,
        student_id: currentStudent.id,
      }
      const response = await generateQuestions(payload)
      const generated = Array.isArray(response?.data?.questions)
        ? response.data.questions
        : Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response?.questions)
            ? response.questions
            : Array.isArray(response)
              ? response
              : []
      setQuestions?.(generated)
      setParams?.({ knowledge_point: payload.knowledge_point, difficulty: payload.difficulty, question_type: payload.question_type, count: payload.count, scenario: payload.scenario })
      setSavedIndices?.(new Set())
      setBatchSaved?.(false)
      toast.success(`已生成 ${generated.length} 道巩固题`)
      navigate('/smart-gen', { state: { fromMistakeBook: true } })
    } catch (err) {
      toast.error(err?.response?.data?.detail || err?.message || '生成失败')
    } finally {
      setGenerating(false)
      setLoading?.(false)
    }
  }

  const handleAddHomework = async (item) => {
    setItemAction(item.id, 'homework')
    try {
      const today = new Date().toISOString().slice(0, 10)
      const response = await getExams({ assignment_date: today })
      const list = Array.isArray(response?.data) ? response.data : []
      const draft = list.find((exam) => exam.student_id == null)
      const existing = Array.isArray(draft?.questions) ? draft.questions : draft?.questions?.questions || []
      const question = mistakeToQuestion(item)
      if (draft?.id) await updateExam(draft.id, { questions: [...existing, question] })
      else await saveExam({ title: `${today} 作业`, student_id: null, questions: [question], assignment_date: today })
      toast.success('已加入今日作业')
    } catch (err) {
      toast.error(err?.response?.data?.detail || '加入今日作业失败')
    } finally {
      clearItemAction(item.id)
    }
  }

  const handleSubmitManual = async (event) => {
    event.preventDefault()
    const topic = (form.customTopic || form.topic || '其他').trim()
    if (!form.content.trim()) {
      toast.error('请填写错题题干')
      return
    }
    try {
      const { data } = await createMistake({
        student_id: currentStudent?.id ?? null,
        topic,
        source: form.source.trim() || '手动录入',
        content: form.content.trim(),
        solution: form.solution.trim(),
        status: 'pending',
      })
      setPendingList((prev) => [data || { id: Date.now(), ...form, topic, status: 'pending' }, ...prev])
      setModalOpen(false)
      setForm({ topic: filterKnowledgePoint || '函数', customTopic: '', source: '', content: '', solution: '' })
      toast.success('已添加错题')
    } catch (err) {
      toast.error(err?.response?.data?.detail || '添加失败')
    }
  }

  if (loadingList) {
    return (
      <PageShell>
        <LoadingState title="正在加载错题本" description="读取待巩固、已掌握和今日复习记录。" />
      </PageShell>
    )
  }

  return (
    <PageShell className="space-y-5">
      <PageHeader
        title="错题本"
        description="按学生沉淀错题、跟踪复习节奏，并从真实错题生成巩固练习。"
        icon={BookMarked}
        meta={filterKnowledgePoint ? <StatusBadge tone="primary">{filterKnowledgePoint}</StatusBadge> : <StatusBadge tone="neutral">全部知识点</StatusBadge>}
        actions={(
          <>
            <Link to={`/knowledge-graph${filterKnowledgePoint ? `?knowledge_point=${encodeURIComponent(filterKnowledgePoint)}` : ''}`} className="v2-btn-secondary"><GitBranch className="h-4 w-4" />学情图谱</Link>
            <button type="button" className="v2-btn-secondary" onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" />添加错题</button>
            <button type="button" className="v2-btn-primary" disabled={generating} onClick={handleGenerateReviewPaper}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              生成巩固练习
            </button>
          </>
        )}
      />

      {error ? (
        <ErrorState title="加载失败" description={error} onRetry={fetchLists} />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="待巩固" value={stats.pending} hint="需要继续复习" icon={BookMarked} />
            <MetricCard label="今日到期" value={stats.due} hint="按复习节奏提醒" icon={RefreshCw} tone="warning" />
            <MetricCard label="已掌握" value={stats.mastered} hint="完成闭环" icon={CheckCircle2} tone="success" />
            <MetricCard label="知识点" value={stats.topics} hint="错题覆盖范围" icon={GitBranch} tone="danger" />
          </div>

          <SectionCard
            title="错题记录"
            description="待巩固、今日复习和已掌握三类记录互相独立展示。"
            actions={(
              <div className="v2-tabs">
                {[
                  ['pending', `待巩固 ${stats.pending}`],
                  ['due', `今日复习 ${stats.due}`],
                  ['mastered', `已掌握 ${stats.mastered}`],
                ].map(([key, label]) => (
                  <button key={key} type="button" className={activeTab === key ? 'active' : ''} onClick={() => setActiveTab(key)}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          >
            {activeList.length === 0 ? (
              <EmptyState icon={BookMarked} title="暂无错题记录" description={filterKnowledgePoint ? '当前知识点下没有记录。' : '添加错题或从批改结果同步后会显示在这里。'} />
            ) : (
              <div className="grid gap-3">
                {activeList.map((item) => (
                  <MistakeCard
                    key={item.id}
                    item={item}
                    actionState={actionState[item.id]}
                    onReview={handleReview}
                    onMaster={handleMaster}
                    onDelete={handleDelete}
                    onAskAI={(mistake) => navigate('/chat', { state: { contextQuestion: mistake.content } })}
                    onAddHomework={handleAddHomework}
                  />
                ))}
              </div>
            )}
          </SectionCard>
        </>
      )}

      {modalOpen && (
        <div className="v2-modal-backdrop">
          <form className="v2-import-editor" onSubmit={handleSubmitManual}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2>添加错题</h2>
                <p>手动录入不会调用额外业务接口，保存到当前错题本。</p>
              </div>
              <button type="button" className="v2-icon-button" onClick={() => setModalOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="v2-field">
                <span>知识点</span>
                <select value={form.topic} onChange={(event) => setForm((prev) => ({ ...prev, topic: event.target.value }))}>
                  {TOPICS.map((topic) => <option key={topic} value={topic}>{topic}</option>)}
                </select>
              </label>
              <label className="v2-field">
                <span>自定义知识点</span>
                <input value={form.customTopic} onChange={(event) => setForm((prev) => ({ ...prev, customTopic: event.target.value }))} placeholder="可选" />
              </label>
            </div>
            <label className="v2-field">
              <span>来源</span>
              <input value={form.source} onChange={(event) => setForm((prev) => ({ ...prev, source: event.target.value }))} placeholder="例如：7月月考" />
            </label>
            <label className="v2-field">
              <span>题干</span>
              <textarea value={form.content} onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))} rows={5} />
            </label>
            <label className="v2-field">
              <span>订正/答案</span>
              <textarea value={form.solution} onChange={(event) => setForm((prev) => ({ ...prev, solution: event.target.value }))} rows={3} />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="v2-btn-secondary" onClick={() => setModalOpen(false)}>取消</button>
              <button type="submit" className="v2-btn-primary">保存错题</button>
            </div>
          </form>
        </div>
      )}
    </PageShell>
  )
}
