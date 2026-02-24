import { Outlet, NavLink, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LayoutDashboard, BookMarked, GitBranch, FileQuestion, LogOut, User } from 'lucide-react'

export default function Layout() {
  const { student, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const nav = [
    { to: '/', icon: LayoutDashboard, label: '首页' },
    { to: '/mistakes', icon: BookMarked, label: '错题本' },
    { to: '/knowledge-graph', icon: GitBranch, label: '学情图谱' },
    { to: '/exams', icon: FileQuestion, label: '我的题目' },
  ]

  return (
    <div className="flex min-h-screen flex-col bg-gray-50/80 antialiased">
      <header className="sticky top-0 z-10 border-b border-gray-200/80 bg-white/95 shadow-card backdrop-blur-sm pt-[env(safe-area-inset-top)] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
        <div className="flex flex-wrap items-center justify-between gap-2 py-3 sm:gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto sm:flex-none sm:gap-4">
            <span className="shrink-0 text-base font-semibold tracking-tight text-gray-800">学生端</span>
            <nav className="flex gap-0.5 sm:gap-1" aria-label="主导航">
              {nav.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `inline-flex shrink-0 items-center gap-1.5 rounded-btn px-2.5 py-2 text-sm font-medium transition-all duration-200 sm:px-3 ${
                      isActive
                        ? 'bg-primary-100 text-primary-700 shadow-sm'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                    }`
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              to="/profile"
              className="inline-flex items-center rounded-btn px-2.5 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800 sm:px-3"
              title="个人中心"
              aria-label={`个人中心，当前用户：${student?.name ?? '学生'}`}
            >
              <User className="h-4 w-4 sm:hidden" aria-hidden />
              <span className="hidden sm:inline">{student?.name ?? '—'}</span>
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-btn border border-gray-200 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-700 shadow-card transition-all hover:border-gray-300 hover:bg-gray-50 hover:shadow-card-hover sm:px-3"
              aria-label="退出登录"
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden />
              <span className="hidden sm:inline">退出</span>
            </button>
          </div>
        </div>
      </header>
      <main className="min-h-0 flex-1 p-4 sm:p-6 pb-[max(1.5rem,calc(1rem+env(safe-area-inset-bottom)))]">
        <Outlet />
      </main>
    </div>
  )
}
