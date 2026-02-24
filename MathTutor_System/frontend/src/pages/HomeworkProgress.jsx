import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import Latex from 'react-latex-next'
import { ClipboardCheck, Loader2, Users, RefreshCw, ChevronDown, ChevronRight, Filter, X, Trash2, Calendar, BookOpen, FileQuestion } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getExams,
  updateExam,
  saveExam,
  deleteExam,
  getBankList,
  getMistakes,
} from '../services/api'
import StudentSelectorModal from '../components/StudentSelectorModal'
import { normalizeLatexForKaTeX } from '../utils/latex'
import 'katex/dist/katex.min.css'

const PAGE_SIZE = 20

function formatDate(d) {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateShort(d) {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

/** 从试卷 questions 中取出扁平题目列表（与后端一致） */
function flatQuestionsFromExam(exam) {
  const q = exam?.questions
  if (!q) return []
  if (Array.isArray(q)) return q
  if (typeof q === 'object' && Array.isArray(q.questions)) return q.questions
  return []
}

/** 题干摘要，去 HTML/LaTeX 后取前 50 字 */
function snippet(content) {
  if (!content || typeof content !== 'string') return '—'
  const text = content.replace(/<[^>]+>/g, '').replace(/\$[^$]+\$/g, '').replace(/\s+/g, ' ').trim()
  return text.length > 50 ? text.slice(0, 50) + '…' : text || '—'
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

/** 去掉选项文本开头的 "A." "B." 等前缀，避免与界面补的序号重复显示为 "A. A. 8" */
function getOptionDisplayText(opt) {
  if (typeof opt !== 'string') return String(opt ?? '')
  const s = opt.trim()
  const m = s.match(/^\s*[A-Za-z][.．、]\s*/)
  return m ? s.slice(m[0].length).trim() || s : s
}

/** 题库项 → 试卷题目格式 */
function bankItemToQuestion(item) {
  return {
    content: item.content ?? '',
    options: Array.isArray(item.options) ? item.options : [],
    answer: item.answer ?? '',
    analysis: item.analysis ?? '',
    knowledge_point: item.knowledge_point ?? '综合',
    question_type: item.question_type ?? '综合',
    difficulty: item.difficulty ?? 'L3',
  }
}

/** 错题项 → 试卷题目格式 */
function mistakeToQuestion(m) {
  return {
    content: m.content ?? '',
    options: [],
    answer: m.solution ?? '',
    analysis: '',
    knowledge_point: m.topic ?? '综合',
    question_type: '综合',
    difficulty: 'L3',
  }
}

export default function HomeworkProgress() {
  const [exams, setExams] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStudent, setFilterStudent] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [sortBy, setSortBy] = useState('time') // time | student | status
  const [viewMode, setViewMode] = useState('table') // table | group
  const [currentPage, setCurrentPage] = useState(1)
  const [expandedGroups, setExpandedGroups] = useState(new Set())
  const [deletingExamId, setDeletingExamId] = useState(null)

  // 作业管理
  const [mainTab, setMainTab] = useState('manage') // 'manage' | 'progress'
  const [assignmentDate, setAssignmentDate] = useState(todayStr)
  const [draft, setDraft] = useState(null)
  const [draftLoading, setDraftLoading] = useState(false)
  const [addBankOpen, setAddBankOpen] = useState(false)
  const [addMistakesOpen, setAddMistakesOpen] = useState(false)
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [removingQuestionIndex, setRemovingQuestionIndex] = useState(null)

  const fetchData = useCallback(() => {
    setLoading(true)
    getExams()
      .then((res) => setExams(Array.isArray(res.data) ? res.data : []))
      .catch(() => setExams([]))
      .finally(() => setLoading(false))
  }, [])

  const fetchDraft = useCallback((date) => {
    if (!date) return
    setDraftLoading(true)
    getExams({ assignment_date: date })
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : []
        const d = list.find((e) => e.student_id == null) || null
        setDraft(d)
      })
      .catch(() => setDraft(null))
      .finally(() => setDraftLoading(false))
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (mainTab === 'manage') fetchDraft(assignmentDate)
  }, [mainTab, assignmentDate, fetchDraft])

  const assignedExams = useMemo(() => exams.filter((e) => e.student_id != null), [exams])

  /** 展开为题目行 */
  const questionRows = useMemo(() => {
    const rows = []
    for (const exam of assignedExams) {
      const questions = flatQuestionsFromExam(exam)
      const gradeResults = exam.grade_results || []
      const getResult = (idx) => gradeResults.find((r) => r.question_index === idx)

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i]
        const content = typeof q === 'object' ? q.content : ''
        const res = getResult(i)
        rows.push({
          key: `${exam.id}-${i}`,
          examId: exam.id,
          student_name: exam.student_name ?? '—',
          examTitle: exam.title || '未命名',
          created_at: exam.created_at,
          graded_at: exam.graded_at,
          questionIndex: i + 1,
          totalQuestions: questions.length,
          contentSnippet: snippet(content),
          is_correct: res != null ? res.is_correct : null,
          submitted: !!exam.graded_at,
        })
      }
    }
    return rows
  }, [assignedExams])

  const filtered = useMemo(() => {
    let list = questionRows
    if (filterStudent.trim()) {
      const q = filterStudent.trim().toLowerCase()
      list = list.filter((r) => (r.student_name ?? '').toLowerCase().includes(q))
    }
    if (filterStatus === 'correct') list = list.filter((r) => r.is_correct === true)
    else if (filterStatus === 'wrong') list = list.filter((r) => r.is_correct === false)
    else if (filterStatus === 'pending') list = list.filter((r) => !r.submitted)

    if (sortBy === 'time') list = [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    else if (sortBy === 'student') list = [...list].sort((a, b) => (a.student_name || '').localeCompare(b.student_name || ''))
    else if (sortBy === 'status') {
      list = [...list].sort((a, b) => {
        const order = (r) => (r.submitted ? (r.is_correct ? 0 : 1) : 2)
        return order(a) - order(b)
      })
    }
    return list
  }, [questionRows, filterStudent, filterStatus, sortBy])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, currentPage])

  useEffect(() => setCurrentPage(1), [filterStudent, filterStatus, sortBy])

  /** 按作业分组的列表：{ examKey, examTitle, created_at, rows[] } */
  const groupedByExam = useMemo(() => {
    const map = new Map()
    for (const row of filtered) {
      const key = `${row.examId}-${row.student_name}`
      if (!map.has(key)) {
        map.set(key, {
          examId: row.examId,
          examTitle: row.examTitle,
          student_name: row.student_name,
          created_at: row.created_at,
          graded_at: row.graded_at,
          submitted: row.submitted,
          rows: [],
        })
      }
      map.get(key).rows.push(row)
    }
    return Array.from(map.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }, [filtered])

  const hasFilters = filterStudent.trim() || filterStatus !== 'all'
  const stats = useMemo(() => {
    const total = questionRows.length
    const submitted = questionRows.filter((r) => r.submitted).length
    const correct = questionRows.filter((r) => r.is_correct === true).length
    const wrong = questionRows.filter((r) => r.is_correct === false).length
    const pending = total - submitted
    return { total, submitted, correct, wrong, pending }
  }, [questionRows])

  const studentNames = useMemo(() => {
    const set = new Set(assignedExams.map((e) => e.student_name).filter(Boolean))
    return Array.from(set).sort()
  }, [assignedExams])

  const toggleGroup = (key) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleDeleteExam = useCallback(
    async (examId, title = '该作业') => {
      if (!window.confirm(`确定删除「${title}」？学生端将不再显示该作业。`)) return
      setDeletingExamId(examId)
      try {
        await deleteExam(examId)
        toast.success('已删除')
        fetchData()
        if (mainTab === 'manage' && draft?.id === examId) fetchDraft(assignmentDate)
      } catch (err) {
        toast.error(err.response?.data?.detail || '删除失败')
      } finally {
        setDeletingExamId(null)
      }
    },
    [fetchData, mainTab, draft?.id, fetchDraft, assignmentDate]
  )

  /** 获取或创建当日作业草稿，返回 { id, questions } */
  const ensureDraft = useCallback(async () => {
    if (draft?.id) return { id: draft.id, questions: flatQuestionsFromExam(draft) }
    const title = `${assignmentDate} 作业`
    const res = await saveExam({
      title,
      student_id: null,
      questions: [],
      assignment_date: assignmentDate,
    })
    const created = res.data ?? res
    setDraft(created)
    return { id: created.id, questions: [] }
  }, [draft, assignmentDate])

  /** 从题库加入题目到当日草稿 */
  const handleAddFromBank = useCallback(
    async (selectedItems) => {
      if (!selectedItems?.length) return
      try {
        const { id, questions: existing } = await ensureDraft()
        const added = selectedItems.map((item) => bankItemToQuestion(item))
        await updateExam(id, { questions: [...existing, ...added] })
        toast.success(`已加入 ${added.length} 道题`)
        fetchDraft(assignmentDate)
        setAddBankOpen(false)
      } catch (err) {
        toast.error(err.response?.data?.detail || '加入失败')
      }
    },
    [ensureDraft, assignmentDate, fetchDraft]
  )

  /** 从错题本加入题目到当日草稿 */
  const handleAddFromMistakes = useCallback(
    async (selectedItems) => {
      if (!selectedItems?.length) return
      try {
        const { id, questions: existing } = await ensureDraft()
        const added = selectedItems.map((m) => mistakeToQuestion(m))
        await updateExam(id, { questions: [...existing, ...added] })
        toast.success(`已加入 ${added.length} 道题`)
        fetchDraft(assignmentDate)
        setAddMistakesOpen(false)
      } catch (err) {
        toast.error(err.response?.data?.detail || '加入失败')
      }
    },
    [ensureDraft, assignmentDate, fetchDraft]
  )

  /** 从当日作业草稿中移除第 index 题 */
  const handleRemoveFromDraft = useCallback(
    async (index) => {
      if (!draft?.id || removingQuestionIndex != null) return
      const flat = flatQuestionsFromExam(draft)
      if (index < 0 || index >= flat.length) return
      setRemovingQuestionIndex(index)
      try {
        const next = flat.filter((_, i) => i !== index)
        await updateExam(draft.id, { questions: next })
        toast.success('已从当日作业中移除')
        fetchDraft(assignmentDate)
      } catch (err) {
        toast.error(err.response?.data?.detail || '移除失败')
      } finally {
        setRemovingQuestionIndex(null)
      }
    },
    [draft, assignmentDate, fetchDraft, removingQuestionIndex]
  )

  /** 布置当日草稿给选中学生 */
  const handleAssignToStudents = useCallback(
    async (students, title) => {
      const questions = flatQuestionsFromExam(draft)
      if (!questions.length) {
        toast.error('当前没有题目，请先从题库或错题本加入')
        return
      }
      const finalTitle = (title || draft?.title || `${assignmentDate} 作业`).trim() || `${assignmentDate} 作业`
      for (const s of students) {
        await saveExam({
          title: finalTitle,
          student_id: s.id,
          questions,
          assignment_date: assignmentDate,
        })
      }
      toast.success(`已布置给 ${students.length} 位学生`)
      setAssignModalOpen(false)
      fetchData()
      fetchDraft(assignmentDate)
    },
    [draft, assignmentDate, fetchData, fetchDraft]
  )

  if (loading && exams.length === 0 && mainTab !== 'manage') {
    return (
      <div className="flex flex-col">
        <header className="mb-6">
          <h1 className="text-xl font-semibold text-gray-800">作业与做题情况</h1>
          <p className="mt-1 text-sm text-gray-500">作业管理、按题目查看学生作答与对错</p>
        </header>
        <div className="flex min-h-[40vh] items-center justify-center rounded-xl border border-gray-200 bg-white">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">作业与做题情况</h1>
          <p className="mt-1 text-sm text-gray-500">
            {mainTab === 'manage' ? '按日期管理当日作业，从题库/错题本加入题目后布置给学生' : '按题目查看学生作答与对错；学生端在「我的题目」作答并提交后此处会更新'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <nav className="flex rounded-lg border border-gray-200 bg-gray-100 p-0.5">
            <button
              type="button"
              onClick={() => setMainTab('manage')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                mainTab === 'manage' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              作业管理
            </button>
            <button
              type="button"
              onClick={() => setMainTab('progress')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                mainTab === 'progress' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              做题情况
            </button>
          </nav>
          {mainTab === 'progress' && (
            <button
              type="button"
              onClick={() => fetchData()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              title="刷新数据"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </button>
          )}
        </div>
      </header>

      {mainTab === 'manage' && (
        <div className="mb-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <Calendar className="h-4 w-4 text-gray-500" />
              作业日期
            </label>
            <input
              type="date"
              value={assignmentDate}
              onChange={(e) => setAssignmentDate(e.target.value)}
              className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <button
              type="button"
              onClick={() => fetchDraft(assignmentDate)}
              disabled={draftLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${draftLoading ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="font-medium text-gray-800">
                {assignmentDate} 当日作业{draft ? ` · ${flatQuestionsFromExam(draft).length} 题` : ''}
              </span>
              <button
                type="button"
                onClick={() => setAddBankOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                <BookOpen className="h-4 w-4" />
                从题库加入
              </button>
              <button
                type="button"
                onClick={() => setAddMistakesOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <FileQuestion className="h-4 w-4" />
                从错题本加入
              </button>
              <button
                type="button"
                onClick={() => setAssignModalOpen(true)}
                disabled={!draft || flatQuestionsFromExam(draft).length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-800 hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Users className="h-4 w-4" />
                布置给学生
              </button>
            </div>
            {draftLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : !draft ? (
              <p className="py-6 text-center text-sm text-gray-500">暂无当日作业，点击「从题库加入」或「从错题本加入」开始组卷</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {flatQuestionsFromExam(draft).map((q, idx) => (
                  <li key={idx} className="flex items-start gap-3 py-3">
                    <span className="w-8 shrink-0 pt-0.5 text-xs font-medium text-gray-500">{idx + 1}</span>
                    <div className="min-w-0 flex-1 text-sm text-gray-700 break-words">
                      <span className="inline">
                        <Latex>{normalizeLatexForKaTeX((q?.content ?? q?.body ?? '').trim() || '（无题干）')}</Latex>
                      </span>
                      {Array.isArray(q?.options) && q.options.length > 0 && (
                        <ul className="mt-1.5 list-none space-y-0.5 pl-0 text-gray-600">
                          {q.options.map((opt, i) => (
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
                    <button
                      type="button"
                      onClick={() => handleRemoveFromDraft(idx)}
                      disabled={removingQuestionIndex !== null}
                      className="shrink-0 p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                      title="从当日作业中移除"
                      aria-label="从当日作业中移除"
                    >
                      {removingQuestionIndex === idx ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {mainTab === 'progress' && assignedExams.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">总题数</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">已提交</p>
            <p className="mt-1 text-2xl font-bold text-green-600">{stats.submitted}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">答对</p>
            <p className="mt-1 text-2xl font-bold text-green-700">{stats.correct}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">未提交</p>
            <p className="mt-1 text-2xl font-bold text-amber-600">{stats.pending}</p>
          </div>
        </div>
      )}

      {mainTab === 'progress' && (
      <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Users className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="按学生姓名筛选"
            value={filterStudent}
            onChange={(e) => setFilterStudent(e.target.value)}
            className="h-9 w-44 rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 sm:w-52"
          />
        </div>
        {studentNames.length > 0 && studentNames.length <= 8 && (
          <div className="flex flex-wrap gap-1.5">
            {studentNames.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setFilterStudent((prev) => (prev === name ? '' : name))}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  filterStudent === name
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="all">全部状态</option>
          <option value="correct">答对</option>
          <option value="wrong">答错</option>
          <option value="pending">未提交</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="time">按布置时间</option>
          <option value="student">按学生</option>
          <option value="status">按状态（对→错→未提交）</option>
        </select>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode((m) => (m === 'table' ? 'group' : 'table'))}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {viewMode === 'table' ? '按作业分组' : '平铺列表'}
          </button>
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setFilterStudent('')
              setFilterStatus('all')
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            <X className="h-3.5 w-3.5" />
            清空筛选
          </button>
        )}
        <span className="text-sm text-gray-500">
          共 {filtered.length} 道题
          {questionRows.length !== filtered.length && `（筛选自 ${questionRows.length} 道）`}
        </span>
      </div>

      {assignedExams.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center shadow-sm">
          <ClipboardCheck className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-4 text-sm font-medium text-gray-500">暂无布置给学生的题目</p>
          <p className="mt-1 text-xs text-gray-400">
            在「智能出题」中生成题目后点击「布置作业」选择学生，学生端即可收到题目
          </p>
          <Link
            to="/smart-gen"
            className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            去智能出题
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-12 text-center shadow-sm">
          <Filter className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">没有符合筛选条件的结果</p>
          <button
            type="button"
            onClick={() => {
              setFilterStudent('')
              setFilterStatus('all')
            }}
            className="mt-3 text-sm text-blue-600 hover:underline"
          >
            清空筛选
          </button>
        </div>
      ) : viewMode === 'group' ? (
        <div className="space-y-2">
          {groupedByExam.map((group) => {
            const key = `${group.examId}-${group.student_name}`
            const expanded = expandedGroups.has(key)
            const correctCount = group.rows.filter((r) => r.is_correct).length
            const totalCount = group.rows.length
            return (
              <div
                key={key}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(key)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                >
                  {expanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-gray-800">
                      {group.examTitle} · {group.student_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {totalCount} 题
                      {group.submitted
                        ? ` · 已提交 ${correctCount}/${totalCount} 正确 · ${formatDateShort(group.graded_at)}`
                        : ' · 未提交'}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      group.submitted
                        ? 'bg-green-100 text-green-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {group.submitted ? '已提交' : '未提交'}
                  </span>
                  <Link
                    to={`/exams/${group.examId}`}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 text-sm text-blue-600 hover:text-blue-700"
                  >
                    查看
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteExam(group.examId, `${group.examTitle} · ${group.student_name}`)
                    }}
                    disabled={deletingExamId === group.examId}
                    className="shrink-0 rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    title="删除该作业"
                    aria-label="删除"
                  >
                    {deletingExamId === group.examId ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </button>
                {expanded && (
                  <div className="border-t border-gray-100 bg-gray-50/50">
                    <ul className="divide-y divide-gray-100">
                      {group.rows.map((row) => (
                        <li key={row.key} className="flex items-center gap-4 px-4 py-2.5 pl-12">
                          <span className="w-8 shrink-0 text-xs text-gray-500">
                            {row.questionIndex}/{row.totalQuestions}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
                            {row.contentSnippet}
                          </span>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                              !row.submitted
                                ? 'bg-amber-100 text-amber-800'
                                : row.is_correct
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {!row.submitted ? '未提交' : row.is_correct ? '对' : '错'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 font-medium text-gray-700">学生</th>
                    <th className="px-4 py-3 font-medium text-gray-700">题目</th>
                    <th className="px-4 py-3 font-medium text-gray-700">所属作业</th>
                    <th className="px-4 py-3 font-medium text-gray-700">题号</th>
                    <th className="px-4 py-3 font-medium text-gray-700">对错</th>
                    <th className="px-4 py-3 font-medium text-gray-700">提交时间</th>
                    <th className="px-4 py-3 font-medium text-gray-700">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedRows.map((row) => (
                    <tr key={row.key} className="hover:bg-gray-50/80">
                      <td className="px-4 py-3 font-medium text-gray-800">{row.student_name}</td>
                      <td className="max-w-[200px] px-4 py-3 text-gray-700 sm:max-w-[260px]">
                        <span className="line-clamp-2" title={row.contentSnippet}>
                          {row.contentSnippet}
                        </span>
                      </td>
                      <td className="max-w-[120px] px-4 py-3 text-gray-600">
                        <span className="line-clamp-1" title={row.examTitle}>
                          {row.examTitle}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {row.questionIndex}/{row.totalQuestions}
                      </td>
                      <td className="px-4 py-3">
                        {!row.submitted ? (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                            未提交
                          </span>
                        ) : row.is_correct ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                            对
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                            错
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                        {row.graded_at ? formatDate(row.graded_at) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/exams/${row.examId}`}
                            className="text-blue-600 hover:text-blue-700"
                          >
                            查看
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDeleteExam(row.examId, row.examTitle)}
                            disabled={deletingExamId === row.examId}
                            className="text-gray-400 hover:text-red-600 disabled:opacity-50"
                            title="删除该作业"
                            aria-label="删除"
                          >
                            {deletingExamId === row.examId ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {!loading && totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                上一页
              </button>
              <span className="text-sm text-gray-500">
                第 {currentPage} / {totalPages} 页
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}
      </>
      )}

      {/* 从题库加入 */}
      <AddFromBankModal
        open={addBankOpen}
        onClose={() => setAddBankOpen(false)}
        onConfirm={handleAddFromBank}
      />
      {/* 从错题本加入 */}
      <AddFromMistakesModal
        open={addMistakesOpen}
        onClose={() => setAddMistakesOpen(false)}
        onConfirm={handleAddFromMistakes}
      />
      {/* 布置给学生 */}
      <StudentSelectorModal
        open={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        onConfirm={handleAssignToStudents}
        defaultTitle={draft?.title || `${assignmentDate} 作业`}
        allowEditTitle
      />
    </div>
  )
}

/** 从题库多选加入题目 */
function AddFromBankModal({ open, onClose, onConfirm }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(new Set())

  useEffect(() => {
    if (!open) return
    setSelected(new Set())
    setLoading(true)
    getBankList()
      .then((res) => setList(Array.isArray(res.data) ? res.data : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [open])

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleConfirm = () => {
    const items = list.filter((item) => selected.has(item.id))
    onConfirm?.(items)
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="关闭" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-gray-800">从题库加入题目</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
          ) : list.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">题库暂无题目</p>
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
                  <div className="min-w-0 flex-1 text-sm text-gray-700 break-words">
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

/** 从错题本多选加入题目 */
function AddFromMistakesModal({ open, onClose, onConfirm }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(new Set())

  useEffect(() => {
    if (!open) return
    setSelected(new Set())
    setLoading(true)
    getMistakes()
      .then((res) => setList(Array.isArray(res.data) ? res.data : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [open])

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleConfirm = () => {
    const items = list.filter((item) => selected.has(item.id))
    onConfirm?.(items)
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="关闭" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-gray-800">从错题本加入题目</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
          ) : list.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">错题本暂无记录</p>
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
                  <div className="min-w-0 flex-1 text-sm text-gray-700 break-words">
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
