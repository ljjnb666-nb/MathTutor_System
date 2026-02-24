import { useContext } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { AuthContext } from '../contexts/AuthContext'

/**
 * 保护路由：未登录重定向到 /login，已登录渲染子路由 (Outlet)。
 * 恢复登录状态时显示加载中。
 * 使用 useContext 而非 useAuth()，避免 HMR 时 AuthProvider 未挂载导致 "useAuth must be used within AuthProvider" 崩溃。
 */
export default function ProtectedRoute() {
  const ctx = useContext(AuthContext)
  const isAuthenticated = ctx?.isAuthenticated ?? false
  const restoring = ctx?.restoring ?? false

  if (restoring) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50">
        <span className="loading-spinner h-10 w-10 text-blue-600" aria-hidden />
        <p className="text-sm text-gray-500">正在恢复登录状态…</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
