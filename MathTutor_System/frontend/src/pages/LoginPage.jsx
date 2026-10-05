import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, GraduationCap, Lock, User, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import { SESSION_EXPIRED_KEY } from '../services/api'
import { normalizeApiError } from '../utils/normalizeApiError'

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

  // 401 会话过期跳转时友好提示
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
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[var(--color-bg-canvas)] text-[var(--color-text-muted)]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-brand-500)]" aria-hidden="true" />
        <p className="text-xs font-medium">正在恢复登录状态…</p>
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
      const msg = normalizeApiError(err, '登录失败，请检查用户名或密码')
      setError(typeof msg === 'string' ? msg : '用户名或密码错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-canvas)] px-4 py-8 select-none transition-colors">
      <div className="w-full max-w-sm">
        {/* 卡片容器 */}
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-7 shadow-xl">
          {/* TutorPro 品牌头部 */}
          <div className="flex flex-col items-center text-center mb-7">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-brand-600)] text-white shadow-sm shadow-indigo-500/25 mb-3">
              <GraduationCap className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)]">
                TutorPro
              </h1>
              <span className="rounded bg-[var(--color-brand-subtle)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-brand-text)] border border-[var(--color-border-subtle)]">
                AI Workspace
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--color-text-muted)] font-medium">
              全学科 AI 教学工作台
            </p>
          </div>

          {/* 登录表单 */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="username"
                className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5"
              >
                用户名
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[var(--color-text-muted)]">
                  <User className="h-4 w-4" aria-hidden="true" />
                </div>
                <input
                  ref={usernameInputRef}
                  id="username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                  placeholder="请输入您的账号"
                  className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-input)] pl-9 pr-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] transition-colors focus:border-[var(--color-brand-500)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]/20 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5"
              >
                密码
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[var(--color-text-muted)]">
                  <Lock className="h-4 w-4" aria-hidden="true" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  placeholder="请输入登录密码"
                  className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-input)] pl-9 pr-10 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] transition-colors focus:border-[var(--color-brand-500)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]/20 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] p-2.5 text-xs font-medium text-[var(--color-danger-text)]"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-[var(--color-brand-600)] py-2.5 px-4 text-sm font-semibold text-white shadow-sm hover:bg-[var(--color-brand-500)] active:bg-[var(--color-brand-700)] disabled:opacity-60 disabled:cursor-not-allowed transition-all mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>正在登录…</span>
                </>
              ) : (
                <span>登录</span>
              )}
            </button>
          </form>

          {/* 底部版权与定位 */}
          <div className="mt-6 pt-4 border-t border-[var(--color-border-default)] text-center">
            <p className="text-[11px] text-[var(--color-text-muted)]">
              TutorPro · 面向教师与学生的全学科智能教学平台
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
