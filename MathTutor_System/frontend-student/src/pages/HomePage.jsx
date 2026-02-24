import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { BookMarked, CalendarCheck, GitBranch, Loader2 } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { getStudentAnalysisMastery, getStudentAnalysisTrend, getStudentMistakes } from '../services/api'
import toast from 'react-hot-toast'

export default function HomePage() {
  const [mastery, setMastery] = useState({ weak_points: [], mastered_points: [] })
  const [trend, setTrend] = useState({ weeks: [] })
  const [pendingCount, setPendingCount] = useState(0)
  const [todayReviewCount, setTodayReviewCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      try {
        const [masteryRes, trendRes, listRes, dueRes] = await Promise.all([
          getStudentAnalysisMastery(),
          getStudentAnalysisTrend(8),
          getStudentMistakes({ status: 'pending' }),
          getStudentMistakes({ review_due: true }),
        ])
        if (!cancelled) {
          setMastery({
            weak_points: masteryRes.weak_points ?? [],
            mastered_points: masteryRes.mastered_points ?? [],
          })
          setTrend({ weeks: trendRes.weeks ?? [] })
          const pendingList = Array.isArray(listRes) ? listRes : listRes?.data ?? []
          const dueList = Array.isArray(dueRes) ? dueRes : dueRes?.data ?? []
          setPendingCount(pendingList.length)
          setTodayReviewCount(dueList.length)
        }
      } catch (e) {
        if (!cancelled) toast.error('加载失败：' + (e.response?.data?.detail ?? e.message))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500" aria-hidden />
        <p className="mt-3 text-sm text-gray-500">加载学情中…</p>
      </div>
    )
  }

  const weakCount = mastery.weak_points?.length ?? 0
  const hasAny = pendingCount > 0 || todayReviewCount > 0 || weakCount > 0 || (trend.weeks?.length ?? 0) > 0

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-gray-800 sm:text-2xl">学情概览</h1>
        <p className="mt-1 text-sm text-gray-500">查看错题、待复习与学情趋势</p>
      </div>

      {!hasAny && (
        <div className="student-card-static flex flex-col items-center justify-center rounded-card p-8 text-center sm:p-10">
          <p className="text-gray-600">暂无学情数据</p>
          <p className="mt-1 text-sm text-gray-500">完成老师布置的题目后，这里会显示错题与掌握情况</p>
          <Link
            to="/exams"
            className="mt-5 inline-flex items-center rounded-btn bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-card transition-all hover:bg-primary-700 hover:shadow-card-hover focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            去「我的题目」做题 →
          </Link>
        </div>
      )}

      {hasAny && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Link to="/mistakes" className="student-card group cursor-pointer p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 transition-colors group-hover:bg-amber-200">
                  <BookMarked className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-500">待攻克错题</p>
                  <p className="text-2xl font-bold tabular-nums text-gray-800">{pendingCount}</p>
                </div>
              </div>
            </Link>
            <Link to="/mistakes?review_due=1" className="student-card group cursor-pointer p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600 transition-colors group-hover:bg-blue-200">
                  <CalendarCheck className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-500">今日待复习</p>
                  <p className="text-2xl font-bold tabular-nums text-gray-800">{todayReviewCount}</p>
                </div>
              </div>
            </Link>
            <Link to="/knowledge-graph" className="student-card group cursor-pointer p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 transition-colors group-hover:bg-red-200">
                  <GitBranch className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-500">弱项知识点</p>
                  <p className="text-2xl font-bold tabular-nums text-gray-800">{weakCount}</p>
                </div>
              </div>
            </Link>
          </div>

          {trend.weeks?.length > 0 && (
            <div className="student-card-static rounded-card p-5 sm:p-6">
              <h2 className="mb-4 text-sm font-medium text-gray-700">近 8 周学情趋势</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={trend.weeks} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <Tooltip cursor={{ fill: '#f3f4f6' }} contentStyle={{ borderRadius: '8px' }} />
                  <Legend wrapperStyle={{ paddingTop: '12px' }} />
                  <Bar dataKey="new_mistakes" name="新增错题" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="new_mastered" name="新掌握" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}
