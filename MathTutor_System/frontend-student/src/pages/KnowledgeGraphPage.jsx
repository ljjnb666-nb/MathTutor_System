import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  BookMarked,
  Target,
  Lightbulb,
  BarChart3,
} from 'lucide-react'
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
import {
  getStudentAnalysisMastery,
  getStudentAnalysisTrend,
  getStudentMistakes,
} from '../services/api'
import toast from 'react-hot-toast'

/** 从错题 topic 字符串拆出知识点集合（与后端一致） */
function splitTopics(topicStr) {
  if (!topicStr || typeof topicStr !== 'string') return []
  const raw = topicStr.trim().replace(/\u3000/g, ' ').replace(/\uff0c/g, ',')
  let s = raw
  for (const sep of ['＋', '、', '+']) s = s.split(sep).join('+')
  return s
    .split('+')
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/** 统计各知识点的待攻克错题数 */
function countPendingByTopic(pendingList) {
  const countByTopic = {}
  for (const m of pendingList) {
    const topics = splitTopics(m.topic)
    for (const t of topics) {
      countByTopic[t] = (countByTopic[t] ?? 0) + 1
    }
  }
  return countByTopic
}

export default function KnowledgeGraphPage() {
  const [mastery, setMastery] = useState({ weak_points: [], mastered_points: [] })
  const [trend, setTrend] = useState({ weeks: [] })
  const [pendingList, setPendingList] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      try {
        const [masteryRes, trendRes, pendingRes] = await Promise.all([
          getStudentAnalysisMastery(),
          getStudentAnalysisTrend(8),
          getStudentMistakes({ status: 'pending' }),
        ])
        if (!cancelled) {
          setMastery({
            weak_points: masteryRes.weak_points ?? [],
            mastered_points: masteryRes.mastered_points ?? [],
          })
          setTrend({ weeks: trendRes.weeks ?? [] })
          setPendingList(Array.isArray(pendingRes) ? pendingRes : pendingRes?.data ?? [])
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

  const countByTopic = useMemo(() => countPendingByTopic(pendingList), [pendingList])
  const weakWithCount = useMemo(() => {
    const weak = mastery.weak_points ?? []
    return weak
      .map((t) => ({ name: t, count: countByTopic[t] ?? 0 }))
      .sort((a, b) => b.count - a.count)
  }, [mastery.weak_points, countByTopic])

  const totalPending = pendingList.length
  const weakCount = (mastery.weak_points ?? []).length
  const masteredCount = (mastery.mastered_points ?? []).length
  const totalPoints = weakCount + masteredCount
  const masteryRate = totalPoints > 0 ? Math.round((masteredCount / totalPoints) * 100) : 0
  const trendWeeks = trend.weeks ?? []
  const totalNewMistakes = trendWeeks.reduce((s, w) => s + (w.new_mistakes ?? 0), 0)
  const totalNewMastered = trendWeeks.reduce((s, w) => s + (w.new_mastered ?? 0), 0)

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-10 w-10 animate-spin text-primary-500" aria-hidden />
        <p className="mt-3 text-sm text-gray-500">加载学情图谱中…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-gray-800 sm:text-2xl">学情图谱</h1>
        <p className="mt-0.5 text-sm text-gray-500">知识点掌握情况与学习趋势一览</p>
      </div>

      {/* 概览统计卡片 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="student-card-static flex items-center gap-3 rounded-xl p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
            <AlertCircle className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500">弱项知识点</p>
            <p className="text-lg font-bold tabular-nums text-gray-800">{weakCount}</p>
          </div>
        </div>
        <div className="student-card-static flex items-center gap-3 rounded-xl p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-600">
            <CheckCircle2 className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500">已掌握</p>
            <p className="text-lg font-bold tabular-nums text-gray-800">{masteredCount}</p>
          </div>
        </div>
        <div className="student-card-static flex items-center gap-3 rounded-xl p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600">
            <BookMarked className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500">待攻克错题</p>
            <p className="text-lg font-bold tabular-nums text-gray-800">{totalPending}</p>
          </div>
        </div>
        <div className="student-card-static flex items-center gap-3 rounded-xl p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-600">
            <Target className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500">掌握率</p>
            <p className="text-lg font-bold tabular-nums text-gray-800">{totalPoints > 0 ? `${masteryRate}%` : '—'}</p>
          </div>
        </div>
      </div>

      {/* 近 8 周学情趋势 */}
      {trendWeeks.length > 0 && (
        <div className="student-card-static rounded-xl p-5 sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-medium text-gray-700">
            <BarChart3 className="h-4 w-4" aria-hidden />
            近 8 周学情趋势
          </h2>
          <p className="mb-4 text-xs text-gray-500">
            近 8 周共新增错题 <span className="font-medium text-amber-600">{totalNewMistakes}</span> 道，新掌握{' '}
            <span className="font-medium text-green-600">{totalNewMastered}</span> 道
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={trendWeeks} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
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

      {/* 学习建议 */}
      {weakWithCount.length > 0 && (
        <div className="student-card-static rounded-xl border-primary-200/60 bg-primary-50/50 p-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-primary-800">
            <Lightbulb className="h-4 w-4" aria-hidden />
            学习建议
          </h2>
          <p className="text-sm text-primary-700">
            {weakWithCount[0].count > 0 ? (
              <>
                你有 <strong>{weakCount}</strong> 个弱项知识点，共 <strong>{totalPending}</strong> 道错题待攻克。
                建议优先复习「<strong>{weakWithCount[0].name}</strong>」（{weakWithCount[0].count} 道错题），
                <Link
                  to={`/mistakes?topic=${encodeURIComponent(weakWithCount[0].name)}`}
                  className="ml-1 font-medium text-primary-600 underline decoration-primary-400 underline-offset-2 hover:text-primary-700"
                >
                  去错题本复习 →
                </Link>
              </>
            ) : (
              <>
                你有 <strong>{weakCount}</strong> 个弱项知识点，完成相关题目后错题会出现在错题本。
                <Link to="/exams" className="ml-1 font-medium text-primary-600 underline decoration-primary-400 underline-offset-2 hover:text-primary-700">
                  去「我的题目」做题 →
                </Link>
              </>
            )}
          </p>
        </div>
      )}

      {/* 需加强（弱项） */}
      <div className="student-card-static overflow-hidden rounded-xl border-red-200/80 bg-gradient-to-br from-red-50/90 to-red-50/50 p-5 shadow-sm">
        <div className="flex items-center gap-2 text-red-800">
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
          <span className="font-medium">需加强（弱项）</span>
        </div>
        {(mastery.weak_points ?? []).length === 0 ? (
          <div className="mt-3">
            <p className="text-sm text-red-700">暂无弱项，继续保持！</p>
            <Link
              to="/exams"
              className="mt-3 inline-flex items-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            >
              去「我的题目」做题 →
            </Link>
          </div>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {weakWithCount.map(({ name, count }, i) => (
              <li key={i}>
                <Link
                  to={`/mistakes?topic=${encodeURIComponent(name)}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3.5 py-1.5 text-sm font-medium text-red-800 transition-colors hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                  aria-label={`按弱项「${name}」查看错题本`}
                >
                  {name}
                  {count > 0 && (
                    <span className="rounded-full bg-red-200/80 px-1.5 py-0.5 text-xs">
                      {count} 题
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 已掌握 */}
      <div className="student-card-static overflow-hidden rounded-xl border-green-200/80 bg-gradient-to-br from-green-50/90 to-green-50/50 p-5 shadow-sm">
        <div className="flex items-center gap-2 text-green-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />
          <span className="font-medium">已掌握</span>
        </div>
        {(mastery.mastered_points ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-green-700">暂无已掌握知识点，攻克错题后会在这里展示</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {(mastery.mastered_points ?? []).map((t, i) => (
              <li
                key={i}
                className="rounded-full bg-green-100 px-3.5 py-1.5 text-sm font-medium text-green-800"
              >
                {t}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
