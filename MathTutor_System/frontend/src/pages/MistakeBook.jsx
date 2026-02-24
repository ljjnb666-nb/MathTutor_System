import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import {
  Zap,
  Loader2,
  BookOpen,
  AlertCircle,
  Trash2,
  BookMarked,
  CheckCircle2,
  Plus,
  X,
  MessageCircle,
  GitBranch,
  ClipboardList,
} from 'lucide-react'
import Latex from 'react-latex-next'
import { normalizeLatexForKaTeX } from '../utils/latex'
import toast from 'react-hot-toast'
import {
  getMistakes,
  generateQuestions,
  deleteMistake,
  createMistake,
  incrementMistakeReview,
  markMistakeMaster,
  getExams,
  updateExam,
  saveExam,
} from '../services/api'
import { useStudent } from '../contexts/StudentContext'
import { useSmartGen } from '../contexts/SmartGenContext'
import 'katex/dist/katex.min.css'

// 预定义知识点（可选或输入新）
const PREDEFINED_TOPICS = [
  '有理数',
  '整式',
  '一元一次方程',
  '几何初步',
  '二次根式',
  '勾股定理',
  '函数',
  '统计',
  '错题巩固',
  '其他',
]

/** 去掉选项文本开头的 "A." "B." 等前缀，避免与界面补的序号重复显示 */
function getOptionDisplayText(opt) {
  if (typeof opt !== 'string') return String(opt ?? '')
  const s = opt.trim()
  const m = s.match(/^\s*[A-Za-z][.．、]\s*/)
  return m ? s.slice(m[0].length).trim() || s : s
}

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(iso)
  }
}

