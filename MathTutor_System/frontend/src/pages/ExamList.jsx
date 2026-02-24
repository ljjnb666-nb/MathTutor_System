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
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        <p>{error}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <StudentSelectorModal
        open={!!assignExam}
        onClose={() => setAssignExam(null)}
        onConfirm={handleAssignConfirm}
        defaultTitle={assignExam?.title || ''}
        allowEditTitle
      />
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-gray-800">我的试卷</h1>
        <p className="mt-1 text-sm text-gray-500">历史保存的试卷，点击可预览与打印</p>
      </header>

      {exams.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center shadow-sm">
          <FileText className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-4 text-sm text-gray-500">暂无试卷</p>
          <p className="mt-1 text-xs text-gray-400">在「智能出题」中生成完整试卷后点击「保存为试卷」即可在此查看</p>
          <Link
            to="/smart-gen"
            className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            去智能出题
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {exams.map((exam) => {
            const lessonPlan = isLessonPlan(exam)
            const count = getQuestionCount(exam)
            return (
              <li key={exam.id}>
                <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50/50">
                  <Link to={`/exams/${exam.id}`} className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-base font-medium text-gray-800">{exam.title || '未命名试卷'}</h2>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          lessonPlan
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {lessonPlan ? '📘 辅导讲义' : '📝 练习试卷'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      {count} 道题 · {formatDate(exam.created_at)}
                      {exam.student_name && (
                        <span className="ml-2 text-gray-400">· {exam.student_name}</span>
                      )}
                    </p>
                    {exam.student_id != null && (
                      <p className="mt-0.5 text-xs text-gray-500">
                        {exam.graded_at ? (
                          <span className="text-green-600">
                            已提交 {formatDate(exam.graded_at)}
                            {exam.grade_summary?.total != null && (
                              <> · 正确 {exam.grade_summary.correct}/{exam.grade_summary.total}</>
                            )}
                          </span>
                        ) : (
                          <span className="text-amber-600">未提交</span>
                        )}
                      </p>
                    )}
                  </Link>
                  <span className="shrink-0 text-sm text-blue-600">
                    <Link to={`/exams/${exam.id}`}>预览 / 打印 →</Link>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setAssignExam(exam)
                    }}
                    className="shrink-0 inline-flex items-center gap-1 rounded-lg p-2 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600"
                    title="布置给更多学生"
                    aria-label="布置"
                  >
                    <Send className="h-4 w-4" />
                    <span className="text-sm">布置</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDelete(exam, e)}
                    disabled={deletingId === exam.id}
                    className="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    title="删除"
                    aria-label="删除"
                  >
                    {deletingId === exam.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
