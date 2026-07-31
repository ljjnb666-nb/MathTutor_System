import { useState, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { Search, Bell, ChevronDown } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { getPageTitle } from '../config/route-meta'

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-violet-100 text-violet-700',
  'bg-rose-100 text-rose-700',
]

function getAvatarStyle(name) {
  if (!name || !name.trim()) return AVATAR_COLORS[0]
  return AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length]
}

function getInitial(name) {
  if (!name || !name.trim()) return '?'
  return String(name).trim()[0]
}

// 全局功能搜索项（复用 Sidebar 的导航配置）
const SEARCHABLE_FEATURES = [
  { label: '首页', path: '/', keywords: ['home', 'dashboard', '仪表盘'] },
  { label: '智能出题', path: '/smart-gen', keywords: ['ai', 'generate', '生成'] },
  { label: 'AI 对话', path: '/chat', keywords: ['chat', 'conversation', '聊天'] },
  { label: 'AI 教师助手', path: '/teacher-agent', keywords: ['agent', 'assistant', '助手', '助理'] },
  { label: '题库管理', path: '/question-bank', keywords: ['question', 'bank', '题目'] },
  { label: '知识库管理', path: '/knowledge-base', keywords: ['knowledge', 'base', '知识'] },
  { label: '导入试卷', path: '/exams/import', keywords: ['import', 'upload', '上传'] },
  { label: 'Magic PPT', path: '/ppt', keywords: ['ppt', 'presentation', '幻灯片', '课件'] },
  { label: '排课', path: '/schedule', keywords: ['schedule', 'calendar', '日程', '课表'] },
  { label: '学生做题情况', path: '/homework-progress', keywords: ['homework', 'progress', '作业', '进度'] },
  { label: '错题本', path: '/mistake-book', keywords: ['mistake', 'error', '错题', '错误'] },
  { label: '学情图谱', path: '/knowledge-graph', keywords: ['graph', 'knowledge', '图谱', '知识'] },
  { label: '课后与学习报告', path: '/reports', keywords: ['report', 'analysis', '报告', '分析'] },
  { label: '我的试卷', path: '/exams', keywords: ['exam', 'paper', '试卷', '考试'] },
  { label: '学生管理与总览', path: '/student-mgmt', keywords: ['student', 'management', '学生', '管理'] },
  { label: '套餐与定价', path: '/pricing', keywords: ['pricing', 'plan', '套餐', '定价', '价格'] },
  { label: '设置', path: '/settings', keywords: ['settings', 'config', '设置', '配置'] },
]

// 管理员才能看到的功能
const ADMIN_ONLY_FEATURES = [
  { label: '用户管理', path: '/admin-users', keywords: ['user', 'admin', '用户', '管理员'] },
]

export default function TopHeader() {
  const location = useLocation()
  const { user } = useAuth()
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [notificationOpen, setNotificationOpen] = useState(false)

  // 动态页面标题
  const pageTitle = useMemo(() => getPageTitle(location.pathname), [location.pathname])

  // 当前日期
  const currentDate = useMemo(() => {
    const now = new Date()
    return now.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    })
  }, [])

  // 可搜索功能列表（根据用户权限过滤）
  const searchableFeatures = useMemo(() => {
    const base = [...SEARCHABLE_FEATURES]
    if (user?.role === 'admin') {
      base.push(...ADMIN_ONLY_FEATURES)
    }
    return base
  }, [user?.role])

  // 搜索过滤
  const filteredFeatures = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return []

    return searchableFeatures.filter(feature => {
      return (
        feature.label.toLowerCase().includes(q) ||
        feature.keywords.some(keyword => keyword.includes(q))
      )
    }).slice(0, 8) // 最多显示 8 个结果
  }, [searchTerm, searchableFeatures])

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    if (filteredFeatures.length > 0) {
      window.location.href = filteredFeatures[0].path
      setSearchOpen(false)
      setSearchTerm('')
    }
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl px-4 sm:px-6 lg:px-8 shadow-sm">
      {/* 左侧：页面标题 */}
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-black text-slate-900 tracking-tight">
          {pageTitle}
        </h1>
      </div>

      {/* 中间：搜索栏（桌面端） */}
      <div className="hidden md:flex flex-1 max-w-md">
        <div className="relative w-full">
          <form onSubmit={handleSearchSubmit}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
                placeholder="搜索功能..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
              />
            </div>
          </form>

          {/* 搜索结果下拉 */}
          {searchOpen && searchTerm.trim() && (
            <div className="absolute top-full left-0 right-0 mt-2 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl animate-fade-in-up">
              {filteredFeatures.length > 0 ? (
                <ul className="py-1">
                  {filteredFeatures.map((feature) => (
                    <li key={feature.path}>
                      <a
                        href={feature.path}
                        className="block px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                      >
                        {feature.label}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-4 py-8 text-center text-sm text-slate-400">
                  未找到匹配的功能
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 右侧：日期、通知、用户 */}
      <div className="flex items-center gap-3">
        {/* 当前日期（桌面端） */}
        <div className="hidden lg:block text-xs font-medium text-slate-500">
          {currentDate}
        </div>

        {/* 通知按钮 */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setNotificationOpen(!notificationOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50/50 text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition-all"
            aria-label="通知"
          >
            <Bell className="h-4 w-4" />
          </button>

          {/* 通知下拉（暂无通知） */}
          {notificationOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-xl animate-fade-in-up">
              <div className="border-b border-slate-100 px-4 py-3">
                <h3 className="text-sm font-bold text-slate-900">通知</h3>
              </div>
              <div className="px-4 py-8 text-center text-sm text-slate-400">
                暂无通知
              </div>
            </div>
          )}
        </div>

        {/* 用户信息 */}
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
              user ? getAvatarStyle(user.username) : 'bg-slate-200 text-slate-500'
            }`}
          >
            {user ? getInitial(user.username) : '?'}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-bold text-slate-900">
              {user?.username || '未登录'}
            </p>
            <p className="text-xs text-slate-500">
              {user?.role === 'admin' ? '管理员' : '教师'}
            </p>
          </div>
        </div>
      </div>
    </header>
  )
}
