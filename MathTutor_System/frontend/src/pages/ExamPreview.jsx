import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom'
import Latex from 'react-latex-next'
import { normalizeLatexForKaTeX } from '../utils/latex'
import { Printer, ArrowLeft, Save, Loader2, Check, X, ClipboardCheck, MessageCircle, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { getExam, saveExam, gradeExam } from '../services/api'
import KnowledgeCard from '../components/KnowledgeCard'
import StudentSelectorModal from '../components/StudentSelectorModal'
import { useStudent } from '../contexts/StudentContext'
import 'katex/dist/katex.min.css'

const TYPE_ORDER = { 选择: 0, 填空: 1, 解答: 2 }

/** 分类并排序：先按题型 (选择 -> 填空 -> 解答)，同组内按 id 或原索引 */
function classifyAndSortQuestions(questions) {
  const raw = questions || []
  const withMeta = raw.map((q, idx) => ({
    q,
    idx,
    id: q.id != null ? Number(q.id) : null,
  }))
  const choice = []
  const fill = []
  const solution = []
  for (const { q, idx, id } of withMeta) {
    const content = (q.content || '').trim()
    const options = Array.isArray(q.options) ? q.options : []
    const rawIndex = idx
    if (options.length >= 2) {
      choice.push({ q, sortKey: id ?? idx, rawIndex })
    } else if (
      /_{4,}/.test(content) ||
      content.startsWith('填空题：') ||
      content.startsWith('填空题:')
    ) {
      fill.push({ q, sortKey: id ?? idx, rawIndex })
    } else {
      solution.push({ q, sortKey: id ?? idx, rawIndex })
    }
  }
  const bySortKey = (a, b) => a.sortKey - b.sortKey
  choice.sort(bySortKey)
  fill.sort(bySortKey)
  solution.sort(bySortKey)
  return { choice, fill, solution }
}

function stripTypePrefix(text) {
  if (!text || typeof text !== 'string') return text
  const t = text.trim()
  for (const prefix of ['填空题：', '填空题:', '解答题：', '解答题:', '选择题：', '选择题:']) {
    if (t.startsWith(prefix)) return t.slice(prefix.length).trim()
  }
  return t
}

/** 题干若无填空线，末尾补长下划线供书写 */
function ensureFillLine(content) {
  const s = (content || '').trim()
  if (/_{4,}/.test(s)) return s
  return s ? `${s} __________` : '__________'
}

/** 选项是否都较短，可一行 4 个 */
function optionsAreShort(options) {
  if (!Array.isArray(options) || options.length === 0) return false
  const maxLen = 24
  return options.every((opt) => String(opt).length <= maxLen)
}

const defaultLayoutConfig = {
  showAnswer: false,
  paperSize: 'A4',
  columns: 1,
  showHeader: true,
}

const ERROR_TYPE_OPTIONS = ['计算错误', '概念不清', '审题失误', '完全不会']

function buildQuestionTextForChat(q) {
  if (!q) return ''
  const content = (q.content ?? '').trim()
  const options = Array.isArray(q.options) ? q.options : []
  const optStr = options.length
    ? '\n选项：' + options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')
    : ''
  const answer = (q.answer ?? '').trim()
  return content + optStr + (answer ? '\n答案：' + answer : '')
}

export default function ExamPreview() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [exam, setExam] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [layoutConfig, setLayoutConfig] = useState(defaultLayoutConfig)
  const [composeTitle, setComposeTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [isGrading, setIsGrading] = useState(false)
  const [gradingResults, setGradingResults] = useState({})
  const [gradingErrorTypes, setGradingErrorTypes] = useState({})
  const [hasSubmittedGrades, setHasSubmittedGrades] = useState(false)
  const [submittingGrade, setSubmittingGrade] = useState(false)
  const questionRefs = useRef([])

  const { currentStudent } = useStudent()
  const showAnalysis = layoutConfig.showAnswer
  const includeAnswerPage = layoutConfig.showAnswer

  const isComposeMode = id === 'compose' && location.state?.composeQuestions != null
  const composeQuestions = location.state?.composeQuestions ?? []

  useEffect(() => {
    if (id === 'compose' && location.state?.composeQuestions != null) {
      const qs = location.state.composeQuestions
      const title = (location.state.composeTitle ?? '组卷预览').trim() || '组卷预览'
      setExam({ title, questions: qs })
      setComposeTitle(title)
      setLoading(false)
      setError(null)
      return
    }
    if (!id) return
    setLoading(true)
    setError(null)
    getExam(Number(id))
      .then((res) => setExam(res.data))
      .catch((err) => setError(err.response?.data?.detail || err.message || '加载失败'))
      .finally(() => setLoading(false))
  }, [id])

  const isLessonPlan = useMemo(() => {
    const q = exam?.questions
    return (
      exam != null &&
      q != null &&
      typeof q === 'object' &&
      !Array.isArray(q) &&
      'knowledge_card' in q
    )
  }, [exam])

  const lessonPlanData = isLessonPlan ? exam.questions : null
  const questionsList = useMemo(() => {
    if (!exam?.questions) return []
    const q = exam.questions
    if (Array.isArray(q)) return q
    if (q && typeof q === 'object' && Array.isArray(q.questions)) return q.questions
    return []
  }, [exam?.questions])

  const displayTitle = isComposeMode ? (composeTitle || '组卷预览') : (exam?.title || '未命名试卷')

  const handleSaveCompose = async () => {
    if (!isComposeMode || questionsList.length === 0) return
    setSaving(true)
    try {
      const payload = {
        title: (composeTitle || '组卷预览').trim() || '组卷预览',
        questions: questionsList.map((q) => ({
          content: q.content ?? '',
          options: q.options ?? [],
          answer: q.answer ?? '',
          analysis: q.analysis ?? '',
        })),
      }
      const { data } = await saveExam(payload)
      const examId = data?.id
      if (examId != null) {
        toast.success('试卷已保存')
        navigate(`/exams/${examId}`, { replace: true })
      } else {
        toast.error('保存成功但未返回试卷 ID')
      }
    } catch (err) {
      const msg = err.response?.data?.detail ?? err.message
      toast.error(typeof msg === 'string' ? msg : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const { choice, fill, solution } = useMemo(
    () => classifyAndSortQuestions(questionsList),
    [questionsList]
  )

  /** 批改用：扁平题目列表（含 globalIndex、key、rawIndex 用于提交），用于 Quick Mark 与提交 */
  const gradingQuestions = useMemo(() => {
    const list = []
    let idx = 0
    for (const { q, rawIndex } of choice) {
      list.push({
        globalIndex: idx,
        key: q.id != null ? String(q.id) : `i-${idx}`,
        rawIndex: rawIndex ?? idx,
        q,
      })
      idx += 1
    }
    for (const { q, rawIndex } of fill) {
      list.push({
        globalIndex: idx,
        key: q.id != null ? String(q.id) : `i-${idx}`,
        rawIndex: rawIndex ?? idx,
        q,
      })
      idx += 1
    }
    for (const { q, rawIndex } of solution) {
      list.push({
        globalIndex: idx,
        key: q.id != null ? String(q.id) : `i-${idx}`,
        rawIndex: rawIndex ?? idx,
        q,
      })
      idx += 1
    }
    return list
  }, [choice, fill, solution])

  const handleMark = useCallback(
    (key, isCorrect, errorType = '审题失误') => {
      setGradingResults((prev) => ({ ...prev, [key]: isCorrect }))
      if (!isCorrect) {
        setGradingErrorTypes((prev) => ({ ...prev, [key]: errorType }))
      }
      const nextIdx = gradingQuestions.findIndex((item) => item.key === key) + 1
      if (nextIdx < gradingQuestions.length && questionRefs.current[nextIdx]) {
        questionRefs.current[nextIdx].scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    },
    [gradingQuestions]
  )

  const setErrorType = useCallback((key, errorType) => {
    setGradingErrorTypes((prev) => ({ ...prev, [key]: errorType }))
  }, [])

  const handleSubmitGrade = useCallback(async () => {
    const examId = isComposeMode ? null : exam?.id
    if (!examId || !gradingQuestions.length) return

    const results = gradingQuestions
      .filter((item) => gradingResults[item.key] !== undefined)
      .map((item) => {
        const isCorrect = gradingResults[item.key]
        return {
          question_index: item.rawIndex,
          is_correct: isCorrect,
          ...(isCorrect === false && {
            error_type: ERROR_TYPE_OPTIONS.includes(gradingErrorTypes[item.key])
              ? gradingErrorTypes[item.key]
              : '审题失误',
          }),
        }
      })
    if (results.length === 0) {
      toast.error('请先批改题目')
      return
    }

    const studentId = currentStudent?.id ?? exam?.student_id
    if (studentId == null) {
      toast.error('请先在侧边栏选择一名学生，再提交成绩')
      return
    }

    setSubmittingGrade(true)
    try {
      await gradeExam(examId, {
        results,
        student_id: studentId,
      })
      setHasSubmittedGrades(true)
      setIsGrading(false)
      toast.success('批改完成！错题本已更新')
      navigate('/knowledge-graph', { state: { fromGrading: true, studentId } })
    } catch (err) {
      const msg = err.response?.data?.detail ?? err.message
      toast.error(typeof msg === 'string' ? msg : '提交失败')
    } finally {
      setSubmittingGrade(false)
    }
  }, [exam, currentStudent, isComposeMode, gradingQuestions, gradingResults, gradingErrorTypes, navigate])

  const gradingCorrectCount = useMemo(
    () => gradingQuestions.filter((item) => gradingResults[item.key] === true).length,
    [gradingQuestions, gradingResults]
  )
  const gradingTotal = gradingQuestions.length

  /** 强力清洗答案：去除开头的题号/选项前缀，避免双重序号（如 "1. 1. 6x^3" -> "6x^3"） */
  const formatAnswerKey = (text) => {
    if (text == null || String(text).trim() === '') return ''
    let str = String(text).trim()
    const prefixRe = /^(\d+[\.\、．\s\t]+|\(\d+\)\s*|（\d+）\s*|[A-Za-z][\.\、．]\s*)+/
    let prev = ''
    while (prev !== str) {
      prev = str
      str = str.replace(prefixRe, '').trim()
    }
    return str || prev
  }

  /** 清洗答案并强制用 $ 包裹，使无定界符的 LaTeX（如 \frac{b}{6}）也能被渲染 */
  const ensureMathDelimiters = (text) => {
    if (text == null) return '—'
    const cleanText = formatAnswerKey(text)
    if (!cleanText) return '—'
    const stripped = cleanText.replace(/^\$+|\$+$/g, '').trim()
    if (!stripped) return '—'
    return `$${stripped}$`
  }

  const handlePrint = () => window.print()

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-gray-600">加载试卷中…</p>
      </div>
    )
  }
  if (!isComposeMode && (error || !exam)) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-red-700">
        <p>{error || '试卷不存在'}</p>
        <Link to="/smart-gen" className="mt-2 inline-block text-blue-600 hover:underline">
          返回智能出题
        </Link>
      </div>
    )
  }

  const title = displayTitle

  const canGrade = !isComposeMode && exam?.id != null && gradingQuestions.length > 0

  const assignTitle = displayTitle
  const assignQuestions = isComposeMode ? questionsList : exam?.questions
  const canAssign = assignQuestions != null && (Array.isArray(assignQuestions) ? assignQuestions.length > 0 : true)

  const handleAssignConfirm = async (selected, customTitle) => {
    if (!selected?.length || !assignQuestions) return
    const finalTitle = (customTitle && customTitle.trim()) || assignTitle || '未命名作业'
    try {
      await Promise.all(
        selected.map((s) =>
          saveExam({
            title: finalTitle,
            student_id: s.id,
            questions: assignQuestions,
          })
        )
      )
      const n = selected.length
      const names = selected.map((s) => s.name).join('，')
      toast.success(`已向 ${n} 位学生布置作业：${names}`)
      setShowAssignModal(false)
    } catch (err) {
      toast.error(err.response?.data?.detail || '布置失败')
      throw err
    }
  }

  return (
    <>
      <StudentSelectorModal
        open={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        onConfirm={handleAssignConfirm}
        defaultTitle={assignTitle || ''}
        allowEditTitle
      />
      {/* 批改状态：已批改徽章 / 开始批改按钮（非组卷、有题目时） */}
      {canGrade && (
        <div className="no-print mb-3 sm:mb-4 flex items-center gap-2 sm:gap-3">
          {hasSubmittedGrades ? (
            <span className="inline-flex items-center gap-1.5 sm:gap-2 rounded-full bg-green-100 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-green-800">
              <ClipboardCheck className="h-4 w-4 shrink-0" />
              已批改
            </span>
          ) : !isGrading ? (
            <button
              type="button"
              onClick={() => setIsGrading(true)}
              className="inline-flex items-center gap-1.5 sm:gap-2 rounded-lg bg-indigo-600 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-white hover:bg-indigo-700 active:bg-indigo-800 touch-manipulation"
            >
              <ClipboardCheck className="h-4 w-4 shrink-0" />
              开始批改
            </button>
          ) : null}
        </div>
      )}

      {/* 排版设置工具栏：移动端紧凑、可换行 */}
      <div className="no-print LayoutToolbar mb-3 sm:mb-4 flex flex-wrap items-center gap-2 sm:gap-3 rounded-xl border border-gray-200 bg-white px-3 sm:px-4 py-2.5 sm:py-3 shadow-sm">
        {isGrading ? (
          <span className="text-xs sm:text-sm font-medium text-indigo-600">批改中 · 点击题目右侧对/错快速录入</span>
        ) : (
          <>
            <span className="text-xs sm:text-sm font-medium text-gray-600 shrink-0">排版</span>
            <div className="flex items-center gap-0.5 sm:gap-1 rounded-lg border border-gray-200 p-0.5">
              <button
                type="button"
                onClick={() => setLayoutConfig((c) => ({ ...c, showAnswer: false }))}
                className={`rounded-md px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors touch-manipulation ${
                  !layoutConfig.showAnswer
                    ? 'bg-blue-600 text-white'
                    : 'bg-transparent text-gray-600 hover:bg-gray-100'
                }`}
              >
                学生版
              </button>
              <button
                type="button"
                onClick={() => setLayoutConfig((c) => ({ ...c, showAnswer: true }))}
                className={`rounded-md px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors touch-manipulation ${
                  layoutConfig.showAnswer
                    ? 'bg-indigo-600 text-white'
                    : 'bg-transparent text-gray-600 hover:bg-gray-100'
                }`}
              >
                教师版
              </button>
            </div>
            <div className="flex items-center gap-0.5 sm:gap-1 rounded-lg border border-gray-200 p-0.5">
              <button
                type="button"
                onClick={() => setLayoutConfig((c) => ({ ...c, columns: 1 }))}
                className={`rounded-md px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors touch-manipulation ${
                  layoutConfig.columns === 1
                    ? 'bg-blue-600 text-white'
                    : 'bg-transparent text-gray-600 hover:bg-gray-100'
                }`}
              >
                单栏
              </button>
              <button
                type="button"
                onClick={() => setLayoutConfig((c) => ({ ...c, columns: 2 }))}
                className={`rounded-md px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors touch-manipulation ${
                  layoutConfig.columns === 2
                    ? 'bg-blue-600 text-white'
                    : 'bg-transparent text-gray-600 hover:bg-gray-100'
                }`}
              >
                双栏
              </button>
            </div>
          </>
        )}
        <button
          type="button"
          onClick={handlePrint}
          className="flex items-center gap-1.5 sm:gap-2 rounded-lg bg-blue-600 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 touch-manipulation"
        >
          <Printer className="h-4 w-4 shrink-0" />
          打印/下载PDF
        </button>
      </div>

      {/* 组卷模式：可编辑标题 */}
      {isComposeMode && (
        <div className="no-print mb-3 sm:mb-4 rounded-xl border border-gray-200 bg-white p-3 sm:p-4 shadow-sm">
          <label className="mb-2 block text-xs sm:text-sm font-medium text-gray-700">试卷标题</label>
          <input
            type="text"
            value={composeTitle}
            onChange={(e) => setComposeTitle(e.target.value)}
            placeholder="如：期末精选压轴卷"
            className="w-full max-w-md rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      )}

      {/* 底部工具栏：移动端留安全区、缩小间距 */}
      <div className="no-print fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-2 right-2 sm:left-1/2 sm:right-auto z-20 flex -translate-x-0 sm:-translate-x-1/2 flex-wrap items-center justify-center gap-2 sm:gap-4 border border-gray-300 bg-white px-3 sm:px-5 py-2.5 sm:py-3 shadow-lg rounded-xl max-w-lg sm:max-w-none mx-auto">
        {isGrading ? (
          <>
            <span className="text-xs sm:text-sm font-medium text-gray-700">
              得分: <span className="font-bold text-indigo-600">{gradingCorrectCount}</span> / {gradingTotal}
            </span>
            <button
              type="button"
              onClick={handleSubmitGrade}
              disabled={submittingGrade}
              className="flex items-center gap-1.5 sm:gap-2 rounded-lg bg-indigo-600 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 touch-manipulation"
            >
              {submittingGrade ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <ClipboardCheck className="h-4 w-4 shrink-0" />}
              提交成绩
            </button>
            <button
              type="button"
              onClick={() => setIsGrading(false)}
              className="rounded-lg border border-gray-300 bg-white px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-100 touch-manipulation"
            >
              退出批改
            </button>
            <Link
              to="/exams"
              className="flex items-center gap-1.5 sm:gap-2 rounded-lg border border-gray-300 bg-white px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-black hover:bg-gray-100 touch-manipulation"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              返回列表
            </Link>
          </>
        ) : (
          <>
            {canAssign && (
              <button
                type="button"
                onClick={() => setShowAssignModal(true)}
                className="flex items-center gap-1.5 sm:gap-2 rounded-lg bg-indigo-600 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-white hover:bg-indigo-700 touch-manipulation"
              >
                <Send className="h-4 w-4 shrink-0" />
                布置作业
              </button>
            )}
            {isComposeMode && (
              <button
                type="button"
                onClick={handleSaveCompose}
                disabled={saving}
                className="flex items-center gap-1.5 sm:gap-2 bg-emerald-600 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 rounded-lg touch-manipulation"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <Save className="h-4 w-4 shrink-0" />}
                保存试卷
              </button>
            )}
            <Link
              to="/exams"
              className="flex items-center gap-1.5 sm:gap-2 border border-gray-300 bg-white px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-black hover:bg-gray-100 rounded-lg touch-manipulation"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              返回列表
            </Link>
          </>
        )}
      </div>

      {/* 试卷区域：移动端缩小内边距、纸张自适应；底部留空避免被固定栏遮挡 */}
      <div
        className="exam-paper-print-area min-h-screen bg-gray-400 py-4 sm:py-8 pb-24 sm:pb-8 print:pb-0 print:py-0 print:bg-white"
        data-show-answer={layoutConfig.showAnswer ? 'true' : 'false'}
        data-paper-size={layoutConfig.paperSize}
      >
        {/* A4/A3 白纸容器：桌面固定宽度，移动端 100% 宽（见 index.css） */}
        <div
          className={`exam-paper-container relative font-serif text-black bg-white ${layoutConfig.paperSize === 'A3' ? 'a3-paper' : 'a4-paper'}`}
        >
          {/* A3 模式：左侧密封线 */}
          {layoutConfig.paperSize === 'A3' && (
            <div className="exam-seal-line absolute left-0 top-0 bottom-0 w-10 flex items-center justify-center border-r-2 border-black print:border-black">
              <span className="text-xs font-semibold whitespace-nowrap" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                密封线
              </span>
            </div>
          )}

          <div className={layoutConfig.paperSize === 'A3' ? 'pl-4' : ''}>
          {/* 试卷抬头：学校/班级/姓名/考号 */}
          <header className="mb-4 sm:mb-6 text-center">
            <h1 className="mb-4 sm:mb-6 text-xl sm:text-2xl font-bold font-serif tracking-tight">{title}</h1>
            {layoutConfig.showHeader && (
              <div className="flex flex-wrap justify-between items-center gap-1 sm:gap-2 border-b-2 border-black pb-2 mb-6 sm:mb-8 text-xs sm:text-sm">
                {isLessonPlan ? (
                  <span>课后辅导讲义</span>
                ) : (
                  <span>试卷类型：A卷</span>
                )}
                <span>{isLessonPlan ? '建议用时：60分钟' : '考试时间：90分钟'}</span>
                <span className="flex flex-wrap gap-x-4 gap-y-0">
                  学校 ______________  班级 ______________  姓名 ______________  考号 ______________
                </span>
              </div>
            )}
          </header>

          {/* 讲义模式：Section 1 知识要点 */}
          {isLessonPlan && lessonPlanData?.knowledge_card && (
            <section className="avoid-break mb-8">
              <h2 className="mb-4 text-lg font-bold">一、知识要点</h2>
              <KnowledgeCard data={lessonPlanData.knowledge_card} />
            </section>
          )}

          {/* 讲义模式：Section 2 典型例题（打印时展开全部解析，break-inside: avoid） */}
          {isLessonPlan && Array.isArray(lessonPlanData?.examples) && lessonPlanData.examples.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-4 text-lg font-bold">二、典型例题</h2>
              <ul className="space-y-6">
                {lessonPlanData.examples.map((ex, i) => {
                  const content = ex.content ?? ''
                  const analysis = String(ex.analysis ?? '').replace(/\\n/g, '\n')
                  return (
                    <li key={i} className="avoid-break rounded-lg border border-gray-300 bg-white p-4 print:border-gray-400 print:bg-white">
                      <p className="text-base text-gray-800 mb-2">
                        <span className="font-semibold">例 {i + 1}.</span> <Latex>{normalizeLatexForKaTeX(content)}</Latex>
                      </p>
                      {analysis && (
                        <div className="analysis-section mt-3 border-t border-blue-200 pt-3 text-sm text-blue-700 print:text-blue-800 print:border-blue-300">
                          <span className="font-semibold">解析：</span>
                          <div className="mt-1 leading-relaxed whitespace-pre-line">
                            <Latex>{normalizeLatexForKaTeX(analysis)}</Latex>
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {/* 巩固练习 / 试卷题目：Section 3（讲义）或 一/二/三（纯试卷） */}
          {isLessonPlan && (choice.length > 0 || fill.length > 0 || solution.length > 0) && (
            <h2 className="mb-4 text-lg font-bold">三、巩固练习</h2>
          )}

          {/* 一、选择题 */}
          {choice.length > 0 && (
            <section className="avoid-break mb-8">
              <h2 className="mb-4 text-lg font-bold">
                一、选择题（共{choice.length}题）
              </h2>
              <div className={`grid gap-6 sm:gap-8 ${layoutConfig.columns === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'} gap-y-4`}>
                {choice.map(({ q }, i) => {
                  const globalIndex = i
                  const item = gradingQuestions[globalIndex]
                  const key = item?.key ?? `choice-${i}`
                  const opts = Array.isArray(q.options) ? q.options : []
                  const short = optionsAreShort(opts)
                  const marked = gradingResults[key]
                  return (
                    <div
                      key={i}
                      ref={(el) => {
                        if (el) questionRefs.current[globalIndex] = el
                      }}
                      className={`question-item avoid-break text-base ${isGrading ? 'flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4' : ''}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p>
                          <span className="font-semibold">{i + 1}.</span>{' '}
                          <Latex>{normalizeLatexForKaTeX(stripTypePrefix(q.content))}</Latex>
                        </p>
                        {opts.length > 0 && (
                          <div
                            className={
                              short
                                ? 'mt-1 flex flex-wrap justify-between gap-x-2 gap-y-1 text-sm'
                                : 'mt-2 grid grid-cols-2 gap-y-1 text-sm'
                            }
                          >
                            {opts.map((opt, j) => (
                              <span key={j}>
                                <Latex>{normalizeLatexForKaTeX(opt)}</Latex>
                              </span>
                            ))}
                          </div>
                        )}
                        {!isGrading && showAnalysis && q.analysis && (
                          <div className="analysis-section mt-2 border-t border-blue-200 pt-2 text-sm text-blue-700 print:text-blue-800">
                            <span className="font-semibold">解析：</span>
                            <Latex>{normalizeLatexForKaTeX((q.analysis ?? '').replace(/\\n/g, '\n'))}</Latex>
                          </div>
                        )}
                        {!isGrading && (
                          <button
                            type="button"
                            onClick={() => navigate('/chat', { state: { contextQuestion: buildQuestionTextForChat(q) } })}
                            className="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline print:hidden"
                          >
                            <MessageCircle className="h-4 w-4" />
                            问 AI
                          </button>
                        )}
                      </div>
                      {isGrading && (
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleMark(key, true)}
                              className={`flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                                marked === true
                                  ? 'bg-green-600 text-white'
                                  : 'bg-green-100 text-green-700 hover:bg-green-200'
                              }`}
                            >
                              <Check className="h-5 w-5" />
                              对
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMark(key, false)}
                              className={`flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                                marked === false
                                  ? 'bg-red-600 text-white'
                                  : 'bg-red-100 text-red-700 hover:bg-red-200'
                              }`}
                            >
                              <X className="h-5 w-5" />
                              错
                            </button>
                          </div>
                          {marked === false && (
                            <div className="flex flex-wrap justify-end gap-1">
                              <span className="text-xs text-gray-500">错因：</span>
                              {ERROR_TYPE_OPTIONS.map((opt) => (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => setErrorType(key, opt)}
                                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                                    (gradingErrorTypes[key] ?? '审题失误') === opt
                                      ? 'bg-indigo-600 text-white'
                                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                  }`}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* 二、填空题 */}
          {fill.length > 0 && (
            <section className="avoid-break mb-8">
              <h2 className="mb-4 text-lg font-bold">
                二、填空题（共{fill.length}题）
              </h2>
              <div className={`grid gap-6 sm:gap-8 ${layoutConfig.columns === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'} gap-y-6`}>
                {fill.map(({ q }, i) => {
                  const globalIndex = choice.length + i
                  const item = gradingQuestions[globalIndex]
                  const key = item?.key ?? `fill-${i}`
                  const marked = gradingResults[key]
                  return (
                    <div
                      key={i}
                      ref={(el) => {
                        if (el) questionRefs.current[globalIndex] = el
                      }}
                      className={`question-item avoid-break text-base ${isGrading ? 'flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4' : ''}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p>
                          <span className="font-semibold">{i + 1}.</span>{' '}
                          <Latex>{normalizeLatexForKaTeX(ensureFillLine(stripTypePrefix(q.content)))}</Latex>
                        </p>
                        {!isGrading && showAnalysis && q.analysis && (
                          <div className="analysis-section mt-2 border-t border-blue-200 pt-2 text-sm text-blue-700 print:text-blue-800">
                            <span className="font-semibold">解析：</span>
                            <Latex>{normalizeLatexForKaTeX((q.analysis ?? '').replace(/\\n/g, '\n'))}</Latex>
                          </div>
                        )}
                        {!isGrading && (
                          <button
                            type="button"
                            onClick={() => navigate('/chat', { state: { contextQuestion: buildQuestionTextForChat(q) } })}
                            className="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline print:hidden"
                          >
                            <MessageCircle className="h-4 w-4" />
                            问 AI
                          </button>
                        )}
                      </div>
                      {isGrading && (
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleMark(key, true)}
                              className={`flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                                marked === true ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'
                              }`}
                            >
                              <Check className="h-5 w-5" />
                              对
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMark(key, false)}
                              className={`flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                                marked === false ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700 hover:bg-red-200'
                              }`}
                            >
                              <X className="h-5 w-5" />
                              错
                            </button>
                          </div>
                          {marked === false && (
                            <div className="flex flex-wrap justify-end gap-1">
                              <span className="text-xs text-gray-500">错因：</span>
                              {ERROR_TYPE_OPTIONS.map((opt) => (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => setErrorType(key, opt)}
                                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                                    (gradingErrorTypes[key] ?? '审题失误') === opt
                                      ? 'bg-indigo-600 text-white'
                                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                  }`}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* 三、解答题：学生版留白书写区(h-32/h-40)，教师版显示解析(蓝字) */}
          {solution.length > 0 && (
            <section className="avoid-break">
              <h2 className="mb-4 text-lg font-bold">
                三、解答题（共{solution.length}题）
              </h2>
              <div className={`grid gap-6 sm:gap-8 ${layoutConfig.columns === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                {solution.map(({ q }, i) => {
                  const globalIndex = choice.length + fill.length + i
                  const item = gradingQuestions[globalIndex]
                  const key = item?.key ?? `solution-${i}`
                  const marked = gradingResults[key]
                  const isLast = i === solution.length - 1
                  const blankHeight = !showAnalysis ? (isLast ? 'h-40' : 'h-32') : 'min-h-[80px]'
                  return (
                    <div
                      key={i}
                      ref={(el) => {
                        if (el) questionRefs.current[globalIndex] = el
                      }}
                      className={`question-item avoid-break border-b border-gray-300 pb-4 ${isGrading ? 'flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4' : ''}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-base">
                          <span className="font-semibold">{i + 1}.</span>{' '}
                          <Latex>{normalizeLatexForKaTeX(stripTypePrefix(q.content))}</Latex>
                        </p>
                        <div className={`mt-4 w-full border-b border-dashed border-gray-400 ${blankHeight}`} />
                        {!isGrading && showAnalysis && q.analysis && (
                          <div className="analysis-section mt-2 border-t border-blue-200 pt-2 text-sm text-blue-700 print:text-blue-800">
                            <span className="font-semibold">解析：</span>
                            <Latex>{normalizeLatexForKaTeX((q.analysis ?? '').replace(/\\n/g, '\n'))}</Latex>
                          </div>
                        )}
                        {!isGrading && (
                          <button
                            type="button"
                            onClick={() => navigate('/chat', { state: { contextQuestion: buildQuestionTextForChat(q) } })}
                            className="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline print:hidden"
                          >
                            <MessageCircle className="h-4 w-4" />
                            问 AI
                          </button>
                        )}
                      </div>
                      {isGrading && (
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleMark(key, true)}
                              className={`flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                                marked === true ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'
                              }`}
                            >
                              <Check className="h-5 w-5" />
                              对
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMark(key, false)}
                              className={`flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                                marked === false ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700 hover:bg-red-200'
                              }`}
                            >
                              <X className="h-5 w-5" />
                              错
                            </button>
                          </div>
                          {marked === false && (
                            <div className="flex flex-wrap justify-end gap-1">
                              <span className="text-xs text-gray-500">错因：</span>
                              {ERROR_TYPE_OPTIONS.map((opt) => (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => setErrorType(key, opt)}
                                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                                    (gradingErrorTypes[key] ?? '审题失误') === opt
                                      ? 'bg-indigo-600 text-white'
                                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                  }`}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {choice.length === 0 && fill.length === 0 && solution.length === 0 && (
            <p className="py-8 text-center text-black">暂无题目</p>
          )}

          {/* 答案速查页：仅当「包含答案页」开启时渲染 */}
          {includeAnswerPage && (choice.length > 0 || fill.length > 0 || solution.length > 0) && (
            <>
              <div className="force-break" />
              <section className="answer-section mt-8">
                <h2 className="mb-6 text-xl font-bold font-serif">
                  {isLessonPlan ? '巩固练习 参考答案与解析' : '参考答案与解析'}
                </h2>

                {choice.length > 0 && (
                  <div className="avoid-break mb-8">
                    <h3 className="mb-3 text-base font-bold">一、选择题答案</h3>
                    <div className="grid grid-cols-5 gap-x-4 gap-y-2 border border-black text-sm">
                      {choice.map(({ q }, i) => (
                        <div key={i} className="flex items-center gap-2 border-b border-gray-300 py-1 last:border-b-0">
                          <span className="font-semibold">{i + 1}.</span>
                          <div className="min-w-[50px] flex-1 border-b border-gray-300 px-1 text-center">
                            <Latex>{normalizeLatexForKaTeX(ensureMathDelimiters(q.answer))}</Latex>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {fill.length > 0 && (
                  <div className="avoid-break mb-8">
                    <h3 className="mb-3 text-base font-bold">二、填空题答案</h3>
                    <div className="grid grid-cols-4 gap-4 text-sm">
                      {fill.map(({ q }, i) => (
                        <div key={i} className="flex items-start gap-1">
                          <span className="font-bold text-gray-700 whitespace-nowrap">{i + 1}.</span>
                          <div className="border-b border-gray-300 px-1 min-w-[50px] text-center min-w-0 flex-1">
                            <Latex>{normalizeLatexForKaTeX(ensureMathDelimiters(q.answer))}</Latex>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {solution.length > 0 && (
                  <div className="avoid-break">
                    <h3 className="mb-3 text-base font-bold">三、解答题解析</h3>
                    <div className="flex flex-col gap-6">
                      {solution.map(({ q }, i) => (
                        <div key={i} className="avoid-break border-b border-gray-300 pb-4">
                          <p className="mb-2 font-semibold text-base">
                            {i + 1}. <Latex>{normalizeLatexForKaTeX(stripTypePrefix(q.content))}</Latex>
                          </p>
                          <div className="text-sm">
                            <span className="font-semibold">答案：</span>
                            <Latex>{normalizeLatexForKaTeX(ensureMathDelimiters(q.answer))}</Latex>
                          </div>
                          {q.analysis && (
                            <div className="analysis-section mt-2 text-sm text-blue-700 print:text-blue-800">
                              <span className="font-semibold">解析：</span>
                              <Latex>{normalizeLatexForKaTeX((q.analysis ?? '').replace(/\\n/g, '\n'))}</Latex>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </>
          )}
          </div>
        </div>
      </div>

      <style>{`
        /* A3 纸张（屏幕预览） */
        .a3-paper {
          width: 297mm;
          min-height: 420mm;
          padding: 20mm;
          margin: 0 auto;
          background: white;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }
        @media print {
          body * { visibility: hidden; }
          aside, .no-print, [class*="print:hidden"] { visibility: hidden !important; display: none !important; }
          .exam-paper-print-area, .exam-paper-print-area * { visibility: visible; }
          .exam-paper-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            min-height: 100%;
            background: white;
            padding: 0;
            margin: 0;
          }
          .avoid-break { break-inside: avoid; page-break-inside: avoid; }
          /* 学生版打印：隐藏解析与答案页 */
          .exam-paper-print-area[data-show-answer="false"] .analysis-section,
          .exam-paper-print-area[data-show-answer="false"] .answer-section {
            display: none !important;
            visibility: hidden !important;
          }
          .a3-paper { width: 297mm; min-height: 420mm; }
        }
      `}</style>
      {layoutConfig.paperSize === 'A3' && (
        <style>{`@media print { @page { size: A3 portrait; margin: 20mm; } }`}</style>
      )}
    </>
  )
}
