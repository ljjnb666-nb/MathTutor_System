import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
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
      className={`layout-root flex bg-gray-50 min-h-screen ${isFixedHeightPage ? 'h-screen max-h-screen overflow-hidden' : ''}`}
    >
      {/* 无障碍：跳过导航至主内容 */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-white focus:outline-none"
      >
        跳过导航
      </a>
      {/* Mobile Header：安全区 + 毛玻璃 + 阴影 */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-30 flex h-14 items-center justify-between bg-white/95 backdrop-blur-md shadow-mobile-header px-4 pt-[env(safe-area-inset-top)] min-h-[calc(3.5rem+env(safe-area-inset-top))] border-b border-gray-100">
        <span className="text-base sm:text-lg font-bold bg-gradient-to-r from-primary-600 to-blue-500 bg-clip-text text-transparent truncate mr-2">备课助手</span>
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(true)}
          className="flex h-10 w-10 items-center justify-center -mr-1 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-xl touch-manipulation transition-colors"
          aria-label="打开菜单"
        >
          <Menu className="h-6 w-6" />
        </button>
      </header>

      {/* Overlay：移动端抽屉打开时的背景 */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar：移动端为宽抽屉 + 阴影，桌面端左侧固定 */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50 w-[min(20rem,85vw)] md:w-56 transform transition-transform duration-300 ease-out
          md:translate-x-0 md:shadow-none bg-white md:bg-transparent
          ${isMobileMenuOpen ? 'translate-x-0 shadow-drawer' : '-translate-x-full'}
        `}
      >
        <Sidebar onCloseDrawer={() => setIsMobileMenuOpen(false)} />
      </div>

      {/* Main Content：移动端留顶栏高度与安全区，内边距缩小；桌面端侧栏占位 */}
      <main
        id="main-content"
        tabIndex={-1}
        className={`flex flex-1 w-full min-w-0 flex-col pt-[calc(3.5rem+env(safe-area-inset-top))] md:pt-0 md:ml-56 p-4 sm:p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] ${isFixedHeightPage ? 'min-h-0 overflow-hidden' : 'min-h-screen'}`}
      >
        <div
          className={`flex min-h-0 min-w-0 flex-1 flex-col ${isFixedHeightPage ? 'overflow-hidden' : 'overflow-y-auto'}`}
        >
          {isFixedHeightPage ? (
            <ErrorBoundary>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <Outlet />
              </div>
            </ErrorBoundary>
          ) : (
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          )}
        </div>
      </main>
    </div>
  )
}
