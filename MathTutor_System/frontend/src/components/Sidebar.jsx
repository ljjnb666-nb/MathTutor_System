import { useState, useRef, useEffect, useMemo } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Settings,
  ChevronDown,
  Search,
  Plus,
  LogOut,
  X,
  GraduationCap,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useStudent } from '../contexts/StudentContext'
import { useSubscription } from '../contexts/SubscriptionContext'
import { getVisibleNavGroups } from '../config/navigation'

const AVATAR_COLORS = [
  'bg-indigo-500/15 text-indigo-400 border border-indigo-500/25',
  'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
  'bg-amber-500/15 text-amber-400 border border-amber-500/25',
  'bg-violet-500/15 text-violet-400 border border-violet-500/25',
  'bg-rose-500/15 text-rose-400 border border-rose-500/25',
  'bg-sky-500/15 text-sky-400 border border-sky-500/25',
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
      className={`relative flex h-full flex-col border-r select-none transition-all duration-200 bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border-[var(--color-border-default)] ${
        isMobileDrawer ? 'w-full shadow-2xl' : isCollapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* 1. TutorPro 品牌头部 */}
      <div className="flex h-14 items-center justify-between px-4 border-b border-[var(--color-border-default)]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-600)] text-white shadow-sm shadow-indigo-500/20">
            <GraduationCap className="h-4 w-4" aria-hidden="true" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-tight text-[var(--color-text-primary)]">
                  TutorPro
                </span>
                <span className="rounded bg-[var(--color-brand-subtle)] px-1 py-0.2 text-[9px] font-semibold text-[var(--color-brand-text)] border border-[var(--color-border-subtle)]">
                  AI
                </span>
              </div>
              <p className="truncate text-[10px] text-[var(--color-text-muted)] font-medium">
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
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
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
            className="hidden md:flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            aria-label="收起侧栏"
            title="收起侧栏"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* 桌面端在折叠状态下展示展开入口 */}
      {!isMobileDrawer && isCollapsed && onToggleCollapse && (
        <div className="p-2 border-b border-[var(--color-border-default)] flex justify-center">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            aria-label="展开侧栏"
            title="展开侧栏"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 2. 学生上下文切换卡片 (Student Switcher) */}
      {!isCollapsed ? (
        <div className="relative border-b border-[var(--color-border-default)] p-2.5" ref={panelRef}>
          <button
            type="button"
            onClick={() => setSwitcherOpen((v) => !v)}
            className="group flex w-full items-center gap-2.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-2 text-left transition-all hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-surface-hover)] active:scale-[0.99]"
            aria-expanded={switcherOpen}
            aria-haspopup="listbox"
          >
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${
                currentStudent ? getAvatarStyle(currentStudent.name) : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]'
              }`}
            >
              {currentStudent ? getInitial(currentStudent.name) : '?'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
                <p className="truncate text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                  当前学生
                </p>
              </div>
              <p className="truncate text-xs font-semibold text-[var(--color-text-primary)] mt-0.5">
                {currentStudent ? currentStudent.name : '未选择档案'}
              </p>
            </div>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)] transition-transform duration-200 ${
                switcherOpen ? 'rotate-180 text-[var(--color-brand-text)]' : ''
              }`}
            />
          </button>

          {/* 下拉浮层 (严格满足 Sidebar.test.jsx 所需所有元素与文本) */}
          {switcherOpen && (
            <div className="absolute left-2.5 right-2.5 top-full z-40 mt-1.5 max-h-72 overflow-hidden rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-bg-surface-raised)] shadow-xl backdrop-blur-md">
              <div className="border-b border-[var(--color-border-default)] p-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="搜索学生或班级…"
                    className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-input)] py-1.5 pl-8 pr-2.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-brand-500)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]"
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
                        className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--color-brand-subtle)] ${
                          currentStudent?.id === s.id
                            ? 'bg-[var(--color-brand-subtle)] font-semibold text-[var(--color-brand-text)]'
                            : 'text-[var(--color-text-secondary)]'
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
                        <span className="truncate text-[10px] text-[var(--color-text-muted)]">
                          {s.grade ? `${s.grade} ` : ''}
                          {s.class_name || ''}
                        </span>
                      </button>
                    </li>
                  ))
                ) : (
                  <li className="px-3 py-3 text-center text-xs text-[var(--color-text-muted)]">
                    未找到匹配的学生
                  </li>
                )}
              </ul>

              <div className="border-t border-[var(--color-border-default)] p-1.5">
                <button
                  type="button"
                  onClick={handleAddStudent}
                  disabled={atStudentLimit}
                  className={`flex w-full items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all ${
                    atStudentLimit
                      ? 'cursor-not-allowed text-[var(--color-text-disabled)]'
                      : 'bg-[var(--color-brand-subtle)] text-[var(--color-brand-text)] border border-[var(--color-brand-300)] hover:bg-[var(--color-brand-100)]'
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
        <div className="p-2 border-b border-[var(--color-border-default)] flex justify-center">
          <div
            title={currentStudent ? `当前学生: ${currentStudent.name}` : '未选择学生'}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold ${
              currentStudent ? getAvatarStyle(currentStudent.name) : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]'
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
              <p className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
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
                        ? 'bg-[var(--color-brand-600)] text-white font-semibold shadow-sm shadow-indigo-600/25'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)] active:scale-[0.99]'
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
      <div className="border-t border-[var(--color-border-default)] p-2.5 space-y-1">
        <NavLink
          to="/settings"
          onClick={onCloseDrawer ?? undefined}
          title={isCollapsed ? '系统设置' : undefined}
          className={({ isActive }) =>
            `flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-all ${
              isCollapsed ? 'justify-center' : ''
            } ${
              isActive
                ? 'bg-[var(--color-brand-600)] text-white font-semibold shadow-sm'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]'
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
          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-[var(--color-danger-text)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)] transition-all ${
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
