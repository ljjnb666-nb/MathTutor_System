import { useState, useRef, useEffect, useMemo } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Home, BookOpen, Users, Settings, ChevronDown, Search, Plus, FileStack, FileUp, Presentation, BookMarked, GitBranch, LogOut, UserCog, Database, MessageCircle, FileText, Calendar, CreditCard, ClipboardCheck, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useStudent } from '../contexts/StudentContext'
import { useSubscription } from '../contexts/SubscriptionContext'
import SettingsModal from './SettingsModal'

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

/** 分组导航：便于后续在任一组下拓展新菜单，仅改对应 group.items 即可 */
const navGroups = [
  {
    title: null,
    items: [{ to: '/', icon: LayoutDashboard, label: '首页', end: true }],
  },
  {
    title: '出题与内容',
    items: [
      { to: '/smart-gen', icon: Home, label: '智能出题' },
      { to: '/chat', icon: MessageCircle, label: 'AI 对话' },
      { to: '/question-bank', icon: BookOpen, label: '题库管理' },
      { to: '/knowledge-base', icon: Database, label: '知识库管理' },
      { to: '/exams/import', icon: FileUp, label: '导入试卷' },
      { to: '/ppt', icon: Presentation, label: 'Magic PPT' },
    ],
  },
  {
    title: '学情与练习',
    items: [
      { to: '/schedule', icon: Calendar, label: '排课' },
      { to: '/homework-progress', icon: ClipboardCheck, label: '学生做题情况' },
      { to: '/mistake-book', icon: BookMarked, label: '错题本' },
      { to: '/knowledge-graph', icon: GitBranch, label: '学情图谱' },
      { to: '/reports', icon: FileText, label: '课后与学习报告' },
      { to: '/exams', icon: FileStack, label: '我的试卷', end: true },
    ],
  },
  {
    title: '系统管理',
    items: [
      { to: '/student-mgmt', icon: Users, label: '学生管理与总览' },
      { to: '/pricing', icon: CreditCard, label: '套餐与定价' },
      { to: '/admin-users', icon: UserCog, label: '用户管理', end: true },
    ],
  },
]

