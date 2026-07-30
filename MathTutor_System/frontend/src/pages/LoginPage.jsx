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
    <div className="min-h-screen flex items-center justify-center bg-[#0B0F17] bg-mesh-canvas px-4 py-8 relative overflow-hidden">
      {/* Background ambient spotlight glows */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-purple-600/20 blur-3xl" />

      <div className="w-full max-w-md relative z-10 animate-fade-in-up">
        <div className="pro-obsidian-panel rounded-3xl p-8 border border-slate-800 shadow-2xl backdrop-blur-2xl">
          {/* Logo Header */}
          <div className="flex flex-col items-center justify-center text-center mb-8">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 p-0.5 shadow-lg shadow-indigo-500/25 mb-3">
              <div className="h-full w-full bg-[#0B0F17] rounded-[14px] flex items-center justify-center text-white font-black text-xl">
                ∑
              </div>
            </div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white tracking-tight">MathTutor</h1>
              <span className="rounded-full bg-indigo-500/20 border border-indigo-500/30 px-2.5 py-0.5 text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                PRO STUDIO
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400 font-bold">智能 AI 数学教学与全场景备课工作台</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="username" className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                账号 / 用户名
              </label>
              <input
                ref={usernameInputRef}
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-slate-900/90 border border-slate-700/80 text-sm font-bold text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                placeholder="请输入您的账号"
                disabled={loading}
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                安全密码
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 rounded-2xl bg-slate-900/90 border border-slate-700/80 text-sm font-bold text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                  placeholder="请输入密码"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-white transition-colors"
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-bold text-rose-400" role="alert">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-gradient-pro w-full py-3.5 px-5 rounded-2xl text-xs font-black tracking-wider uppercase shadow-lg shadow-indigo-500/25 transition-transform active:scale-[0.98]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  正在验证身份…
                </span>
              ) : (
                '登录进入控制台'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
