import { useState, useRef, useEffect, useMemo } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Settings,
  ChevronDown,
  Search,
  Plus,
  LogOut,
  X,
  Compass,
  GraduationCap,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useStudent } from '../contexts/StudentContext'
import { useSubscription } from '../contexts/SubscriptionContext'
import { getVisibleNavGroups } from '../config/navigation'

const AVATAR_COLORS = [
  'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30',
  'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  'bg-violet-500/20 text-violet-400 border border-violet-500/30',
  'bg-rose-500/20 text-rose-400 border border-rose-500/30',
  'bg-sky-500/20 text-sky-400 border border-sky-500/30',
]

function getAvatarStyle(name) {
  if (!name || !name.trim()) return AVATAR_COLORS[0]
  return AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length]
}

function getInitial(name) {
  if (!name || !name.trim()) return '?'
  return String(name).trim()[0]
}

export default function Sidebar({ onCloseDrawer, isCollapsed = false, onToggleCollapse }) {
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const panelRef = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const { currentStudent, students, selectStudent, refreshStudents } = useStudent()
  const { atStudentLimit } = useSubscription()

  const visibleNavGroups = useMemo(
    () => getVisibleNavGroups(user?.role),
    [user?.role]
  )

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  // 路由跳转时自动收起学生选择下拉面板
  useEffect(() => {
    setSwitcherOpen(false)
  }, [location.pathname])

  // 打开学生切换器时拉取最新档案
  useEffect(() => {
    if (switcherOpen) refreshStudents()
  }, [switcherOpen, refreshStudents])

  // 点击外部关闭下拉浮层
  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setSwitcherOpen(false)
      }
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

  return (
    <aside
      className={`relative flex h-full flex-col border-r select-none transition-all duration-200 ${
        isMobileDrawer
          ? 'w-full bg-[#0E1524] text-slate-200 border-slate-800'
          : `${isCollapsed ? 'w-16' : 'w-60'} bg-[#0E1524] text-slate-200 border-slate-800/80 dark:bg-[#0E1524] dark:border-slate-800/80 light:bg-white light:text-slate-800 light:border-slate-200`
      }`}
    >
      {/* 1. TutorPro 品牌头部 */}
      <div className="flex h-15 items-center justify-between px-4 border-b border-slate-800/80 dark:border-slate-800/80 light:border-slate-200">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-500/20">
            <GraduationCap className="h-4 w-4" aria-hidden="true" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-tight text-white dark:text-white light:text-slate-900">
                  TutorPro
                </span>
                <span className="rounded bg-indigo-500/10 px-1 py-0.2 text-[9px] font-semibold text-indigo-400 border border-indigo-500/20">
                  AI
                </span>
              </div>
              <p className="truncate text-[10px] text-slate-400 font-medium">
                AI Teaching Workspace
              </p>
            </div>
          )}
        </div>

        {/* 移动端关闭按钮 */}
        {isMobileDrawer && (
          <button
            type="button"
            onClick={onCloseDrawer}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            aria-label="关闭菜单"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* 桌面端折叠切换按钮 */}
        {!isMobileDrawer && onToggleCollapse && !isCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden md:flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            aria-label="收起侧栏"
            title="收起侧栏"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* 桌面端在折叠状态下展示展开入口 */}
      {!isMobileDrawer && isCollapsed && onToggleCollapse && (
        <div className="p-2 border-b border-slate-800/80 dark:border-slate-800/80 light:border-slate-200 flex justify-center">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            aria-label="展开侧栏"
            title="展开侧栏"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 2. 学生上下文切换卡片 (Student Switcher) */}
      {!isCollapsed ? (
        <div className="relative border-b border-slate-800/80 p-2.5 dark:border-slate-800/80 light:border-slate-200" ref={panelRef}>
          <button
            type="button"
            onClick={() => setSwitcherOpen((v) => !v)}
            className="group flex w-full items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-900/60 p-2 text-left transition-all hover:border-slate-700 hover:bg-slate-900 active:scale-[0.99] dark:bg-slate-900/60 dark:border-slate-800 light:bg-slate-50 light:border-slate-200 light:hover:bg-slate-100"
            aria-expanded={switcherOpen}
            aria-haspopup="listbox"
          >
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${
                currentStudent ? getAvatarStyle(currentStudent.name) : 'bg-slate-800 text-slate-400'
              }`}
            >
              {currentStudent ? getInitial(currentStudent.name) : '?'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <p className="truncate text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  当前学生
                </p>
              </div>
              <p className="truncate text-xs font-semibold text-slate-200 mt-0.5 dark:text-slate-200 light:text-slate-800">
                {currentStudent ? currentStudent.name : '未选择档案'}
              </p>
            </div>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200 ${
                switcherOpen ? 'rotate-180 text-indigo-400' : ''
              }`}
            />
          </button>

          {/* 下拉浮层 (严格满足 Sidebar.test.jsx 所需所有元素与文本) */}
          {switcherOpen && (
            <div className="absolute left-2.5 right-2.5 top-full z-40 mt-1.5 max-h-72 overflow-hidden rounded-xl border border-slate-700/90 bg-[#121B2F] shadow-xl backdrop-blur-md dark:bg-[#121B2F] dark:border-slate-700/90 light:bg-white light:border-slate-200">
              <div className="border-b border-slate-800 p-2 dark:border-slate-800 light:border-slate-200">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="搜索学生或班级…"
                    className="w-full rounded-md border border-slate-700 bg-slate-900/90 py-1.5 pl-8 pr-2.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:bg-slate-900/90 dark:border-slate-700 light:bg-slate-50 light:border-slate-200 light:text-slate-800"
                  />
                </div>
              </div>

              <ul className="max-h-44 overflow-y-auto py-1" role="listbox">
                {filteredStudents.length > 0 ? (
                  filteredStudents.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={currentStudent?.id === s.id}
                        onClick={() => handleSelect(s.id)}
                        className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs transition-colors hover:bg-indigo-600/15 ${
                          currentStudent?.id === s.id
                            ? 'bg-indigo-600/20 font-semibold text-indigo-400'
                            : 'text-slate-300 dark:text-slate-300 light:text-slate-700'
                        }`}
                      >
                        <div
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold ${getAvatarStyle(
                            s.name
                          )}`}
                        >
                          {getInitial(s.name)}
                        </div>
                        <span className="truncate flex-1">{s.name}</span>
                        <span className="truncate text-[10px] text-slate-500">
                          {s.grade ? `${s.grade} ` : ''}
                          {s.class_name || ''}
                        </span>
                      </button>
                    </li>
                  ))
                ) : (
                  <li className="px-3 py-3 text-center text-xs text-slate-500">
                    未找到匹配的学生
                  </li>
                )}
              </ul>

              <div className="border-t border-slate-800 p-1.5 dark:border-slate-800 light:border-slate-200">
                <button
                  type="button"
                  onClick={handleAddStudent}
                  disabled={atStudentLimit}
                  className={`flex w-full items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all ${
                    atStudentLimit
                      ? 'cursor-not-allowed text-slate-600'
                      : 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-600/25'
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
      ) : (
        <div className="p-2 border-b border-slate-800/80 flex justify-center">
          <div
            title={currentStudent ? `当前学生: ${currentStudent.name}` : '未选择学生'}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold ${
              currentStudent ? getAvatarStyle(currentStudent.name) : 'bg-slate-800 text-slate-400'
            }`}
          >
            {currentStudent ? getInitial(currentStudent.name) : '?'}
          </div>
        </div>
      )}

      {/* 3. 导航分组 */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3" aria-label="侧边栏主导航">
        {visibleNavGroups.map((group, gIdx) => (
          <div key={gIdx} className="space-y-0.5">
            {group.title && !isCollapsed && (
              <p className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
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
                  title={isCollapsed ? label : undefined}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-all ${
                      isCollapsed ? 'justify-center' : ''
                    } ${
                      isActive
                        ? 'bg-indigo-600 text-white font-semibold shadow-sm shadow-indigo-600/25'
                        : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 active:scale-[0.99] dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100 light:text-slate-600 light:hover:bg-slate-100 light:hover:text-slate-900'
                    }`
                  }
                >
                  <Icon className="h-4 w-4 shrink-0 transition-transform group-hover:scale-105" />
                  {!isCollapsed && <span className="truncate">{label}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* 4. 底部设置与退出 */}
      <div className="border-t border-slate-800/80 p-2.5 space-y-1 dark:border-slate-800/80 light:border-slate-200">
        <NavLink
          to="/settings"
          onClick={onCloseDrawer ?? undefined}
          title={isCollapsed ? '系统设置' : undefined}
          className={({ isActive }) =>
            `flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-all ${
              isCollapsed ? 'justify-center' : ''
            } ${
              isActive
                ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 dark:text-slate-400 dark:hover:bg-slate-800/60 light:text-slate-600 light:hover:bg-slate-100'
            }`
          }
        >
          <Settings className="h-4 w-4 shrink-0" />
          {!isCollapsed && <span>系统设置</span>}
        </NavLink>

        <button
          type="button"
          onClick={handleLogout}
          title={isCollapsed ? '退出登录' : undefined}
          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-rose-400 hover:bg-rose-950/20 hover:text-rose-300 transition-all ${
            isCollapsed ? 'justify-center' : ''
          }`}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!isCollapsed && <span>退出登录</span>}
        </button>
      </div>
    </aside>
  )
}
