import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu, Sparkles } from 'lucide-react'
import Sidebar from './Sidebar'
import ErrorBoundary from './ErrorBoundary'

export default function Layout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const location = useLocation()
  const isSmartGenPage = location.pathname === '/smart-gen' || location.pathname.endsWith('/smart-gen')
  const isChatPage = location.pathname === '/chat' || location.pathname.endsWith('/chat')
  const isFixedHeightPage = isSmartGenPage || isChatPage

  return (
    <div
      className={`layout-root flex bg-mesh-canvas min-h-screen text-slate-800 ${isFixedHeightPage ? 'h-screen max-h-screen overflow-hidden' : ''}`}
    >
      {/* 无障碍：跳过导航至主内容 */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-white focus:outline-none shadow-xl"
      >
        跳过导航
      </a>

      {/* Mobile Header: 暗夜黑曜石毛玻璃 Header */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-30 flex h-14 items-center justify-between bg-[#0B0F17]/90 text-white backdrop-blur-xl shadow-lg px-4 pt-[env(safe-area-inset-top)] min-h-[calc(3.5rem+env(safe-area-inset-top))] border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/30">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="text-sm font-black tracking-tight text-white">MathTutor Pro</span>
        </div>
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(true)}
          className="flex h-9 w-9 items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
          aria-label="打开菜单"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Overlay：移动端抽屉打开时的黑曜石模糊深色背景 */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-md transition-opacity animate-fade-in-up"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar 容器 */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50 w-[min(20rem,85vw)] md:w-60 transform transition-transform duration-300 ease-out
          md:translate-x-0 bg-[#0B0F17] md:bg-transparent
          ${isMobileMenuOpen ? 'translate-x-0 shadow-drawer' : '-translate-x-full'}
        `}
      >
        <Sidebar onCloseDrawer={() => setIsMobileMenuOpen(false)} />
      </div>

      {/* Main Content 主画布 */}
      <main
        id="main-content"
        tabIndex={-1}
        className={`flex flex-1 w-full min-w-0 flex-col pt-[calc(3.5rem+env(safe-area-inset-top))] md:pt-0 md:ml-60 p-4 sm:p-6 lg:p-8 pb-[calc(1.5rem+env(safe-area-inset-bottom))] ${isFixedHeightPage ? 'min-h-0 overflow-hidden' : 'min-h-screen'}`}
      >
        <div
          className={`flex min-h-0 min-w-0 flex-1 flex-col ${isFixedHeightPage ? 'overflow-hidden' : 'overflow-y-auto'}`}
        >
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  )
}