export default function MistakeBook() {
  const { currentStudent } = useStudent()
  const { setQuestions, setParams, setSavedIndices, setBatchSaved, setLoading } = useSmartGen()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const filterKnowledgePoint = searchParams.get('knowledge_point')?.trim() ?? null
  const filterReviewDue = searchParams.get('review_due') === '1' || searchParams.get('review_due') === 'true'

  const [activeTab, setActiveTab] = useState(filterReviewDue ? 'due_today' : 'pending') // 'pending' | 'mastered' | 'due_today'
  const [pendingList, setPendingList] = useState([])
  const [masteredList, setMasteredList] = useState([])
  const [dueTodayList, setDueTodayList] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [reviewingId, setReviewingId] = useState(null)
  const [masteringId, setMasteringId] = useState(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalTopic, setModalTopic] = useState('')
  const [modalTopicCustom, setModalTopicCustom] = useState('')
  const [modalSource, setModalSource] = useState('')
  const [modalContent, setModalContent] = useState('')
  const [modalSolution, setModalSolution] = useState('')
  const [modalSubmitting, setModalSubmitting] = useState(false)
  const [addingToHomeworkId, setAddingToHomeworkId] = useState(null)

  const fetchLists = useCallback(async () => {
    if (currentStudent?.id == null) {
      setPendingList([])
      setMasteredList([])
      setDueTodayList([])
      setLoadingList(false)
      return
    }
    setLoadingList(true)
    try {
      const [pendingRes, masteredRes, dueRes] = await Promise.all([
        getMistakes({ student_id: currentStudent.id, status: 'pending' }),
        getMistakes({ student_id: currentStudent.id, status: 'mastered' }),
        getMistakes({ student_id: currentStudent.id, review_due: true }),
      ])
      setPendingList(Array.isArray(pendingRes.data) ? pendingRes.data : [])
      setMasteredList(Array.isArray(masteredRes.data) ? masteredRes.data : [])
      setDueTodayList(Array.isArray(dueRes.data) ? dueRes.data : [])
    } catch (e) {
      toast.error('加载错题失败：' + (e.response?.data?.detail ?? e.message))
      setPendingList([])
      setMasteredList([])
      setDueTodayList([])
    } finally {
      setLoadingList(false)
    }
  }, [currentStudent?.id])

  useEffect(() => {
    fetchLists()
  }, [fetchLists])

  useEffect(() => {
    if (filterReviewDue && activeTab !== 'due_today') setActiveTab('due_today')
  }, [filterReviewDue])

  const handleReview = useCallback(async (id) => {
    const numId = Number(id)
    if (Number.isNaN(numId)) return
    setReviewingId(numId)
    try {
      await incrementMistakeReview(numId)
      setPendingList((prev) =>
        prev.map((m) =>
          Number(m.id) === numId ? { ...m, review_count: (m.review_count ?? 0) + 1 } : m
        )
      )
      setDueTodayList((prev) => prev.filter((m) => Number(m.id) !== numId))
      toast.success('复习打卡成功')
    } catch (err) {
      const msg = err.response?.data?.detail ?? err.message
      toast.error(typeof msg === 'string' ? msg : '打卡失败')
    } finally {
      setReviewingId(null)
    }
  }, [])

  const handleMaster = useCallback(
    async (id) => {
      const numId = Number(id)
      if (Number.isNaN(numId)) return
      setMasteringId(numId)
      try {
        await markMistakeMaster(numId)
        const card = pendingList.find((m) => Number(m.id) === numId)
        if (card) {
          setPendingList((prev) => prev.filter((m) => Number(m.id) !== numId))
          setDueTodayList((prev) => prev.filter((m) => Number(m.id) !== numId))
          setMasteredList((prev) => [{ ...card, status: 'mastered' }, ...prev])
        }
        toast.success('太棒了！已标记为掌握 🎉', { duration: 3500 })
      } catch (err) {
        const msg = err.response?.data?.detail ?? err.message
        toast.error(typeof msg === 'string' ? msg : '操作失败')
      } finally {
        setMasteringId(null)
      }
    },
    [pendingList]
  )

  const handleDelete = useCallback(async (id, fromMastered) => {
    const numId = Number(id)
    if (Number.isNaN(numId)) return
    setDeletingId(numId)
    try {
      await deleteMistake(numId)
      if (fromMastered) {
        setMasteredList((prev) => prev.filter((m) => Number(m.id) !== numId))
      } else {
        setPendingList((prev) => prev.filter((m) => Number(m.id) !== numId))
        setDueTodayList((prev) => prev.filter((m) => Number(m.id) !== numId))
      }
      toast.success('已从错题本移除')
    } catch (err) {
      const msg = err.response?.data?.detail ?? err.message
      toast.error(typeof msg === 'string' ? msg : '删除失败')
    } finally {
      setDeletingId(null)
    }
  }, [])

  /** 错题转试卷题目格式 */
  const mistakeToQuestion = useCallback((m) => ({
    content: (m.content ?? '').trim() || '（无题干）',
    options: Array.isArray(m.options) ? m.options : [],
    answer: (m.solution ?? '').trim() || '',
    analysis: '',
    knowledge_point: (m.topic ?? '').trim() || '综合',
    question_type: Array.isArray(m.options) && m.options.length > 0 ? '选择' : '解答',
    difficulty: 'L3',
  }))

  const handleAddToTodayHomework = useCallback(async (m) => {
    if (addingToHomeworkId != null) return
    setAddingToHomeworkId(m.id)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const res = await getExams({ assignment_date: today })
      const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : [])
      const draft = list.find((e) => e.student_id == null)
      const flat = draft?.questions
        ? Array.isArray(draft.questions)
          ? draft.questions
          : (draft.questions?.questions || [])
        : []
      const newQuestion = mistakeToQuestion(m)
      if (draft?.id) {
        await updateExam(draft.id, { questions: [...flat, newQuestion] })
      } else {
        await saveExam({
          title: `${today} 作业`,
          student_id: null,
          questions: [newQuestion],
          assignment_date: today,
        })
      }
      toast.success('已加入今日作业')
    } catch (err) {
      const msg = err.response?.data?.detail ?? err.message
      toast.error(typeof msg === 'string' ? msg : '加入今日作业失败')
    } finally {
      setAddingToHomeworkId(null)
    }
  }, [addingToHomeworkId, mistakeToQuestion])

  const handleGenerateReviewPaper = useCallback(async () => {
    if (!currentStudent) {
      toast.error('请先在左侧选择学生')
      return
    }
    if (!pendingList.length) {
      toast.error('暂无待攻克错题，无法生成消灭错题卷')
      return
    }
    const refBlocks = pendingList.map((m, i) => {
      const content = (m.content ?? '').trim() || '（无题干）'
      const topic = (m.topic ?? '').trim()
      return `【错题${i + 1}】${topic ? `（${topic}）` : ''}\n${content}`
    })
    const ref_content = refBlocks.join('\n\n')
    const count = Math.min(20, Math.max(pendingList.length, pendingList.length * 2))
    setGenerating(true)
    try {
      const payload = {
        knowledge_point: '错题巩固',
        scenario: 'error_crusher',
        difficulty: 'L3',
        question_type: '综合',
        count,
        ref_content,
        student_id: currentStudent.id,
      }
      const { data } = await generateQuestions(payload)
      const list = Array.isArray(data) ? data : []
      setQuestions(list)
      setParams((prev) => ({
        ...prev,
        knowledge_point: '错题巩固',
        scenario: 'error_crusher',
        difficulty: 'L3',
        question_type: '综合',
        count,
      }))
      setSavedIndices(new Set())
      setBatchSaved(false)
      setLoading(false)
      toast.success(`已生成 ${list.length} 道变式题，请到智能出题页保存为试卷或加入题库`)
      navigate('/smart-gen')
    } catch (err) {
      if (err.upgradeRequired) {
        toast.error(err.upgradeMessage || '该功能需升级套餐')
        navigate('/pricing')
        return
      }
      const msg = err.response?.data?.detail ?? err.message
      toast.error(typeof msg === 'string' ? msg : '生成消灭错题卷失败')
    } finally {
      setGenerating(false)
    }
  }, [
    currentStudent,
    pendingList,
    setQuestions,
    setParams,
    setSavedIndices,
    setBatchSaved,
    setLoading,
    navigate,
  ])

  const openCreateModal = useCallback(() => {
    setModalTopic('')
    setModalTopicCustom('')
    setModalSource('')
    setModalContent('')
    setModalSolution('')
    if (filterKnowledgePoint) setModalTopic(filterKnowledgePoint)
    setModalOpen(true)
  }, [filterKnowledgePoint])

  const submitCreateMistake = useCallback(async () => {
    if (!currentStudent?.id) {
      toast.error('请先选择学生')
      return
    }
    const topic =
      modalTopic === '其他' ? modalTopicCustom.trim() : (modalTopic || modalTopicCustom).trim()
    const source = modalSource.trim()
    const content = modalContent.trim()
    if (!topic) {
      toast.error('请选择或输入知识点')
      return
    }
    if (!content) {
      toast.error('请填写题目内容')
      return
    }
    setModalSubmitting(true)
    try {
      await createMistake({
        student_id: currentStudent.id,
        topic,
        source: source || '手动添加',
        content,
        solution: modalSolution.trim() || undefined,
      })
      toast.success('已加入错题本')
      setModalOpen(false)
      fetchLists()
    } catch (err) {
      const msg = err.response?.data?.detail ?? err.message
      toast.error(typeof msg === 'string' ? msg : '添加失败')
    } finally {
      setModalSubmitting(false)
    }
  }, [currentStudent?.id, modalTopic, modalTopicCustom, modalSource, modalContent, modalSolution, fetchLists])

  const pendingFiltered =
    filterKnowledgePoint
      ? pendingList.filter(
          (m) =>
            (m.topic ?? '').trim() === filterKnowledgePoint ||
            (m.topic ?? '').includes(filterKnowledgePoint)
        )
      : pendingList
  const displayList =
    activeTab === 'pending' ? pendingFiltered : activeTab === 'due_today' ? dueTodayList : masteredList

  if (!currentStudent) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-xl border border-amber-200 bg-amber-50/80 p-8 text-amber-800">
        <AlertCircle className="h-12 w-12 text-amber-600" />
        <p className="text-center font-medium">请先在左侧选择学生，再查看该学生的错题本。</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">
          智能错题本 <span className="text-lg font-normal text-gray-500">(Smart Notebook)</span>
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {filterKnowledgePoint && (
            <Link
              to={`/knowledge-graph?knowledge_point=${encodeURIComponent(filterKnowledgePoint)}`}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
            >
              <GitBranch className="h-4 w-4" />
              在学情图谱中查看
            </Link>
          )}
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 active:bg-blue-800"
          >
            <Plus className="h-4 w-4" />
            添加错题
          </button>
        </div>
      </header>

      <div
        className="flex gap-2 rounded-xl border border-gray-200 bg-white p-1 shadow-sm"
        role="tablist"
        aria-label="待攻克 / 今日待复习 / 已掌握"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'pending'}
          onClick={() => setActiveTab('pending')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
            activeTab === 'pending'
              ? 'bg-amber-100 text-amber-800 shadow-sm'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <span>🔥 待攻克</span>
          <span
            className={`min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-xs font-semibold ${
              activeTab === 'pending' ? 'bg-amber-200 text-amber-900' : 'bg-gray-200 text-gray-700'
            }`}
          >
            {pendingList.length}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'due_today'}
          onClick={() => setActiveTab('due_today')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
            activeTab === 'due_today'
              ? 'bg-amber-100 text-amber-800 shadow-sm'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <span>📅 今日待复习</span>
          <span
            className={`min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-xs font-semibold ${
              activeTab === 'due_today' ? 'bg-amber-200 text-amber-900' : 'bg-gray-200 text-gray-700'
            }`}
          >
            {dueTodayList.length}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'mastered'}
          onClick={() => setActiveTab('mastered')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
            activeTab === 'mastered'
              ? 'bg-green-100 text-green-800 shadow-sm'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <span>✅ 已掌握</span>
          <span
            className={`min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-xs font-semibold ${
              activeTab === 'mastered' ? 'bg-green-200 text-green-900' : 'bg-gray-200 text-gray-700'
            }`}
          >
            {masteredList.length}
          </span>
        </button>
      </div>

      {activeTab === 'pending' && pendingList.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <button
            type="button"
            onClick={handleGenerateReviewPaper}
            disabled={loadingList || generating}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-3 text-base font-semibold text-white shadow-md transition-all hover:from-amber-600 hover:to-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generating ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                正在生成消灭错题卷…
              </>
            ) : (
              <>
                <Zap className="h-5 w-5" />
                生成消灭错题卷
              </>
            )}
          </button>
          <p className="mt-2 text-center text-sm text-gray-600">
            根据当前 {pendingList.length} 道待攻克错题生成变式练习
          </p>
        </div>
      )}

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {loadingList ? (
          <div className="flex min-h-[200px] items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : displayList.length === 0 ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 py-12 text-gray-500">
            <BookOpen className="h-12 w-12 text-gray-300" />
            <p>
              {activeTab === 'pending'
                ? (filterKnowledgePoint ? '该知识点下暂无待攻克错题' : '暂无待攻克错题，点击「添加错题」开始')
                : activeTab === 'due_today'
                  ? '今日暂无待复习错题'
                  : '暂无已掌握记录'}
            </p>
            {activeTab === 'pending' && !filterKnowledgePoint && (
              <button
                type="button"
                onClick={openCreateModal}
                className="mt-2 text-sm text-blue-600 hover:underline"
              >
                添加错题
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {displayList.map((m) => (
              <MistakeCard
                key={m.id}
                mistake={m}
                isPending={activeTab === 'pending' || activeTab === 'due_today'}
                deletingId={deletingId}
                reviewingId={reviewingId}
                masteringId={masteringId}
                addingToHomeworkId={addingToHomeworkId}
                onReview={handleReview}
                onMaster={handleMaster}
                onDelete={handleDelete}
                onAddToHomework={handleAddToTodayHomework}
                onAskAI={() => {
                  const text = (m.content ?? '').trim()
                  const sol = (m.solution ?? '').trim()
                  navigate('/chat', {
                    state: {
                      contextQuestion: sol ? `${text}\n解析/答案：${sol}` : text,
                    },
                  })
                }}
              />
            ))}
          </ul>
        )}
      </section>

      {modalOpen && (
        <CreateMistakeModal
          predefinedTopics={PREDEFINED_TOPICS}
          topic={modalTopic}
          topicCustom={modalTopicCustom}
          source={modalSource}
          content={modalContent}
          solution={modalSolution}
          onTopicChange={setModalTopic}
          onTopicCustomChange={setModalTopicCustom}
          onSourceChange={setModalSource}
          onContentChange={setModalContent}
          onSolutionChange={setModalSolution}
          onSubmit={submitCreateMistake}
          onClose={() => setModalOpen(false)}
          submitting={modalSubmitting}
        />
      )}
    </div>
  )
}

