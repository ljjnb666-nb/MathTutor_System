import { useState, useMemo, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu, GraduationCap } from 'lucide-react'
import Sidebar from './Sidebar'
import TopHeader from './TopHeader'
import ErrorBoundary from './ErrorBoundary'
import { Drawer } from './ui/Modal'
import { getLayoutMode } from '../config/route-meta'

export default function Layout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true'
  })
  const location = useLocation()

  const handleToggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('sidebar_collapsed', String(next))
      return next
    })
  }

  // 路由跳转时关闭移动端侧栏
  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [location.pathname])

  // 使用路由元数据确定布局模式
  const layoutMode = useMemo(() => getLayoutMode(location.pathname), [location.pathname])

  // workspace 模式：固定视口高度，内部滚动（智能出题、AI对话、AI教师助手）
  const isWorkspaceMode = layoutMode === 'workspace'

  // fullCanvas 模式：无外边距限制（Magic PPT、学情图谱）
  const isFullCanvasMode = layoutMode === 'fullCanvas'

  return (
    <div
      className={`tp-app-shell flex min-h-screen bg-[var(--color-bg-canvas)] text-[var(--color-text-primary)] transition-colors ${
        isWorkspaceMode ? 'md:h-screen md:max-h-screen md:overflow-hidden' : ''
      }`}
    >
      {/* 键盘无障碍：跳过导航直达主内容区 */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-[var(--color-brand-600)] focus:px-4 focus:py-2 focus:text-white focus:outline-none shadow-xl"
      >
        跳过导航至主内容
      </a>

      {/* 移动端顶栏 (Mobile Top Bar) */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-30 flex h-14 items-center justify-between border-b border-[var(--color-border-default)] bg-[var(--color-bg-primary)]/95 px-4 backdrop-blur-md pt-[env(safe-area-inset-top)] min-h-[calc(3.5rem+env(safe-area-inset-top))]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-brand-600)] text-white shadow-sm shadow-indigo-500/30">
            <GraduationCap className="h-4 w-4" />
          </div>
          <span className="text-sm font-bold tracking-tight text-[var(--color-text-primary)]">
            TutorPro
          </span>
          <span className="rounded bg-[var(--color-brand-subtle)] px-1 py-0.2 text-[9px] font-semibold text-[var(--color-brand-text)] border border-[var(--color-border-subtle)]">
            AI
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(true)}
          className="flex h-8 w-8 items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] rounded-lg transition-colors"
          aria-label="打开导航菜单"
          aria-expanded={isMobileMenuOpen}
          aria-controls="mobile-navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* 桌面端固定侧边栏容器 */}
      <div
        className={`hidden md:flex flex-col fixed inset-y-0 left-0 z-30 transition-all duration-200 ${
          isCollapsed ? 'w-16' : 'w-60'
        }`}
      >
        <Sidebar
          isCollapsed={isCollapsed}
          onToggleCollapse={handleToggleCollapse}
        />
      </div>

      {/* 移动端侧边抽屉容器 (复用 Drawer 规范与焦点管理) */}
      <Drawer
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        position="left"
        size="sm"
        showHeader={false}
        id="mobile-navigation"
        className="md:hidden w-[min(18rem,80vw)] max-w-[80vw] !border-r !border-l-0 !p-0"
      >
        <Sidebar onCloseDrawer={() => setIsMobileMenuOpen(false)} />
      </Drawer>

      {/* 主工作区画布 (Main Canvas) */}
      <main
        id="main-content"
        tabIndex={-1}
        className={`flex flex-1 w-full min-w-0 flex-col pt-[calc(3.5rem+env(safe-area-inset-top))] md:pt-0 transition-all duration-200 ${
          isCollapsed ? 'md:ml-16' : 'md:ml-60'
        } ${isWorkspaceMode ? 'min-h-screen md:min-h-0 md:overflow-hidden' : 'min-h-screen'}`}
      >
        {/* TopHeader - 在 default 模式显示 */}
        {layoutMode === 'default' && <TopHeader />}

        {/* 页面主内容容纳容器 */}
        <div
          className={`flex flex-1 min-h-0 min-w-0 flex-col ${
            isFullCanvasMode
              ? 'p-0'
              : 'p-4 sm:p-6 lg:p-8'
          } ${isWorkspaceMode ? '' : 'pb-[calc(2rem+env(safe-area-inset-bottom))]'}`}
        >
          <div
            className={`flex min-h-0 min-w-0 flex-1 flex-col ${
              isWorkspaceMode ? 'overflow-y-auto md:overflow-hidden' : 'overflow-y-auto'
            } ${isFullCanvasMode ? 'max-w-none' : 'max-w-[1720px] mx-auto w-full'}`}
          >
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
        </div>
      </main>
    </div>
  )
}
