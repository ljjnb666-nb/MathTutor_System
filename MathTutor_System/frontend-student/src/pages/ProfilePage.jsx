import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { User, LogOut, Loader2, Lock, FileText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { updateStudentPassword, getStudentReportPdf } from '../services/api'

export default function ProfilePage() {
  const { student, logout } = useAuth()
  const navigate = useNavigate()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)
  const [reportDownloading, setReportDownloading] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (!newPassword || newPassword.length < 1) {
      toast.error('请输入新密码')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('两次输入的新密码不一致')
      return
    }
    setPasswordSubmitting(true)
    try {
      await updateStudentPassword(oldPassword, newPassword)
      toast.success('密码已修改')
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      const msg = err.response?.data?.detail ?? err.message ?? '修改失败'
      toast.error(msg)
    } finally {
      setPasswordSubmitting(false)
    }
  }

  const handleDownloadReport = async () => {
    setReportDownloading(true)
    try {
      const blob = await getStudentReportPdf()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = '学情报告.pdf'
      a.click()
      URL.revokeObjectURL(url)
      toast.success('报告已开始下载')
    } catch (err) {
      toast.error(err.response?.data?.detail ?? err.message ?? '下载失败')
    } finally {
      setReportDownloading(false)
    }
  }

  if (!student) {
    return (
      <div className="flex flex-col items-center justify-center py-16" role="status" aria-live="polite">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500" aria-hidden />
        <p className="mt-3 text-sm text-gray-500">加载中…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-gray-800 sm:text-2xl">个人中心</h1>
        <p className="mt-0.5 text-sm text-gray-500">账号信息与设置</p>
      </div>

      <div className="student-card-static rounded-card p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600" aria-hidden>
            <User className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-gray-800">{student.name ?? '—'}</p>
            <p className="text-sm text-gray-500">{student.grade ?? '—'} · {student.class_name ?? '—'}</p>
          </div>
        </div>
        <dl className="mt-6 grid gap-3 border-t border-gray-100 pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">姓名</dt>
            <dd className="font-medium text-gray-800">{student.name ?? '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">年级</dt>
            <dd className="font-medium text-gray-800">{student.grade ?? '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">班级</dt>
            <dd className="font-medium text-gray-800">{student.class_name ?? '—'}</dd>
          </div>
        </dl>
      </div>

      <div className="student-card-static rounded-card p-6">
        <h2 className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <FileText className="h-4 w-4" aria-hidden />
          学习报告
        </h2>
        <p className="mt-1 text-sm text-gray-500">下载您的学情分析报告 PDF。</p>
        <button
          type="button"
          onClick={handleDownloadReport}
          disabled={reportDownloading}
          className="mt-3 inline-flex items-center gap-2 rounded-btn border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-card transition-all hover:bg-gray-50 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          aria-label="下载学情报告 PDF"
        >
          {reportDownloading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileText className="h-4 w-4" aria-hidden />}
          {reportDownloading ? '生成中…' : '下载学情报告'}
        </button>
      </div>

      <div className="student-card-static rounded-card p-6">
        <h2 className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Lock className="h-4 w-4" aria-hidden />
          修改密码
        </h2>
        <p className="mt-1 text-sm text-gray-500">若老师已为您设置过密码，可在此修改。</p>
        <form onSubmit={handleChangePassword} className="mt-4 space-y-3">
          <div>
            <label htmlFor="profile-old-pwd" className="mb-0.5 block text-xs font-medium text-gray-600">
              当前密码
            </label>
            <input
              id="profile-old-pwd"
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="w-full rounded-btn border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              autoComplete="current-password"
              aria-label="当前密码"
            />
          </div>
          <div>
            <label htmlFor="profile-new-pwd" className="mb-0.5 block text-xs font-medium text-gray-600">
              新密码
            </label>
            <input
              id="profile-new-pwd"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-btn border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              autoComplete="new-password"
              aria-label="新密码"
            />
          </div>
          <div>
            <label htmlFor="profile-confirm-pwd" className="mb-0.5 block text-xs font-medium text-gray-600">
              确认新密码
            </label>
            <input
              id="profile-confirm-pwd"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-btn border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              autoComplete="new-password"
              aria-label="确认新密码"
            />
          </div>
          <button
            type="submit"
            disabled={passwordSubmitting}
            className="rounded-btn bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-card transition-all hover:bg-primary-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            aria-label="提交修改密码"
          >
            {passwordSubmitting ? '提交中…' : '修改密码'}
          </button>
        </form>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center justify-center gap-2 rounded-btn border border-red-200 bg-white px-4 py-3 text-sm font-medium text-red-600 shadow-card transition-all hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          aria-label="退出登录"
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </button>
      </div>
    </div>
  )
}
