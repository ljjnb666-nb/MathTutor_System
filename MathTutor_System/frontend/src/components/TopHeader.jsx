import { useState, useMemo, useEffect } from 'react'
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
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-slate-800/80 bg-[#0B0F18]/90 backdrop-blur-md px-4 sm:px-6 lg:px-8 select-none transition-colors dark:bg-[#0B0F18]/90 dark:border-slate-800/80 light:bg-white/95 light:border-slate-200">
      {/* 1. 左侧：页面标题 */}
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-base font-bold text-slate-100 tracking-tight truncate dark:text-slate-100 light:text-slate-900">
          {pageTitle}
        </h1>
      </div>

      {/* 2. 中间：全局搜索栏 (桌面端) */}
      <div className="hidden md:flex flex-1 max-w-sm">
        <div className="relative w-full">
          <form onSubmit={handleSearchSubmit}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
                placeholder="快速检索功能与页面…"
                className="w-full rounded-lg border border-slate-800 bg-slate-900/60 py-1.5 pl-9 pr-3 text-xs text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 transition-all dark:bg-slate-900/60 dark:border-slate-800 dark:text-slate-200 light:bg-slate-50 light:border-slate-200 light:text-slate-800"
              />
            </div>
          </form>

          {/* 搜索结果下拉面板 */}
          {searchOpen && searchTerm.trim() && (
            <div className="absolute top-full left-0 right-0 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-xl z-50 dark:bg-slate-900 dark:border-slate-700 light:bg-white light:border-slate-200">
              {filteredFeatures.length > 0 ? (
                <ul className="py-1">
                  {filteredFeatures.map((feature) => (
                    <li key={feature.path}>
                      <button
                        type="button"
                        onClick={() => handleSelectFeature(feature.path)}
                        className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-300 hover:bg-indigo-600/20 hover:text-indigo-300 transition-colors flex items-center justify-between dark:text-slate-300 light:text-slate-700 light:hover:bg-indigo-50 light:hover:text-indigo-600"
                      >
                        <span>{feature.label}</span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {feature.path}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-4 py-6 text-center text-xs text-slate-500">
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
        <span className="hidden xl:inline-block text-xs font-medium text-slate-400">
          {currentDate}
        </span>

        {/* 主题明暗模式切换按钮 */}
        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors dark:bg-slate-900/60 dark:border-slate-800 light:bg-slate-50 light:border-slate-200 light:text-slate-600 light:hover:bg-slate-100"
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
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors dark:bg-slate-900/60 dark:border-slate-800 light:bg-slate-50 light:border-slate-200 light:text-slate-600 light:hover:bg-slate-100"
            aria-label="消息通知"
          >
            <Bell className="h-4 w-4" />
          </button>

          {notificationOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-xl z-50 dark:bg-slate-900 dark:border-slate-700 light:bg-white light:border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2 dark:border-slate-800 light:border-slate-200">
                <span className="text-xs font-bold text-slate-200 dark:text-slate-200 light:text-slate-800">
                  系统通知
                </span>
                <span className="text-[10px] text-slate-500">已是最新</span>
              </div>
              <div className="py-4 text-center text-xs text-slate-500">
                暂无新消息通知
              </div>
            </div>
          )}
        </div>

        {/* 用户信息简卡 */}
        <div className="flex items-center gap-2 pl-1 border-l border-slate-800/80 dark:border-slate-800/80 light:border-slate-200">
          <Avatar name={user?.username || '教师'} size="sm" />
          <div className="hidden sm:block text-left">
            <p className="text-xs font-bold text-slate-200 leading-tight dark:text-slate-200 light:text-slate-900">
              {user?.username || '教师'}
            </p>
            <p className="text-[10px] text-slate-400 font-medium">
              {user?.role === 'admin' ? '系统管理员' : '授课教师'}
            </p>
          </div>
        </div>
      </div>
    </header>
  )
}
