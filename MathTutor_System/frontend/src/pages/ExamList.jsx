import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, FileText, Printer, Search, Send, Trash2, UploadCloud } from 'lucide-react'
import toast from 'react-hot-toast'
import { deleteExam, getExams, saveExam } from '../services/api'
import StudentSelectorModal from '../components/StudentSelectorModal'
import { EmptyState, ErrorState, LoadingState, MetricCard, PageHeader, PageShell, SectionCard, StatusBadge } from '../components/UiV2'

function formatDate(createdAt) {
  if (!createdAt) return '未记录'
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return '未记录'
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isLessonPlan(exam) {
  const questions = exam?.questions
  return questions != null && typeof questions === 'object' && !Array.isArray(questions) && 'knowledge_card' in questions
}

function getQuestionCount(exam) {
  const questions = exam?.questions
  if (!questions) return 0
  if (Array.isArray(questions)) return questions.length
  if (Array.isArray(questions.questions)) return questions.questions.length
  return 0
}

function getStatusTone(exam) {
  if (exam.student_id || exam.student_name) return 'success'
  if (isLessonPlan(exam)) return 'primary'
  return 'neutral'
}

export default function ExamList() {
  const [exams, setExams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [deletingId, setDeletingId] = useState(null)
  const [assignExam, setAssignExam] = useState(null)

  const fetchExams = () => {
    setLoading(true)
    setError('')
    getExams()
      .then((response) => setExams(Array.isArray(response?.data) ? response.data : []))
      .catch((err) => setError(err?.response?.data?.detail || err?.message || '加载试卷失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchExams()
  }, [])

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return exams.filter((exam) => {
      const title = String(exam.title || '').toLowerCase()
      const type = isLessonPlan(exam) ? 'lesson' : 'exam'
      const matchesQuery = !keyword || title.includes(keyword) || String(exam.student_name || '').toLowerCase().includes(keyword)
      const matchesType = typeFilter === 'all' || typeFilter === type || (typeFilter === 'assigned' && (exam.student_id || exam.student_name))
      return matchesQuery && matchesType
    })
  }, [exams, query, typeFilter])

  const stats = useMemo(() => {
    const lessonPlans = exams.filter(isLessonPlan).length
    const assigned = exams.filter((exam) => exam.student_id || exam.student_name).length
    const questions = exams.reduce((sum, exam) => sum + getQuestionCount(exam), 0)
    return { total: exams.length, lessonPlans, assigned, questions }
  }, [exams])

  const handleDelete = async (exam, event) => {
    event.preventDefault()
    event.stopPropagation()
    const title = exam.title || '未命名试卷'
    if (!window.confirm(`确定删除「${title}」？${exam.student_id ? '学生端将不再显示该作业。' : ''}`)) return
    setDeletingId(exam.id)
    try {
      await deleteExam(exam.id)
      toast.success('已删除试卷')
      fetchExams()
    } catch (err) {
      toast.error(err?.response?.data?.detail || '删除失败')
    } finally {
      setDeletingId(null)
    }
  }

  const handleAssignConfirm = async (selected, customTitle) => {
    if (!assignExam || !selected?.length) return
    const title = (customTitle && customTitle.trim()) || assignExam.title || '未命名作业'
    try {
      await Promise.all(
        selected.map((student) =>
          saveExam({
            title,
            student_id: student.id,
            questions: assignExam.questions,
          })
        )
      )
      toast.success(`已向 ${selected.length} 位学生布置作业`)
      setAssignExam(null)
    } catch (err) {
      toast.error(err?.response?.data?.detail || '布置失败')
      throw err
    }
  }

  if (loading) {
    return (
      <PageShell>
        <LoadingState title="正在加载试卷资产" description="读取已保存试卷与讲义。" />
      </PageShell>
    )
  }

  return (
    <PageShell className="space-y-5">
      <StudentSelectorModal
        open={!!assignExam}
        onClose={() => setAssignExam(null)}
        onConfirm={handleAssignConfirm}
        defaultTitle={assignExam?.title || ''}
        allowEditTitle
      />

      <PageHeader
        title="我的试卷"
        description="归档智能出题、导入试卷和讲义资产；打印、导出、布置仍使用现有试卷接口。"
        icon={FileText}
        meta={<StatusBadge tone="primary">{stats.total} 份资产</StatusBadge>}
        actions={(
          <>
            <Link to="/exams/import" className="v2-btn-secondary"><UploadCloud className="h-4 w-4" />导入试卷</Link>
            <Link to="/smart-gen" className="v2-btn-primary"><FileText className="h-4 w-4" />智能出题</Link>
          </>
        )}
      />

      {error ? (
        <ErrorState title="加载失败" description={error} onRetry={fetchExams} />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="资产总数" value={stats.total} hint="试卷与讲义" icon={FileText} />
            <MetricCard label="题目总量" value={stats.questions} hint="当前归档题目" icon={Search} tone="success" />
            <MetricCard label="辅导讲义" value={stats.lessonPlans} hint="含知识卡片" icon={CalendarClock} tone="warning" />
            <MetricCard label="已布置" value={stats.assigned} hint="绑定学生端" icon={Send} tone="danger" />
          </div>

          <SectionCard
            title={`资产列表 (${filtered.length})`}
            description="按标题、学生或资产类型筛选；点击卡片进入预览与打印导出。"
            actions={(
              <div className="flex flex-wrap items-center gap-2">
                <label className="v2-search min-w-52">
                  <Search className="h-4 w-4 shrink-0" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题或学生..." />
                </label>
                <select className="v2-control" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                  <option value="all">全部资产</option>
                  <option value="exam">练习试卷</option>
                  <option value="lesson">辅导讲义</option>
                  <option value="assigned">已布置</option>
                </select>
              </div>
            )}
          >
            {filtered.length === 0 ? (
              <EmptyState
                icon={FileText}
                title={exams.length ? '没有匹配的试卷' : '暂无归档试卷'}
                description={exams.length ? '调整搜索或筛选条件后重试。' : '在智能出题或导入试卷完成后，可保存到这里。'}
                action={<Link to="/smart-gen" className="v2-btn-secondary">前往智能出题</Link>}
              />
            ) : (
              <div className="grid gap-3">
                {filtered.map((exam) => {
                  const lessonPlan = isLessonPlan(exam)
                  const count = getQuestionCount(exam)
                  return (
                    <article key={exam.id} className="v2-exam-card">
                      <Link to={`/exams/${exam.id}`} className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2>{exam.title || '未命名数学试卷'}</h2>
                          <StatusBadge tone={getStatusTone(exam)}>{lessonPlan ? '辅导讲义' : '练习试卷'}</StatusBadge>
                          {exam.student_name && <StatusBadge tone="success">已布置给 {exam.student_name}</StatusBadge>}
                        </div>
                        <p>{count} 道题 · 创建时间 {formatDate(exam.created_at)}</p>
                      </Link>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Link to={`/exams/${exam.id}`} className="v2-btn-secondary"><Printer className="h-4 w-4" />打印与导出</Link>
                        <button type="button" className="v2-btn-secondary" onClick={() => setAssignExam(exam)}>
                          <Send className="h-4 w-4" />
                          一键布置
                        </button>
                        <button
                          type="button"
                          className="v2-icon-button danger"
                          title="删除试卷"
                          disabled={deletingId === exam.id}
                          onClick={(event) => handleDelete(exam, event)}
                        >
                          {deletingId === exam.id ? <span className="loading-spinner h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </SectionCard>
        </>
      )}
    </PageShell>
  )
}
