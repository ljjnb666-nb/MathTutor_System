import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Loader2, Trash2, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { getExams, deleteExam, saveExam } from '../services/api'
import StudentSelectorModal from '../components/StudentSelectorModal'

function formatDate(createdAt) {
  if (!createdAt) return '—'
  const d = new Date(createdAt)
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isLessonPlan(exam) {
  const q = exam?.questions
  return q != null && typeof q === 'object' && !Array.isArray(q) && 'knowledge_card' in q
}

function getQuestionCount(exam) {
  const q = exam?.questions
  if (!q) return 0
  if (Array.isArray(q)) return q.length
  if (typeof q === 'object' && Array.isArray(q.questions)) return q.questions.length
  return 0
}

export default function ExamList() {
  const [exams, setExams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [assignExam, setAssignExam] = useState(null)

  const fetchExams = () => {
    setLoading(true)
    setError(null)
    getExams()
      .then((res) => setExams(Array.isArray(res.data) ? res.data : []))
      .catch((err) => setError(err.response?.data?.detail || err.message || '加载失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchExams()
  }, [])

  const handleDelete = async (exam, e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!window.confirm(`确定删除「${exam.title || '未命名试卷'}」？${exam.student_id ? '学生端将不再显示该作业。' : ''}`)) return
    setDeletingId(exam.id)
    try {
      await deleteExam(exam.id)
      toast.success('已删除')
      fetchExams()
    } catch (err) {
      toast.error(err.response?.data?.detail || '删除失败')
    } finally {
      setDeletingId(null)
    }
  }

  const handleAssignConfirm = async (selected, customTitle) => {
    if (!assignExam || !selected?.length) return
    const title = (customTitle && customTitle.trim()) || assignExam.title || '未命名作业'
    try {
      await Promise.all(
        selected.map((s) =>
          saveExam({
            title,
            student_id: s.id,
            questions: assignExam.questions,
          })
        )
      )
      const n = selected.length
      const names = selected.map((s) => s.name).join('，')
      toast.success(`已向 ${n} 位学生布置作业：${names}`)
      setAssignExam(null)
    } catch (err) {
      toast.error(err.response?.data?.detail || '布置失败')
      throw err
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin" style={{ color: 'var(--color-primary-600)' }} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg p-4" style={{ border: '1px solid rgba(239, 68, 68, 0.2)', backgroundColor: 'color-mix(in srgb, #ef4444 10%, var(--color-bg-card))', color: '#b91c1c' }}>
        <p>{error}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col animate-fade-in-up space-y-4">
      <StudentSelectorModal
        open={!!assignExam}
        onClose={() => setAssignExam(null)}
        onConfirm={handleAssignConfirm}
        defaultTitle={assignExam?.title || ''}
        allowEditTitle
      />
      <header className="rounded-3xl p-6 sm:p-8 shadow-sm flex items-center justify-between gap-4" style={{ border: '1px solid color-mix(in srgb, var(--color-border-primary) 90%, transparent)', backgroundColor: 'var(--color-bg-card)' }}>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 text-white shadow-lg shrink-0" style={{ boxShadow: '0 10px 15px -3px color-mix(in srgb, var(--color-primary-500) 25%, transparent)' }}>
            <FileText className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--color-text-primary)' }}>我的试卷与讲义资产库</h1>
              <span className="rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase" style={{ backgroundColor: 'color-mix(in srgb, #10b981 10%, transparent)', border: '1px solid rgba(16, 185, 129, 0.2)', color: '#047857' }}>
                EXAM ASSETS
              </span>
            </div>
            <p className="mt-1 text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              归档备课生成的试卷与同步讲义，支持 A4 打印排版、导出 Word 与一键批量布置作业
            </p>
          </div>
        </div>
      </header>

      {exams.length === 0 ? (
        <div className="pro-glass-card rounded-3xl py-20 text-center shadow-sm">
          <FileText className="mx-auto h-14 w-14 mb-3" style={{ color: 'var(--color-border-primary)' }} />
          <p className="text-sm font-extrabold" style={{ color: 'var(--color-text-primary)' }}>暂无归档试卷</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>在「智能 AI 出题中心」生成题目后，点击「保存为试卷」即可显示在归档库中</p>
          <Link
            to="/smart-gen"
            className="btn-gradient-pro mt-5 inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-xs font-black"
          >
            前往 AI 智能出题
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {exams.map((exam) => {
            const lessonPlan = isLessonPlan(exam)
            const count = getQuestionCount(exam)
            return (
              <li key={exam.id}>
                <div className="pro-glass-card flex items-center justify-between gap-4 rounded-2xl p-4 transition-all hover:border-indigo-500/50">
                  <Link to={`/exams/${exam.id}`} className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <h2 className="truncate text-sm font-black" style={{ color: 'var(--color-text-primary)' }}>{exam.title || '未命名数学试卷'}</h2>
                      <span
                        className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase ${
                          lessonPlan
                            ? 'bg-indigo-500/10 text-indigo-700 border-indigo-200'
                            : 'bg-emerald-500/10 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        {lessonPlan ? '📘 辅导讲义' : '📝 练习试卷'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      {count} 道考题 · 创建时间 {formatDate(exam.created_at)}
                      {exam.student_name && (
                        <span className="ml-2 font-bold text-indigo-600">· 布置给 {exam.student_name}</span>
                      )}
                    </p>
                  </Link>

                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      to={`/exams/${exam.id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                    >
                      打印与导出
                    </Link>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setAssignExam(exam)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-colors"
                      title="布置给更多学生"
                    >
                      <Send className="h-3.5 w-3.5" />
                      一键布置
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(exam, e)}
                      disabled={deletingId === exam.id}
                      className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-rose-600 hover:bg-rose-100 disabled:opacity-50 transition-colors"
                      title="删除试卷"
                    >
                      {deletingId === exam.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
