import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { BookMarked, CheckCircle2, Loader2, RefreshCw, Award, Search, Filter } from 'lucide-react'
import Latex from '../components/Latex'
import toast from 'react-hot-toast'
import {
  getStudentMistakes,
  studentMistakeReview,
  studentMistakeMaster,
} from '../services/api'

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
  } catch {
    return String(iso)
  }
}

function safeLatex(text) {
  if (!text || typeof text !== 'string') return ''
  try {
    return text.replace(/\\\[/g, '$$').replace(/\\\]/g, '$$').replace(/\\\(/g, '$').replace(/\\\)/g, '$')
  } catch {
    return text
  }
}

/** 去掉选项文本开头的 "A." "B." 等前缀，避免重复显示 */
function getOptionDisplayText(opt) {
  if (typeof opt !== 'string') return String(opt ?? '')
  const s = opt.trim()
  const m = s.match(/^\s*[A-Za-z][.．、]\s*/)
  return m ? s.slice(m[0].length).trim() || s : s
}

/** 从错题 topic 字符串拆出知识点集合（与后端 _split_topics 一致） */
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

/** 题目/解析/来源中是否包含关键词（忽略 LaTeX 部分，纯文本匹配） */
function textContains(text, keyword) {
  if (!keyword || !keyword.trim()) return true
  if (!text || typeof text !== 'string') return false
  const k = keyword.trim().toLowerCase()
  const t = text.replace(/\\[^\s]+|{[^}]*}/g, ' ').replace(/\s+/g, ' ').toLowerCase()
  return t.includes(k)
}

