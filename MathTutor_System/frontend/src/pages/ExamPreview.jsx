import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Bot,
  Check,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Loader2,
  MessageCircle,
  Printer,
  Save,
  Send,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { getExam, gradeExam, saveExam } from '../services/api'
import KnowledgeCard from '../components/KnowledgeCard'
import StudentSelectorModal from '../components/StudentSelectorModal'
import { useStudent } from '../contexts/StudentContext'
import { EmptyState, ErrorState, LoadingState, PageHeader, PageShell, SectionCard, StatusBadge } from '../components/UiV2'
import 'katex/dist/katex.min.css'

const DEFAULT_LAYOUT = {
  showAnswer: false,
  paperSize: 'A4',
  columns: 1,
  showHeader: true,
}

const ERROR_TYPE_OPTIONS = ['计算错误', '概念不清', '审题失误', '完全不会']

function normalizeType(question) {
  const type = String(question?.question_type ?? question?.type ?? '').trim()
  if (type.includes('选择') || (Array.isArray(question?.options) && question.options.length >= 2)) return '选择'
  if (type.includes('解答') || type.includes('计算') || type.includes('应用')) return '解答'
  return '填空'
}

function getQuestions(exam) {
  const questions = exam?.questions
  if (Array.isArray(questions)) return questions
  if (questions && typeof questions === 'object' && Array.isArray(questions.questions)) return questions.questions
  return []
}

function isLessonPlan(exam) {
  const questions = exam?.questions
  return questions && typeof questions === 'object' && !Array.isArray(questions) && 'knowledge_card' in questions
}

function buildQuestionTextForChat(question) {
  const content = String(question?.content ?? '').trim()
  const options = Array.isArray(question?.options)
    ? question.options.map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`).join('\n')
    : ''
  const answer = String(question?.answer ?? '').trim()
  return [content, options && `选项：\n${options}`, answer && `答案：${answer}`].filter(Boolean).join('\n')
}

function QuestionPreview({ question, index, showAnswer, grading, marked, errorType, onMark, onErrorType, onAskAI }) {
  const options = Array.isArray(question.options) ? question.options : []
  const type = normalizeType(question)
  return (
    <article className={`v2-preview-question ${marked === true ? 'correct' : marked === false ? 'wrong' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge tone="primary">第 {index + 1} 题</StatusBadge>
            <StatusBadge tone="neutral">{type}</StatusBadge>
            {question.difficulty && <StatusBadge tone="warning">{question.difficulty}</StatusBadge>}
            {question.knowledge_point && <span className="text-xs font-bold text-slate-400">{question.knowledge_point}</span>}
          </div>
          <p className="whitespace-pre-wrap text-sm font-black leading-7 text-slate-100">{question.content || '未填写题干'}</p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 print:hidden">
          {!grading && (
            <button type="button" className="v2-btn-secondary" onClick={onAskAI}>
              <MessageCircle className="h-4 w-4" />
              问 AI
            </button>
          )}
          {grading && (
            <>
              <button type="button" className={`v2-mark-button ${marked === true ? 'active-correct' : ''}`} onClick={() => onMark(true)}>
                <Check className="h-4 w-4" />
                对
              </button>
              <button type="button" className={`v2-mark-button ${marked === false ? 'active-wrong' : ''}`} onClick={() => onMark(false)}>
                <X className="h-4 w-4" />
                错
              </button>
            </>
          )}
        </div>
      </div>

      {options.length > 0 && (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {options.map((option, optionIndex) => (
            <div key={`${option}-${optionIndex}`} className="v2-preview-option">
              <span>{String.fromCharCode(65 + optionIndex)}</span>
              <p>{option}</p>
            </div>
          ))}
        </div>
      )}

      {grading && marked === false && (
        <div className="mt-3 flex flex-wrap items-center gap-2 print:hidden">
          <span className="text-xs font-black text-slate-400">错因</span>
          {ERROR_TYPE_OPTIONS.map((option) => (
            <button key={option} type="button" className={`v2-chip ${errorType === option ? 'active' : ''}`} onClick={() => onErrorType(option)}>
              {option}
            </button>
          ))}
        </div>
      )}

      {showAnswer && (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <div className="v2-preview-note"><span>答案</span><p>{question.answer || '未提供'}</p></div>
          <div className="v2-preview-note"><span>解析</span><p>{question.analysis || '未提供'}</p></div>
        </div>
      )}
    </article>
  )
}

