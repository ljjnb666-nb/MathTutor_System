import { useState, useRef, useEffect, useMemo } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Home, BookOpen, Users, Settings, ChevronDown, Search, Plus, FileStack, FileUp, Presentation, BookMarked, GitBranch, LogOut, UserCog, Database, MessageCircle, FileText, Calendar, CreditCard, ClipboardCheck, X, Sparkles } from 'lucide-react'
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
    ? 'relative flex h-full w-full flex-col border-r border-slate-800 bg-[#0B0F17] text-slate-200 print:hidden pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)]'
    : 'fixed left-0 top-0 z-10 flex h-screen w-60 flex-col border-r border-slate-800/80 bg-[#0B0F17] text-slate-200 backdrop-blur-2xl print:hidden pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] shadow-2xl'

  return (
    <>
      <aside className={asideClass}>
        {/* Logo 标头区 */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 px-4 py-4 md:px-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 text-white shadow-lg shadow-indigo-500/30">
              <Sparkles className="h-5 w-5" />
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-[#0B0F17]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-base font-black tracking-tight text-white">MathTutor</h1>
                <span className="rounded bg-indigo-500/20 px-1 py-0.2 text-[9px] font-extrabold tracking-wider text-indigo-400 border border-indigo-500/30 uppercase">PRO</span>
              </div>
              <p className="text-[9.5px] font-bold text-slate-400 tracking-wider uppercase">AI Studio Edition</p>
            </div>
          </div>
          {isMobileDrawer && (
            <button
              type="button"
              onClick={onCloseDrawer}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              aria-label="关闭菜单"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* 学生切换器卡片 */}
        <div className="relative border-b border-slate-800/80 p-3" ref={panelRef}>
          <button
            type="button"
            onClick={() => setSwitcherOpen((v) => !v)}
            className="group flex w-full items-center gap-3 rounded-xl border border-slate-800 bg-[#121826] p-2.5 text-left shadow-inner transition-all hover:border-indigo-500/50 hover:bg-[#182033] active:scale-[0.99]"
            aria-expanded={switcherOpen}
            aria-haspopup="listbox"
          >
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-2 ring-indigo-500/30 transition-transform group-hover:scale-105 ${currentStudent ? getAvatarStyle(currentStudent.name) : 'bg-slate-800 text-slate-400'}`}
            >
              {currentStudent ? getInitial(currentStudent.name) : '?'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-400">当前学生档案</p>
              </div>
              <p className="truncate text-xs font-bold text-slate-100 mt-0.5">
                {currentStudent ? currentStudent.name : '未选择档案'}
              </p>
            </div>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${switcherOpen ? 'rotate-180 text-indigo-400' : ''}`}
            />
          </button>

          {switcherOpen && (
            <div className="absolute left-3 right-3 top-full z-30 mt-2 max-h-72 overflow-hidden rounded-2xl border border-slate-700/80 bg-[#111726]/95 backdrop-blur-2xl shadow-2xl animate-fade-in-up">
              <div className="border-b border-slate-800 p-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="搜索学生或班级…"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/80 py-1.5 pl-8 pr-3 text-xs text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
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
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-indigo-600/20 ${
                        currentStudent?.id === s.id ? 'bg-indigo-600/30 font-bold text-indigo-300' : 'text-slate-300'
                      }`}
                    >
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${getAvatarStyle(s.name)}`}
                      >
                        {getInitial(s.name)}
                      </div>
                      <span className="truncate text-xs font-medium">{s.name}</span>
                      <span className="truncate text-[10px] text-slate-500 ml-auto">
                        {s.grade} · {s.class_name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="border-t border-slate-800 p-1.5">
                <button
                  type="button"
                  onClick={handleAddStudent}
                  disabled={atStudentLimit}
                  className={`flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                    atStudentLimit ? 'cursor-not-allowed text-slate-600' : 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600/30'
                  }`}
                  title={atStudentLimit ? '当前套餐学生数已满，请升级' : undefined}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {atStudentLimit ? '已达上限' : '录入新学生档案'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 导航菜单 */}
        <nav className="flex-1 space-y-4 overflow-y-auto p-3">
          {visibleNavGroups.map((group, gIdx) => (
            <div key={gIdx}>
              {group.title && (
                <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-500/90">
                  {group.title}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map(({ to, icon: Icon, label, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    onClick={onCloseDrawer ?? undefined}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-600/30 font-bold before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:bg-indigo-400 before:rounded-r-full'
                          : 'text-slate-400 hover:bg-[#161F33] hover:text-slate-100 active:scale-[0.99]'
                      }`
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0 transition-transform group-hover:scale-110" />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* 底部订阅卡片与设置 */}
        <div className="border-t border-slate-800/80 p-3 space-y-2">
          {subscription?.plan ? (
            <NavLink
              to="/pricing"
              onClick={onCloseDrawer ?? undefined}
              className="group flex w-full flex-col gap-1.5 rounded-xl border border-slate-800 bg-[#121826] p-2.5 text-xs font-medium transition-all hover:border-slate-700 hover:bg-[#182033]"
            >
              <div className="flex w-full items-center justify-between">
                <span className="flex items-center gap-2 font-bold text-slate-200">
                  <CreditCard className="h-3.5 w-3.5 text-indigo-400" />
                  {subscription.plan.name}
                </span>
                <span className="text-[10px] font-bold text-slate-400">
                  {subscription.student_count}/{subscription.max_students}人
                </span>
              </div>
              {/* Mini 进度条 */}
              <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.round(((subscription.student_count ?? 0) / (subscription.max_students || 1)) * 100))}%`,
                  }}
                />
              </div>
            </NavLink>
          ) : (
            <NavLink
              to="/pricing"
              onClick={onCloseDrawer ?? undefined}
              className="flex w-full items-center gap-2.5 rounded-xl border border-slate-800 bg-[#121826] p-2.5 text-xs font-medium text-slate-300 hover:bg-[#182033]"
            >
              <CreditCard className="h-4 w-4 text-indigo-400 shrink-0" />
              <span>套餐与定价</span>
            </NavLink>
          )}
          <div className="flex items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-800/80 bg-[#121826] px-3 py-2 text-xs font-semibold text-slate-400 hover:border-slate-700 hover:bg-[#182033] hover:text-slate-200 transition-all"
              aria-label="系统设置"
            >
              <Settings className="h-3.5 w-3.5 shrink-0" />
              <span>设置</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-950/40 bg-rose-950/20 px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-950/40 transition-all"
              aria-label="退出登录"
            >
              <LogOut className="h-3.5 w-3.5 shrink-0" />
              <span>退出</span>
            </button>
          </div>
        </div>
      </aside>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}