export default function MistakeBookPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const reviewDue = searchParams.get('review_due') === '1' || searchParams.get('review_due') === 'true'
  const topicFromUrl = searchParams.get('topic') ?? ''

  const [tab, setTab] = useState(reviewDue ? 'due_today' : 'pending')
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState(null)
  const [keyword, setKeyword] = useState('')
  const [topicFilter, setTopicFilter] = useState(topicFromUrl)

  const fetchList = async () => {
    setLoading(true)
    try {
      const params = {}
      if (tab === 'pending') params.status = 'pending'
      else if (tab === 'mastered') params.status = 'mastered'
      else if (tab === 'due_today') params.review_due = true
      if (topicFilter) params.topic = topicFilter
      const data = await getStudentMistakes(params)
      setList(Array.isArray(data) ? data : [])
    } catch (e) {
      toast.error('加载失败：' + (e.response?.data?.detail ?? e.message))
      setList([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchList()
  }, [tab, topicFilter])

  // 从 URL 同步 topic 到本地筛选（如从学情图谱跳转过来）
  useEffect(() => {
    if (topicFromUrl !== topicFilter) setTopicFilter(topicFromUrl)
  }, [topicFromUrl])

  const uniqueTopics = useMemo(() => {
    const set = new Set()
    list.forEach((m) => splitTopics(m.topic).forEach((t) => set.add(t)))
    return Array.from(set).sort()
  }, [list])

  const filteredList = useMemo(() => {
    if (!keyword.trim()) return list
    const k = keyword.trim()
    return list.filter(
      (m) =>
        textContains(m.content, k) ||
        textContains(m.solution, k) ||
        textContains(m.source, k)
    )
  }, [list, keyword])

  const setTopicAndUrl = (t) => {
    setTopicFilter(t)
    const next = new URLSearchParams(searchParams)
    if (t) next.set('topic', t)
    else next.delete('topic')
    setSearchParams(next, { replace: true })
  }

  const handleReview = async (id) => {
    setActionId(id)
    try {
      await studentMistakeReview(id)
      toast.success('已记录复习')
      fetchList()
    } catch (e) {
      toast.error(e.response?.data?.detail ?? '操作失败')
    } finally {
      setActionId(null)
    }
  }

  const handleMaster = async (id) => {
    setActionId(id)
    try {
      await studentMistakeMaster(id)
      toast.success('已标记为掌握')
      fetchList()
    } catch (e) {
      toast.error(e.response?.data?.detail ?? '操作失败')
    } finally {
      setActionId(null)
    }
  }

  if (loading && list.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500" aria-hidden />
        <p className="mt-3 text-sm text-gray-500">加载错题本中…</p>
      </div>
    )
  }

  const emptyHint =
    tab === 'pending'
      ? '暂无待攻克错题，完成作业后答错的题目会出现在这里'
      : tab === 'due_today'
        ? '今日没有待复习的错题'
        : '暂无已掌握的记录'

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-gray-800 sm:text-2xl">错题本</h1>
        <p className="mt-0.5 text-sm text-gray-500">按状态筛选并复习错题</p>
      </div>

      <div className="flex gap-1 rounded-btn border border-gray-200 bg-white p-1 shadow-card">
        {[
          { key: 'pending', label: '待攻克', icon: BookMarked },
          { key: 'due_today', label: '今日待复习', icon: RefreshCw },
          { key: 'mastered', label: '已掌握', icon: Award },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-all sm:flex-none ${
              tab === key
                ? 'bg-primary-100 text-primary-700 shadow-sm'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
            }`}
            aria-pressed={tab === key}
            aria-label={`${label}错题`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {(list.length > 0 || topicFilter || keyword.trim()) && (
        <div className="flex flex-wrap items-center gap-2 rounded-card border border-gray-200 bg-white p-3 shadow-card">
          <div className="relative min-w-[140px] flex-1 sm:min-w-[180px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
            <input
              type="search"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="按题目/解析/来源搜索"
              className="w-full rounded-btn border border-gray-200 py-2 pl-9 pr-3 text-sm transition-colors placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              aria-label="按关键词搜索错题"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Filter className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />
            <select
              value={topicFilter}
              onChange={(e) => setTopicAndUrl(e.target.value)}
              className="rounded-btn border border-gray-200 py-2 pl-3 pr-8 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              aria-label="按知识点筛选"
            >
              <option value="">全部知识点</option>
              {uniqueTopics.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          {(topicFilter || keyword.trim()) && (
            <button
              type="button"
              onClick={() => { setTopicAndUrl(''); setKeyword('') }}
              className="rounded-btn px-2.5 py-1.5 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
              aria-label="清除筛选与搜索"
            >
              清除
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12" role="status" aria-live="polite">
          <Loader2 className="h-10 w-10 animate-spin text-blue-500" aria-hidden />
        </div>
      ) : list.length === 0 ? (
        <div className="student-card-static flex flex-col items-center justify-center rounded-card py-12 px-6 text-center">
          <p className="text-gray-600">{emptyHint}</p>
          <div className="mt-5">
            {tab === 'pending' && (
              <Link to="/exams" className="inline-flex items-center rounded-btn bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-card transition-all hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2">
                去「我的题目」做题 →
              </Link>
            )}
            {tab === 'due_today' && (
              <Link to="/mistakes" className="inline-flex items-center rounded-btn bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-card transition-all hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2">
                去错题本待攻克复习 →
              </Link>
            )}
            {tab === 'mastered' && (
              <Link to="/" className="inline-flex items-center rounded-btn bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-card transition-all hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2">
                去首页看学情 →
              </Link>
            )}
          </div>
        </div>
      ) : filteredList.length === 0 ? (
        <div className="student-card-static rounded-card py-12 text-center">
          <p className="text-gray-600">没有匹配「{topicFilter || keyword.trim()}」的错题，试试调整筛选或关键词</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {filteredList.map((m) => (
            <li key={m.id} className="student-card-static rounded-card p-5">
              <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
                <span>{m.topic}</span>
                <span>·</span>
                <span>{m.source}</span>
                {m.next_review_date && (
                  <>
                    <span>·</span>
                    <span>下次复习 {formatDate(m.next_review_date)}</span>
                  </>
                )}
              </div>
              <div className="prose prose-sm max-w-none text-gray-800">
                <Latex>{safeLatex(m.content)}</Latex>
                {Array.isArray(m.options) && m.options.length > 0 && (
                  <ul className="mt-2 list-none space-y-1 pl-0">
                    {m.options.map((opt, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="shrink-0 font-medium">{String.fromCharCode(65 + i)}.</span>
                        <span><Latex>{safeLatex(getOptionDisplayText(opt))}</Latex></span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {m.solution && (
                <div className="mt-3 border-t border-gray-100 pt-3 text-sm text-gray-600">
                  <span className="font-medium">解析/答案：</span>
                  <Latex>{safeLatex(m.solution)}</Latex>
                </div>
              )}
              {tab !== 'mastered' && (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleReview(m.id)}
                    disabled={actionId !== null}
                    className="inline-flex items-center gap-1.5 rounded-btn bg-primary-600 px-3 py-2 text-sm font-medium text-white shadow-card transition-all hover:bg-primary-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                    aria-label="复习一次"
                  >
                    {actionId === m.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
                    复习一次
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMaster(m.id)}
                    disabled={actionId !== null}
                    className="inline-flex items-center gap-1.5 rounded-btn border border-green-600 bg-white px-3 py-2 text-sm font-medium text-green-600 transition-colors hover:bg-green-50 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                    aria-label="标记为已掌握"
                  >
                    {actionId === m.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
                    标记掌握
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
