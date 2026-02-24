import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users,
  GraduationCap,
  Edit,
  Trash2,
  Plus,
  Loader2,
  X,
  Search,
  BookMarked,
  CalendarCheck,
  GitBranch,
  LayoutDashboard,
  LogIn,
} from 'lucide-react'
import { getStudents, createStudent, updateStudent, deleteStudent, getStudentReportPdf, getStudentsOverview } from '../services/api'
import { useSubscription } from '../contexts/SubscriptionContext'
import { useStudent } from '../contexts/StudentContext'
import toast from 'react-hot-toast'

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-violet-100 text-violet-700',
  'bg-rose-100 text-rose-700',
]

function getAvatarStyle(name) {
  if (!name || !name.trim()) return AVATAR_COLORS[0]
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx]
}

// 姓氏首字作为头像（中文为姓，多字符名取首字）
function getInitial(name) {
  if (!name || !name.trim()) return '?'
  const trimmed = name.trim()
  return trimmed[0]
}

function getStudentAppUrl() {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_STUDENT_APP_URL) {
    return import.meta.env.VITE_STUDENT_APP_URL
  }
  if (typeof window !== 'undefined' && window.location.port === '5173') {
    return `${window.location.protocol}//${window.location.hostname}:5174`
  }
  return `${typeof window !== 'undefined' ? window.location.origin : ''}/student`
}

function ScoreBadge({ score }) {
  const s = Number(score)
  if (Number.isNaN(s)) return <span className="text-xs text-gray-500">—</span>
  const cls =
    s >= 80
      ? 'bg-green-100 text-green-700'
      : s >= 60
        ? 'bg-amber-100 text-amber-700'
        : 'bg-red-100 text-red-700'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {s} 分
    </span>
  )
}

