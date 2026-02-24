import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import { SESSION_EXPIRED_KEY } from '../services/api'

export default function LoginPage() {
  const { login, isAuthenticated, restoring } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const usernameInputRef = useRef(null)

  useEffect(() => {
    if (!restoring && isAuthenticated) {
      navigate('/', { replace: true })
    }
  }, [restoring, isAuthenticated, navigate])

  // 401 后跳转至登录页时提示「登录已过期」
  useEffect(() => {
    if (typeof sessionStorage === 'undefined') return
    if (sessionStorage.getItem(SESSION_EXPIRED_KEY)) {
      sessionStorage.removeItem(SESSION_EXPIRED_KEY)
      toast.error('登录已过期，请重新登录', { duration: 5000 })
    }
  }, [])

  useEffect(() => {
    if (!restoring && !isAuthenticated && usernameInputRef.current) {
      usernameInputRef.current.focus()
    }
  }, [restoring, isAuthenticated])

  if (restoring) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50">
        <span className="loading-spinner h-10 w-10 text-blue-600" aria-hidden />
        <p className="text-sm text-gray-500">正在恢复登录状态…</p>
      </div>
    )
  }

  if (isAuthenticated) {
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const u = (username || '').trim()
    const p = password || ''
    if (!u || !p) {
      setError('请输入用户名和密码')
      return
    }
    setLoading(true)
    try {
      await login(u, p)
      navigate('/', { replace: true })
    } catch (err) {
      const msg = err?.response?.data?.detail ?? err?.message ?? '登录失败，请检查用户名或密码'
      setError(typeof msg === 'string' ? msg : '用户名或密码错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100/80 px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-mobile-card md:shadow-lg border border-gray-100 p-6 sm:p-8">
          <h1 className="text-lg sm:text-xl font-semibold text-gray-800 text-center mb-5 sm:mb-6">
            系统登录
          </h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                用户名
              </label>
              <input
                ref={usernameInputRef}
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                placeholder="请输入用户名"
                disabled={loading}
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                密码
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  placeholder="请输入密码"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && (
              <p className="text-sm text-red-500" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="loading-spinner h-4 w-4 border-2" aria-hidden />
                  登录中…
                </>
              ) : (
                '登录系统'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
