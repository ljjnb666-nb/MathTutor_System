import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [loginCode, setLoginCode] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const code = loginCode?.trim()
    if (!code) {
      toast.error('请输入登录码')
      return
    }
    setSubmitting(true)
    try {
      await login(code, password?.trim() || null)
      toast.success('登录成功')
      navigate('/', { replace: true })
    } catch (err) {
      const msg = err.response?.data?.detail ?? err.message ?? '登录失败'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-100/90 px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] antialiased">
      <div className="w-full max-w-sm rounded-card border border-gray-200 bg-white p-6 sm:p-8 shadow-card-active">
        <h1 className="text-center text-xl font-semibold tracking-tight text-gray-800">学生端登录</h1>
        <p className="mt-1.5 text-center text-sm text-gray-500">请使用老师提供的登录码</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">登录码</label>
            <input
              type="text"
              value={loginCode}
              onChange={(e) => setLoginCode(e.target.value)}
              placeholder="请输入登录码"
              className="w-full rounded-btn border border-gray-200 px-3 py-2.5 text-gray-800 transition-colors placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              autoComplete="username"
              autoFocus
              aria-label="登录码"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">密码（若老师已设置）</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="选填"
              className="w-full rounded-btn border border-gray-200 px-3 py-2.5 text-gray-800 transition-colors placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              autoComplete="current-password"
              aria-label="密码（若老师已设置则必填）"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-btn bg-primary-600 py-2.5 text-sm font-medium text-white shadow-card transition-all hover:bg-primary-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            aria-label={submitting ? '登录中' : '登录'}
          >
            {submitting ? '登录中…' : '登录'}
          </button>
        </form>
      </div>
    </div>
  )
}