export default function StudentMgmt() {
  const navigate = useNavigate()
  const { atStudentLimit, refreshSubscription } = useSubscription()
  const { currentStudent, selectStudent } = useStudent()
  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState([])
  const [overviewMap, setOverviewMap] = useState({})
  const [searchTerm, setSearchTerm] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingStudent, setEditingStudent] = useState(null)
  const [saving, setSaving] = useState(false)
  const [reportDownloadingId, setReportDownloadingId] = useState(null)
  const [form, setForm] = useState({
    name: '',
    grade: '八年级',
    class_name: '3班',
    tagsStr: '',
    login_code: '',
    password: '',
  })

  const fetchList = async (params = {}) => {
    setLoading(true)
    try {
      const [res, overviewData] = await Promise.all([
        getStudents(params),
        getStudentsOverview().catch(() => ({ students: [] })),
      ])
      setStudents(Array.isArray(res.data) ? res.data : [])
      const list = Array.isArray(overviewData?.students) ? overviewData.students : []
      const map = {}
      list.forEach((o) => {
        map[o.student_id] = {
          pending_mistake_count: o.pending_mistake_count ?? 0,
          today_review_count: o.today_review_count ?? 0,
          weak_point_count: o.weak_point_count ?? 0,
        }
      })
      setOverviewMap(map)
    } catch (e) {
      toast.error('加载学生列表失败：' + (e.response?.data?.detail ?? e.message))
      setStudents([])
      setOverviewMap({})
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchList()
  }, [])

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return students
    return students.filter((s) => {
      const name = (s.name ?? '').toLowerCase()
      const cls = (s.class_name ?? '').toLowerCase()
      const grade = (s.grade ?? '').toLowerCase()
      return name.includes(q) || cls.includes(q) || grade.includes(q)
    })
  }, [students, searchTerm])

  const openAdd = () => {
    setEditingStudent(null)
    setForm({ name: '', grade: '八年级', class_name: '3班', tagsStr: '', login_code: '', password: '' })
    setModalOpen(true)
  }

  const openEdit = (s) => {
    setEditingStudent(s)
    setForm({
      name: s.name ?? '',
      grade: s.grade ?? '八年级',
      class_name: s.class_name ?? '3班',
      tagsStr: Array.isArray(s.tags) ? s.tags.join('，') : '',
      login_code: s.login_code ?? '',
      password: '',
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingStudent(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const name = form.name?.trim()
    if (!name) {
      toast.error('请填写姓名')
      return
    }
    const tags = form.tagsStr
      ? form.tagsStr
          .split(/[,，\s]+/)
          .map((t) => t.trim())
          .filter(Boolean)
      : []
    setSaving(true)
    try {
      const loginCode = form.login_code?.trim() || null
      const password = form.password?.trim() || null
      const payload = {
        name,
        grade: form.grade?.trim() || '八年级',
        class_name: form.class_name?.trim() || '3班',
        tags,
        ...(editingStudent ? { login_code: loginCode } : loginCode ? { login_code: loginCode } : {}),
        ...(password ? { password } : {}),
      }
      if (editingStudent) {
        await updateStudent(editingStudent.id, payload)
        toast.success('已更新')
      } else {
        await createStudent(payload)
        toast.success('已添加')
      }
      closeModal()
      fetchList()
      refreshSubscription?.()
    } catch (e) {
      if (e.upgradeRequired) {
        toast.error(e.upgradeMessage || '当前套餐学生数已满，请升级套餐')
        navigate('/pricing')
        return
      }
      toast.error((e.response?.data?.detail ?? e.message) || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (s) => {
    if (!window.confirm(`确定删除学生「${s.name}」吗？`)) return
    try {
      await deleteStudent(s.id)
      toast.success('已删除')
      fetchList()
    } catch (e) {
      toast.error('删除失败：' + (e.response?.data?.detail ?? e.message))
    }
  }

  const handleSelectAndGo = (studentId, path) => {
    selectStudent(studentId)
    navigate(path)
  }

  const handleDownloadReport = async (s) => {
    setReportDownloadingId(s.id)
    try {
      const res = await getStudentReportPdf(s.id)
      const blob = res.data
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `学习报告_${(s.name || '学生').replace(/[/\\?%*:|"<>]/g, '_')}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      toast.success('报告已下载')
    } catch (e) {
      toast.error('下载失败：' + (e.response?.data?.detail ?? e.message))
    } finally {
      setReportDownloadingId(null)
    }
  }

  return (
    <div className="min-h-full flex flex-col bg-gray-50/50">
      {/* Header */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-xl font-semibold text-gray-800">学生管理与学情总览</h1>
          <span className="text-sm text-gray-500">
            共 {students.length} 人
            {searchTerm.trim() && ` · 筛选后 ${filtered.length} 人`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="搜索姓名或班级…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 w-72 sm:w-80 rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <button
            type="button"
            onClick={openAdd}
            disabled={atStudentLimit}
            title={atStudentLimit ? '当前套餐学生数已满，请升级' : undefined}
            className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-white shadow-sm ${
              atStudentLimit ? 'cursor-not-allowed bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            <Plus className="h-4 w-4" />
            {atStudentLimit ? '已达上限' : '添加学生'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-6">
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
            <p className="mt-3 text-sm">加载中…</p>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 shadow-sm">
            <Users className="h-14 w-14 text-gray-300" />
            <p className="mt-3 text-sm font-medium text-gray-500">暂无学生</p>
            <p className="mt-1 text-xs text-gray-400">
              {searchTerm.trim() ? '试试调整搜索条件' : '点击「添加学生」录入'}
            </p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((s) => {
              const stats = overviewMap[s.id] || { pending_mistake_count: 0, today_review_count: 0, weak_point_count: 0 }
              const isCurrent = currentStudent?.id === s.id
              return (
                <div
                  key={s.id}
                  className={`group relative rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${
                    isCurrent ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-semibold ${getAvatarStyle(s.name)}`}
                      >
                        {getInitial(s.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-semibold text-gray-800">{s.name}</p>
                          {isCurrent && (
                            <span className="shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-medium text-indigo-700">
                              当前
                            </span>
                          )}
                        </div>
                        <p className="flex items-center gap-1 text-xs text-gray-500">
                          <GraduationCap className="h-3.5 w-3.5 shrink-0" />
                          {s.grade} · {s.class_name}
                        </p>
                      </div>
                    </div>
                    <ScoreBadge score={s.performance_score} />
                  </div>
                  {/* 学情总览：待攻克、今日待复习、弱项 */}
                  <ul className="mt-3 space-y-1.5 border-t border-gray-100 pt-3 text-xs text-gray-600">
                    <li className="flex items-center gap-2">
                      <BookMarked className="h-3.5 w-3.5 text-amber-500" />
                      待攻克错题 <span className="font-medium text-gray-800">{stats.pending_mistake_count}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CalendarCheck className="h-3.5 w-3.5 text-blue-500" />
                      今日待复习 <span className="font-medium text-gray-800">{stats.today_review_count}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <GitBranch className="h-3.5 w-3.5 text-red-500" />
                      弱项知识点 <span className="font-medium text-gray-800">{stats.weak_point_count}</span>
                    </li>
                  </ul>
                  {/* 快捷入口：学情图谱、错题本、首页 */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSelectAndGo(s.id, '/knowledge-graph')}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <GitBranch className="h-3.5 w-3.5" />
                      学情图谱
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectAndGo(s.id, '/mistake-book')}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <BookMarked className="h-3.5 w-3.5" />
                      错题本
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectAndGo(s.id, '/')}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <LayoutDashboard className="h-3.5 w-3.5" />
                      首页
                    </button>
                  </div>
                  {s.login_code && (
                    <div className="mt-3 rounded-lg border border-green-100 bg-green-50/80 px-2.5 py-2 text-xs text-green-800">
                      <div className="flex items-center gap-1.5 font-medium">
                        <LogIn className="h-3.5 w-3.5" />
                        学生端登录码：<code className="rounded bg-green-100 px-1 font-mono">{s.login_code}</code>
                      </div>
                      <p className="mt-1 text-green-700">
                        学生端入口：<a href={getStudentAppUrl()} target="_blank" rel="noopener noreferrer" className="underline">{getStudentAppUrl()}</a>
                      </p>
                    </div>
                  )}
                  {Array.isArray(s.tags) && s.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {s.tags.slice(0, 3).map((t, i) => (
                        <span
                          key={i}
                          className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
                        >
                          {t}
                        </span>
                      ))}
                      {s.tags.length > 3 && (
                        <span className="text-xs text-gray-400">+{s.tags.length - 3}</span>
                      )}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-3 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => handleDownloadReport(s)}
                      disabled={reportDownloadingId === s.id}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
                      title="下载学习报告"
                    >
                      {reportDownloadingId === s.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <span>📥</span>
                      )}
                      <span>下载学习报告</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(s)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-blue-600 hover:bg-blue-50"
                      title="编辑"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(s)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                      title="删除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 className="text-lg font-semibold text-gray-800">
                {editingStudent ? '编辑学生' : '添加学生'}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 px-4 py-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">姓名</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="请输入姓名"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">年级</label>
                  <input
                    type="text"
                    value={form.grade}
                    onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value }))}
                    placeholder="如：八年级"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">班级</label>
                  <input
                    type="text"
                    value={form.class_name}
                    onChange={(e) => setForm((f) => ({ ...f, class_name: e.target.value }))}
                    placeholder="如：3班"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  标签（逗号分隔）
                </label>
                <input
                  type="text"
                  value={form.tagsStr}
                  onChange={(e) => setForm((f) => ({ ...f, tagsStr: e.target.value }))}
                  placeholder="如：数学课代表，几何弱项"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  学生端登录码（选填）
                </label>
                <input
                  type="text"
                  value={form.login_code}
                  onChange={(e) => setForm((f) => ({ ...f, login_code: e.target.value }))}
                  placeholder="学生用此码登录学生端"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <p className="mt-1 text-xs text-amber-600">
                  每个学生的登录码必须唯一，不能与其他学生相同；重复时保存会提示错误。
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  学生端密码（选填）
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder={editingStudent ? '不修改请留空' : '不填则仅用登录码登录'}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingStudent ? '保存' : '添加'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
