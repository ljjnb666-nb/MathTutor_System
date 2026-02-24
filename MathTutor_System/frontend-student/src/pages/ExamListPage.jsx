import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { FileQuestion, Loader2, RefreshCw, CheckCircle2 } from 'lucide-react'
import { getStudentExams } from '../services/api'
import toast from 'react-hot-toast'

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    })
  } catch {
    return String(iso)
  }
}

export default function ExamListPage() {
  const [exams, setExams] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchExams = useCallback(() => {
    setLoading(true)
    getStudentExams()
      .then((data) => setExams(Array.isArray(data) ? data : []))
      .catch((e) => {
        toast.error('加载失败：' + (e.response?.data?.detail ?? e.message))
        setExams([])
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchExams()
  }, [fetchExams])

  if (loading && exams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500" aria-hidden />
        <p className="mt-3 text-sm text-gray-500">加载题目列表中…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-800 sm:text-2xl">我的题目</h1>
          <p className="mt-0.5 text-sm text-gray-500">老师布置的作业与测验</p>
        </div>
        <button
          type="button"
          onClick={() => fetchExams()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-btn border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 shadow-card transition-all hover:bg-gray-50 hover:shadow-card-hover disabled:opacity-50"
          aria-label="刷新列表"
        >
          <RefreshCw className={`h-4 w-4 shrink-0 ${loading ? 'animate-spin' : ''}`} aria-hidden />
          刷新
        </button>
      </div>

      {exams.length === 0 ? (
        <div className="student-card-static flex flex-col items-center justify-center rounded-card p-8 text-center sm:p-10">
          <FileQuestion className="mx-auto h-14 w-14 text-gray-300" aria-hidden />
          <p className="mt-4 text-gray-600">暂无分配给您的题目</p>
          <p className="mt-1 text-sm text-gray-500">完成老师布置的题目后，作答结果会写入错题本，首页会显示学情概览</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center rounded-btn bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-card transition-all hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            >
              去首页看学情
            </Link>
            <Link
              to="/mistakes"
              className="inline-flex items-center rounded-btn border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-card transition-all hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            >
              去错题本
            </Link>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {exams.map((exam) => {
            const isGraded = !!exam.graded_at
            return (
              <li key={exam.id}>
                <Link
                  to={`/exams/${exam.id}`}
                  className="student-card group flex cursor-pointer items-center gap-4 p-5"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-600 transition-colors group-hover:bg-primary-200">
                    <FileQuestion className="h-6 w-6" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-800">{exam.title || '未命名作业'}</p>
                    <p className="text-sm text-gray-500">{formatDate(exam.created_at)}</p>
                  </div>
                  {isGraded ? (
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-green-100 px-3 py-1.5 text-xs font-medium text-green-800">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                      已完成
                    </span>
                  ) : (
                    <span className="shrink-0 text-sm font-medium text-primary-600">去做题 →</span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
