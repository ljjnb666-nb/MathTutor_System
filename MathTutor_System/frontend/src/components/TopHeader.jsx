import { useState, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Search, Bell, Sun, Moon } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { getPageTitle } from '../config/route-meta'
import { getSearchableFeatures } from '../config/navigation'
import { applyTheme } from '../utils/theme'
import { Avatar } from './ui/PageHeader'

export default function TopHeader() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [currentTheme, setCurrentTheme] = useState(() => {
    return document.documentElement.dataset.theme || localStorage.getItem('ui_theme') || 'dark'
  })

  const pageTitle = useMemo(() => getPageTitle(location.pathname), [location.pathname])

  const currentDate = useMemo(() => {
    const now = new Date()
    return now.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    })
  }, [])

  const searchableFeatures = useMemo(
    () => getSearchableFeatures(user?.role),
    [user?.role]
  )

  const filteredFeatures = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return []
    return searchableFeatures
      .filter((feature) => {
        return (
          feature.label.toLowerCase().includes(q) ||
          feature.keywords.some((keyword) => keyword.toLowerCase().includes(q))
        )
      })
      .slice(0, 8)
  }, [searchTerm, searchableFeatures])

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    if (filteredFeatures.length > 0) {
      navigate(filteredFeatures[0].path)
      setSearchOpen(false)
      setSearchTerm('')
    }
  }

  const handleSelectFeature = (path) => {
    navigate(path)
    setSearchOpen(false)
    setSearchTerm('')
  }

  const toggleTheme = () => {
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark'
    applyTheme(nextTheme)
    localStorage.setItem('ui_theme', nextTheme)
    setCurrentTheme(nextTheme)
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-[var(--color-border-default)] bg-[var(--color-bg-primary)]/90 backdrop-blur-md px-4 sm:px-6 lg:px-8 select-none transition-colors">
      {/* 1. 左侧：页面标题 */}
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-base font-bold text-[var(--color-text-primary)] tracking-tight truncate">
          {pageTitle}
        </h1>
      </div>

      {/* 2. 中间：全局搜索栏 (桌面端) */}
      <div className="hidden md:flex flex-1 max-w-sm">
        <div className="relative w-full">
          <form onSubmit={handleSearchSubmit}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
                placeholder="快速检索功能与页面…"
                className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-input)] py-1.5 pl-9 pr-3 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-brand-500)] focus:bg-[var(--color-bg-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)] transition-all"
              />
            </div>
          </form>

          {/* 搜索结果下拉面板 */}
          {searchOpen && searchTerm.trim() && (
            <div className="absolute top-full left-0 right-0 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-bg-surface-raised)] shadow-xl z-50">
              {filteredFeatures.length > 0 ? (
                <ul className="py-1">
                  {filteredFeatures.map((feature) => (
                    <li key={feature.path}>
                      <button
                        type="button"
                        onClick={() => handleSelectFeature(feature.path)}
                        className="w-full text-left px-3.5 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-brand-subtle)] hover:text-[var(--color-brand-text)] transition-colors flex items-center justify-between"
                      >
                        <span>{feature.label}</span>
                        <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
                          {feature.path}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-4 py-6 text-center text-xs text-[var(--color-text-muted)]">
                  未找到匹配的功能入口
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 3. 右侧：日期、主题切换、通知、个人档案 */}
      <div className="flex items-center gap-3">
        {/* 当前日期 */}
        <span className="hidden xl:inline-block text-xs font-medium text-[var(--color-text-muted)]">
          {currentDate}
        </span>

        {/* 主题明暗模式切换按钮 */}
        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          aria-label={currentTheme === 'dark' ? '切换为浅色主题' : '切换为深色主题'}
          title={currentTheme === 'dark' ? '切换为浅色主题' : '切换为深色主题'}
        >
          {currentTheme === 'dark' ? (
            <Sun className="h-4 w-4 text-amber-400" />
          ) : (
            <Moon className="h-4 w-4 text-indigo-600" />
          )}
        </button>

        {/* 通知中心 */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setNotificationOpen(!notificationOpen)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            aria-label="消息通知"
          >
            <Bell className="h-4 w-4" />
          </button>

          {notificationOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-bg-surface-raised)] p-3 shadow-xl z-50">
              <div className="flex items-center justify-between border-b border-[var(--color-border-default)] pb-2 mb-2">
                <span className="text-xs font-bold text-[var(--color-text-primary)]">
                  系统通知
                </span>
                <span className="text-[10px] text-[var(--color-text-muted)]">已是最新</span>
              </div>
              <div className="py-4 text-center text-xs text-[var(--color-text-muted)]">
                暂无新消息通知
              </div>
            </div>
          )}
        </div>

        {/* 用户信息简卡 */}
        <div className="flex items-center gap-2 pl-1 border-l border-[var(--color-border-default)]">
          <Avatar name={user?.username || '教师'} size="sm" />
          <div className="hidden sm:block text-left">
            <p className="text-xs font-bold text-[var(--color-text-primary)] leading-tight">
              {user?.username || '教师'}
            </p>
            <p className="text-[10px] text-[var(--color-text-muted)] font-medium">
              {user?.role === 'admin' ? '系统管理员' : '授课教师'}
            </p>
          </div>
        </div>
      </div>
    </header>
  )
}
