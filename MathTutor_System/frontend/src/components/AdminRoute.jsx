import { Navigate, Outlet } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

/**
 * 管理员路由守卫：仅 role === 'admin' 可访问，否则重定向到首页或 403。
 * 依赖已登录（应在 ProtectedRoute 内使用）。
 */
export default function AdminRoute() {
  const { user, restoring } = useAuth()

  if (restoring) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" aria-hidden />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (user.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