function MistakeCard({
  mistake: m,
  isPending,
  deletingId,
  reviewingId,
  masteringId,
  addingToHomeworkId,
  onReview,
  onMaster,
  onDelete,
  onAddToHomework,
  onAskAI,
}) {
  const content = (m.content ?? '').trim() || '（无题干）'
  const reviewCount = m.review_count ?? 0
  const isHard = reviewCount > 3
  const isDeleting = deletingId != null && Number(m.id) === Number(deletingId)
  const isReviewing = reviewingId != null && Number(m.id) === Number(reviewingId)
  const isMastering = masteringId != null && Number(m.id) === Number(masteringId)

  const topicLabel = (m.topic ?? '').trim() || '未标注'
  return (
    <li className="flex flex-col gap-3 px-6 py-4 transition-colors hover:bg-gray-50/80">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded bg-indigo-100 px-2 py-0.5 font-medium text-indigo-800" title="知识点">
            知识点：{topicLabel}
          </span>
          {m.source && (
            <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-600">{m.source}</span>
          )}
          <span className="text-gray-400">{formatDate(m.created_at)}</span>
        </div>
        <div className="text-base text-gray-800 break-words">
          <Latex>{normalizeLatexForKaTeX(content)}</Latex>
          {Array.isArray(m.options) && m.options.length > 0 && (
            <ul className="mt-2 list-none space-y-1 pl-0 text-gray-700">
              {m.options.map((opt, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0 font-medium">{String.fromCharCode(65 + i)}.</span>
                  <span className="inline">
                    <Latex>{normalizeLatexForKaTeX(getOptionDisplayText(opt))}</Latex>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`text-sm font-medium ${
              isHard ? 'rounded bg-amber-100 px-2 py-0.5 text-amber-800' : 'text-gray-500'
            }`}
          >
            复习次数: {reviewCount}
            {isHard && ' (难题)'}
          </span>
          {m.next_review_date && (
            <span className="text-sm text-gray-500">
              下次复习: {typeof m.next_review_date === 'string' ? m.next_review_date.slice(0, 10) : m.next_review_date}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {isPending && (
          <>
            <button
              type="button"
              onClick={() => onReview(m.id)}
              disabled={isReviewing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {isReviewing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BookMarked className="h-4 w-4" />
              )}
              📖 复习打卡
            </button>
            <button
              type="button"
              onClick={() => onMaster(m.id)}
              disabled={isMastering}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
            >
              {isMastering ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              ✅ 我会了
            </button>
          </>
        )}
        {onAddToHomework && (
          <button
            type="button"
            onClick={() => onAddToHomework(m)}
            disabled={addingToHomeworkId != null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
            title="加入今日作业"
          >
            {addingToHomeworkId === m.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ClipboardList className="h-4 w-4" />
            )}
            加入今日作业
          </button>
        )}
        {onAskAI && (
          <button
            type="button"
            onClick={onAskAI}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
            title="问 AI"
          >
            <MessageCircle className="h-4 w-4" />
            问 AI
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(m.id, !isPending)}
          disabled={isDeleting}
          className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          title="从错题本移除"
        >
          {isDeleting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
        </button>
      </div>
    </li>
  )
}

function CreateMistakeModal({
  predefinedTopics,
  topic,
  topicCustom,
  source,
  content,
  solution,
  onTopicChange,
  onTopicCustomChange,
  onSourceChange,
  onContentChange,
  onSolutionChange,
  onSubmit,
  onClose,
  submitting,
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-mistake-title"
    >
      <div
        className="flex max-h-[90vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:max-w-lg sm:rounded-2xl sm:pt-0"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 sm:px-6">
          <h2 id="create-mistake-title" className="text-lg font-semibold text-gray-900">
            添加错题
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">知识点 (Topic)</label>
              <div className="flex flex-wrap gap-2" role="group" aria-label="选择或输入知识点">
                {predefinedTopics.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onTopicChange(t)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      topic === t
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {topic === '其他' && (
                <input
                  type="text"
                  value={topicCustom}
                  onChange={(e) => onTopicCustomChange(e.target.value)}
                  placeholder="输入自定义知识点"
                  className="mt-2 w-full min-h-[44px] rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">来源 (Source)</label>
              <input
                type="text"
                value={source}
                onChange={(e) => onSourceChange(e.target.value)}
                placeholder="如：试卷批改、课后练习"
                className="w-full min-h-[44px] rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">题目内容 *</label>
              <textarea
                value={content}
                onChange={(e) => onContentChange(e.target.value)}
                placeholder="题干（支持 LaTeX，用 $...$ 包裹）"
                rows={4}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">解析/答案 (选填)</label>
              <textarea
                value={solution}
                onChange={(e) => onSolutionChange(e.target.value)}
                placeholder="解题过程或答案"
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
        <div
          className="flex flex-col gap-2 border-t border-gray-200 px-4 py-3 sm:flex-row sm:justify-end sm:gap-3 sm:px-6"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="min-h-[44px] rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                提交中…
              </>
            ) : (
              '添加'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