export default function Sidebar({ onCloseDrawer }) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const panelRef = useRef(null)
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { currentStudent, students, selectStudent, refreshStudents } = useStudent()
  const { subscription, atStudentLimit } = useSubscription()

  const visibleNavGroups = useMemo(
    () =>
      navGroups.map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => item.to !== '/admin-users' || user?.role === 'admin'
        ),
      })).filter((group) => group.items.length > 0),
    [user?.role]
  )

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  useEffect(() => {
    if (switcherOpen) refreshStudents()
  }, [switcherOpen, refreshStudents])

  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setSwitcherOpen(false)
    }
    if (switcherOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [switcherOpen])

  const filteredStudents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return students
    return students.filter(
      (s) =>
        (s.name ?? '').toLowerCase().includes(q) ||
        (s.class_name ?? '').toLowerCase().includes(q) ||
        (s.grade ?? '').toLowerCase().includes(q)
    )
  }, [students, searchTerm])

  const handleSelect = (id) => {
    selectStudent(id)
    setSwitcherOpen(false)
    setSearchTerm('')
  }

  const handleAddStudent = () => {
    setSwitcherOpen(false)
    navigate('/student-mgmt')
  }

  const isMobileDrawer = !!onCloseDrawer
  const asideClass = isMobileDrawer
    ? 'relative flex h-full w-full flex-col border-r border-gray-100 bg-white print:hidden pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)]'
    : 'fixed left-0 top-0 z-10 flex h-screen w-56 flex-col border-r border-gray-200 bg-gray-50 print:hidden pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)]'

  return (
    <>
      <aside className={asideClass}>
        {/* 移动端：标题栏 + 关闭按钮；桌面端：仅标题 */}
        <div className="flex items-center justify-between gap-2 border-b border-gray-100 md:border-gray-200 p-4 md:p-5">
          <h1 className="text-base md:text-lg font-bold bg-gradient-to-r from-primary-600 to-blue-500 bg-clip-text text-transparent truncate">初中数学备课助手</h1>
          {isMobileDrawer && (
            <button
              type="button"
              onClick={onCloseDrawer}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-700 touch-manipulation"
              aria-label="关闭菜单"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* 学生切换器 */}
        <div className="relative border-b border-gray-100 md:border-gray-200 p-3" ref={panelRef}>
          <button
            type="button"
            onClick={() => setSwitcherOpen((v) => !v)}
            className="flex w-full items-center gap-3 rounded-xl md:rounded-lg border border-gray-200 bg-gray-50/80 md:bg-white px-3 py-3 md:py-2.5 text-left shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50"
            aria-expanded={switcherOpen}
            aria-haspopup="listbox"
          >
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${currentStudent ? getAvatarStyle(currentStudent.name) : 'bg-gray-100 text-gray-500'}`}
            >
              {currentStudent ? getInitial(currentStudent.name) : '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-gray-500">当前学生</p>
              <p className="truncate text-sm font-medium text-gray-800">
                {currentStudent ? currentStudent.name : '未选择'}
              </p>
            </div>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${switcherOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {switcherOpen && (
            <div className="absolute left-3 right-3 top-full z-20 mt-1 max-h-72 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
              <div className="border-b border-gray-100 p-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="搜索姓名或班级…"
                    className="w-full rounded-md border border-gray-200 py-2 pl-8 pr-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              </div>
              <ul className="max-h-44 overflow-y-auto py-1" role="listbox">
                {filteredStudents.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={currentStudent?.id === s.id}
                      onClick={() => handleSelect(s.id)}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 ${
                        currentStudent?.id === s.id ? 'bg-blue-50 text-blue-700' : 'text-gray-800'
                      }`}
                    >
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${getAvatarStyle(s.name)}`}
                      >
                        {getInitial(s.name)}
                      </div>
                      <span className="truncate text-sm font-medium">{s.name}</span>
                      <span className="truncate text-xs text-gray-500">
                        {s.grade} · {s.class_name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="border-t border-gray-100 p-1">
                <button
                  type="button"
                  onClick={handleAddStudent}
                  disabled={atStudentLimit}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
                    atStudentLimit ? 'cursor-not-allowed text-gray-400' : 'text-indigo-600 hover:bg-indigo-50'
                  }`}
                  title={atStudentLimit ? '当前套餐学生数已满，请升级' : undefined}
                >
                  <Plus className="h-4 w-4" />
                  {atStudentLimit ? '已达上限' : '新增学生'}
                </button>
              </div>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto p-3 md:space-y-4">
          {visibleNavGroups.map((group, gIdx) => (
            <div key={gIdx}>
              {group.title && (
                <p className="mb-2 md:mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {group.title}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map(({ to, icon: Icon, label, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    onClick={onCloseDrawer ?? undefined}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-xl md:rounded-lg px-3 py-3 md:py-2.5 text-sm font-medium transition-colors ${
                        isActive ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-100 active:bg-gray-50'
                      }`
                    }
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-gray-100 md:border-gray-200 p-3 space-y-0.5">
          {subscription?.plan ? (
            <NavLink
              to="/pricing"
              onClick={onCloseDrawer ?? undefined}
              className="flex w-full flex-col items-start gap-0.5 rounded-xl md:rounded-lg px-3 py-3 md:py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              <span className="flex w-full items-center gap-3">
                <CreditCard className="h-5 w-5 shrink-0" />
                <span className="truncate">
                  {subscription.plan.name} · {subscription.student_count}/{subscription.max_students} 学生
                </span>
              </span>
              {user?.role !== 'admin' && subscription.period_end && (() => {
                const d = typeof subscription.period_end === 'string' ? new Date(subscription.period_end) : subscription.period_end
                const daysLeft = d ? Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null
                const soon = daysLeft != null && daysLeft >= 0 && daysLeft <= 7
                const dateStr = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : ''
                return (
                  <span className={`truncate pl-8 text-xs ${soon ? 'text-amber-600' : 'text-gray-500'}`}>
                    到期 {dateStr}{soon ? ` · ${daysLeft} 天` : ''}
                  </span>
                )
              })()}
              {user?.role !== 'admin' && !atStudentLimit && subscription.max_students != null && (
                <span className="truncate pl-8 text-xs text-gray-500">
                  还可添加 {subscription.max_students - (subscription.student_count ?? 0)} 人
                </span>
              )}
            </NavLink>
          ) : (
            <NavLink
              to="/pricing"
              onClick={onCloseDrawer ?? undefined}
              className="flex w-full items-center gap-3 rounded-xl md:rounded-lg px-3 py-3 md:py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              <CreditCard className="h-5 w-5 shrink-0" />
              <span>套餐与定价</span>
            </NavLink>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex w-full items-center gap-3 rounded-xl md:rounded-lg px-3 py-3 md:py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
            aria-label="打开设置"
          >
            <Settings className="h-5 w-5 shrink-0" />
            <span>设置</span>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl md:rounded-lg px-3 py-3 md:py-2.5 text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600"
            aria-label="退出登录"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span>退出登录</span>
          </button>
        </div>
      </aside>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}
