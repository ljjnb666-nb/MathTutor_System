import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute() {
  const { student, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="loading-spinner h-10 w-10 border-2 text-blue-500" />
      </div>
    )
  }

  if (!student) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