export default function ExamPreview() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { currentStudent } = useStudent()
  const [exam, setExam] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [layout, setLayout] = useState(DEFAULT_LAYOUT)
  const [composeTitle, setComposeTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [grading, setGrading] = useState(false)
  const [gradingResults, setGradingResults] = useState({})
  const [gradingErrorTypes, setGradingErrorTypes] = useState({})
  const [submittingGrade, setSubmittingGrade] = useState(false)
  const [submittedGrades, setSubmittedGrades] = useState(false)

  const isComposeMode = id === 'compose' && location.state?.composeQuestions != null

  useEffect(() => {
    if (isComposeMode) {
      const title = (location.state?.composeTitle ?? '组卷预览').trim() || '组卷预览'
      setExam({ title, questions: location.state.composeQuestions || [] })
      setComposeTitle(title)
      setLoading(false)
      setError('')
      return
    }
    if (!id) return
    setLoading(true)
    setError('')
    getExam(Number(id))
      .then((response) => setExam(response.data))
      .catch((err) => setError(err?.response?.data?.detail || err?.message || '加载试卷失败'))
      .finally(() => setLoading(false))
  }, [id, isComposeMode, location.state])

  const questions = useMemo(() => getQuestions(exam), [exam])
  const lessonPlan = isLessonPlan(exam)
  const title = isComposeMode ? composeTitle || '组卷预览' : exam?.title || '未命名试卷'
  const canGrade = !isComposeMode && exam?.id != null && questions.length > 0
  const markedCount = Object.keys(gradingResults).length
  const correctCount = Object.values(gradingResults).filter(Boolean).length

  const grouped = useMemo(() => {
    const groups = { 选择: [], 填空: [], 解答: [] }
    questions.forEach((question, index) => groups[normalizeType(question)].push({ question, index }))
    return groups
  }, [questions])

  const handleSaveCompose = async () => {
    if (!isComposeMode || !questions.length) return
    setSaving(true)
    try {
      const { data } = await saveExam({
        title: (composeTitle || '组卷预览').trim() || '组卷预览',
        questions: questions.map((question) => ({
          content: question.content ?? '',
          options: question.options ?? [],
          answer: question.answer ?? '',
          analysis: question.analysis ?? '',
          knowledge_point: question.knowledge_point ?? '',
          difficulty: question.difficulty ?? '',
        })),
      })
      toast.success('试卷已保存')
      if (data?.id != null) navigate(`/exams/${data.id}`, { replace: true })
    } catch (err) {
      toast.error(err?.response?.data?.detail || err?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleAssignConfirm = async (selected, customTitle) => {
    if (!selected?.length) return
    const finalTitle = (customTitle && customTitle.trim()) || title || '未命名作业'
    try {
      await Promise.all(
        selected.map((student) =>
          saveExam({
            title: finalTitle,
            student_id: student.id,
            questions: exam?.questions ?? questions,
          })
        )
      )
      toast.success(`已向 ${selected.length} 位学生布置作业`)
      setShowAssignModal(false)
    } catch (err) {
      toast.error(err?.response?.data?.detail || '布置失败')
      throw err
    }
  }

  const handleMark = useCallback((index, isCorrect) => {
    setGradingResults((prev) => ({ ...prev, [index]: isCorrect }))
    if (!isCorrect) {
      setGradingErrorTypes((prev) => ({ ...prev, [index]: prev[index] || '审题失误' }))
    }
  }, [])

  const handleSubmitGrade = async () => {
    if (!canGrade) return
    const results = questions
      .map((question, index) => {
        const marked = gradingResults[index]
        if (marked == null) return null
        return {
          question_index: index,
          question_id: question.id ?? null,
          is_correct: marked,
          error_type: marked ? null : gradingErrorTypes[index] || '审题失误',
          knowledge_point: question.knowledge_point ?? '',
        }
      })
      .filter(Boolean)
    if (!results.length) {
      toast.error('请先标记至少一道题')
      return
    }
    setSubmittingGrade(true)
    try {
      await gradeExam(exam.id, { student_id: currentStudent?.id ?? exam.student_id ?? null, results })
      setSubmittedGrades(true)
      toast.success('批改结果已提交')
    } catch (err) {
      toast.error(err?.response?.data?.detail || '提交批改失败')
    } finally {
      setSubmittingGrade(false)
    }
  }

  if (loading) {
    return (
      <PageShell>
        <LoadingState title="正在加载试卷预览" description="读取试卷题目、答案与讲义数据。" />
      </PageShell>
    )
  }

  if (error) {
    return (
      <PageShell>
        <ErrorState title="加载失败" description={error} onRetry={() => window.location.reload()} />
      </PageShell>
    )
  }

  return (
    <PageShell className="space-y-5">
      <StudentSelectorModal
        open={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        onConfirm={handleAssignConfirm}
        defaultTitle={title}
        allowEditTitle
      />

      <PageHeader
        title="试卷预览"
        description="用于打印导出、答案校验、作业布置和快速批改的 V2 预览工作台。"
        icon={FileText}
        meta={<StatusBadge tone={lessonPlan ? 'primary' : 'neutral'}>{lessonPlan ? '辅导讲义' : '练习试卷'}</StatusBadge>}
        actions={(
          <>
            <Link to="/exams" className="v2-btn-secondary"><ArrowLeft className="h-4 w-4" />返回列表</Link>
            {isComposeMode && (
              <button type="button" className="v2-btn-secondary" disabled={saving} onClick={handleSaveCompose}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                保存试卷
              </button>
            )}
            <button type="button" className="v2-btn-secondary" onClick={() => window.print()}><Printer className="h-4 w-4" />打印</button>
            <button type="button" className="v2-btn-primary" disabled={!questions.length} onClick={() => setShowAssignModal(true)}><Send className="h-4 w-4" />布置作业</button>
          </>
        )}
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_18rem]">
        <main className="space-y-4">
          <SectionCard
            title={title}
            description={`${questions.length} 道题 · ${layout.paperSize} · ${layout.columns} 栏排版`}
            actions={(
              <div className="flex flex-wrap items-center gap-2 print:hidden">
                <label className="v2-toggle">
                  <input type="checkbox" checked={layout.showAnswer} onChange={(event) => setLayout((prev) => ({ ...prev, showAnswer: event.target.checked }))} />
                  显示答案
                </label>
                <select className="v2-control" value={layout.paperSize} onChange={(event) => setLayout((prev) => ({ ...prev, paperSize: event.target.value }))}>
                  <option value="A4">A4</option>
                  <option value="A3">A3</option>
                </select>
                <select className="v2-control" value={layout.columns} onChange={(event) => setLayout((prev) => ({ ...prev, columns: Number(event.target.value) }))}>
                  <option value={1}>单栏</option>
                  <option value={2}>双栏</option>
                </select>
              </div>
            )}
          >
            {isComposeMode && (
              <label className="v2-field mb-4">
                <span>试卷标题</span>
                <input value={composeTitle} onChange={(event) => setComposeTitle(event.target.value)} />
              </label>
            )}

            {questions.length === 0 ? (
              <EmptyState icon={FileText} title="暂无题目" description="当前试卷没有可预览的题目。" />
            ) : (
              <div className={`v2-preview-paper ${layout.paperSize.toLowerCase()} columns-${layout.columns}`} data-show-answer={layout.showAnswer}>
                {layout.showHeader && (
                  <header className="v2-preview-paper-header">
                    <h2>{title}</h2>
                    <p>姓名：__________ 班级：__________ 日期：__________</p>
                  </header>
                )}
                {Object.entries(grouped).map(([groupName, items]) => (
                  items.length > 0 && (
                    <section key={groupName} className="space-y-3">
                      <h3 className="v2-preview-group-title">{groupName}题</h3>
                      {items.map(({ question, index }) => (
                        <QuestionPreview
                          key={question.id ?? index}
                          question={question}
                          index={index}
                          showAnswer={layout.showAnswer}
                          grading={grading}
                          marked={gradingResults[index]}
                          errorType={gradingErrorTypes[index]}
                          onMark={(isCorrect) => handleMark(index, isCorrect)}
                          onErrorType={(errorType) => setGradingErrorTypes((prev) => ({ ...prev, [index]: errorType }))}
                          onAskAI={() => navigate('/chat', { state: { contextQuestion: buildQuestionTextForChat(question) } })}
                        />
                      ))}
                    </section>
                  )
                ))}
              </div>
            )}
          </SectionCard>
        </main>

        <aside className="space-y-4 print:hidden">
          <SectionCard title="批改面板" description="快速标记对错并提交到当前学生学情。">
            <div className="grid gap-3">
              <div className="v2-preview-side-stat"><span>已标记</span><strong>{markedCount}/{questions.length}</strong></div>
              <div className="v2-preview-side-stat"><span>正确</span><strong>{correctCount}</strong></div>
              <button type="button" className="v2-btn-secondary w-full justify-center" disabled={!canGrade} onClick={() => setGrading((prev) => !prev)}>
                <ClipboardCheck className="h-4 w-4" />
                {grading ? '退出批改' : '开始批改'}
              </button>
              <button type="button" className="v2-btn-primary w-full justify-center" disabled={!grading || submittingGrade} onClick={handleSubmitGrade}>
                {submittingGrade ? <Loader2 className="h-4 w-4 animate-spin" /> : <GraduationCap className="h-4 w-4" />}
                提交批改
              </button>
              {submittedGrades && (
                <button type="button" className="v2-btn-secondary w-full justify-center" onClick={() => navigate('/knowledge-graph', { state: { fromGrading: true, studentId: currentStudent?.id ?? exam?.student_id } })}>
                  查看学情图谱
                </button>
              )}
            </div>
          </SectionCard>

          {lessonPlan && exam?.questions?.knowledge_card && (
            <SectionCard title="知识卡片" description="讲义来源的知识结构。">
              <KnowledgeCard data={exam.questions.knowledge_card} />
            </SectionCard>
          )}

          <SectionCard title="AI 辅助" description="选择题目旁的问 AI 可带题干上下文进入对话。">
            <button type="button" className="v2-btn-secondary w-full justify-center" onClick={() => navigate('/chat', { state: { contextQuestion: questions[0] ? buildQuestionTextForChat(questions[0]) : '' } })}>
              <Bot className="h-4 w-4" />
              带首题问 AI
            </button>
          </SectionCard>
        </aside>
      </div>
    </PageShell>
  )
}
