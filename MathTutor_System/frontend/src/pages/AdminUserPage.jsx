import { useState, useEffect, useCallback } from 'react'
import { UserPlus, Trash2, Eye, EyeOff, History, Calendar } from 'lucide-react'
import { listUsers, createUser, deleteUser, setUserSubscription, batchSetSubscription, getUserSubscriptionHistory } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

const PLAN_OPTIONS = [
  { code: 'free', name: '免费版' },
  { code: 'basic', name: '基础版' },
  { code: 'pro', name: '专业版' },
]
const PERIOD_DAYS_OPTIONS = [
  { value: 7, label: '7 天' },
  { value: 30, label: '30 天' },
  { value: 90, label: '90 天' },
  { value: 365, label: '1 年' },
]

function formatPeriodEnd(periodEnd) {
  if (!periodEnd) return null
  const d = typeof periodEnd === 'string' ? new Date(periodEnd) : periodEnd
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function defaultPeriodDays(periodEnd) {
  if (!periodEnd) return 30
  const d = typeof periodEnd === 'string' ? new Date(periodEnd) : periodEnd
  const daysLeft = Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  if (daysLeft <= 0) return 30
  const opts = PERIOD_DAYS_OPTIONS.map((o) => o.value)
  const closest = opts.reduce((a, b) => (Math.abs(a - daysLeft) <= Math.abs(b - daysLeft) ? a : b))
  return closest
}

export default function AdminUserPage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [formUsername, setFormUsername] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formRole, setFormRole] = useState('teacher')
  const [showPassword, setShowPassword] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [formError, setFormError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [updatingPlanId, setUpdatingPlanId] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [batchLoading, setBatchLoading] = useState(false)
  const [historyModalUserId, setHistoryModalUserId] = useState(null)
  const [historyList, setHistoryList] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listUsers()
      setUsers(Array.isArray(data) ? data : [])
    } catch (err) {
      const msg = err?.response?.data?.detail ?? err?.message ?? '获取用户列表失败'
      setError(typeof msg === 'string' ? msg : '获取失败')
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleOpenAdd = () => {
    setFormUsername('')
    setFormPassword('')
    setFormRole('teacher')
    setShowPassword(false)
    setFormError('')
    setModalOpen(true)
  }

  const handleCloseModal = () => {
    if (!submitLoading) {
      setShowPassword(false)
      setModalOpen(false)
    }
  }

  const handleAddUser = async (e) => {
    e.preventDefault()
    setFormError('')
    const username = (formUsername || '').trim()
    const password = formPassword || ''
    if (!username) {
      setFormError('请输入用户名')
      return
    }
    if (password.length < 6) {
      setFormError('密码至少 6 位')
      return
    }
    setSubmitLoading(true)
    try {
      await createUser({ username, password, role: formRole })
      setShowPassword(false)
      setModalOpen(false)
      fetchUsers()
    } catch (err) {
      const msg = err?.response?.data?.detail ?? err?.message ?? '创建失败'
      setFormError(typeof msg === 'string' ? msg : '创建失败')
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleDelete = async (id) => {
    if (id === currentUser?.id) {
      setError('不能删除当前登录账号')
      return
    }
    setDeletingId(id)
    setError('')
    try {
      await deleteUser(id)
      fetchUsers()
    } catch (err) {
      const msg = err?.response?.data?.detail ?? err?.message ?? '删除失败'
      setError(typeof msg === 'string' ? msg : '删除失败')
    } finally {
      setDeletingId(null)
    }
  }

  const handlePlanChange = async (userId, planCode, periodDays = 30) => {
    setUpdatingPlanId(userId)
    setError('')
    try {
      const body = { plan_code: planCode }
      if (planCode !== 'free') body.period_days = periodDays
      await setUserSubscription(userId, body)
      toast.success('套餐已更新')
      fetchUsers()
    } catch (err) {
      const msg = err?.response?.data?.detail ?? err?.message ?? '更新失败'
      toast.error(typeof msg === 'string' ? msg : '更新失败')
    } finally {
      setUpdatingPlanId(null)
    }
  }

  const handlePeriodDaysChange = async (userId, planCode, days) => {
    if (planCode === 'free') return
    setUpdatingPlanId(userId)
    setError('')
    try {
      await setUserSubscription(userId, { plan_code: planCode, period_days: days })
      toast.success('有效期已更新')
      fetchUsers()
    } catch (err) {
      const msg = err?.response?.data?.detail ?? err?.message ?? '更新失败'
      toast.error(typeof msg === 'string' ? msg : '更新失败')
    } finally {
      setUpdatingPlanId(null)
    }
  }

  const teachers = users.filter((u) => u.role !== 'admin')
  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleSelectAllTeachers = () => {
    if (selectedIds.size >= teachers.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(teachers.map((u) => u.id)))
  }

  const handleBatchRenew = async (periodDays) => {
    if (selectedIds.size === 0) return
    setBatchLoading(true)
    setError('')
    try {
      const res = await batchSetSubscription({ user_ids: Array.from(selectedIds), period_days: periodDays })
      const msg = res.failed?.length
        ? `已续期 ${res.updated} 人，${res.failed.length} 人失败（如免费版无到期日）`
        : `已为 ${res.updated} 人续期 ${periodDays} 天`
      toast.success(msg)
      setSelectedIds(new Set())
      fetchUsers()
    } catch (err) {
      const msg = err?.response?.data?.detail ?? err?.message ?? '批量续期失败'
      toast.error(typeof msg === 'string' ? msg : '批量续期失败')
    } finally {
      setBatchLoading(false)
    }
  }

  const handleBatchSetPlan = async (planCode, periodDays) => {
    if (selectedIds.size === 0) return
    setBatchLoading(true)
    setError('')
    try {
      const res = await batchSetSubscription({
        user_ids: Array.from(selectedIds),
        plan_code: planCode,
        period_days: periodDays ?? 30,
      })
      const msg = res.failed?.length
        ? `已更新 ${res.updated} 人，${res.failed.length} 人失败`
        : `已为 ${res.updated} 人设为${PLAN_OPTIONS.find((p) => p.code === planCode)?.name ?? planCode}`
      toast.success(msg)
      setSelectedIds(new Set())
      fetchUsers()
    } catch (err) {
      const msg = err?.response?.data?.detail ?? err?.message ?? '批量设置失败'
      toast.error(typeof msg === 'string' ? msg : '批量设置失败')
    } finally {
      setBatchLoading(false)
    }
  }

  const openHistory = (userId) => {
    setHistoryModalUserId(userId)
    setHistoryList([])
    setHistoryLoading(true)
    getUserSubscriptionHistory(userId)
      .then((list) => setHistoryList(Array.isArray(list) ? list : []))
      .catch(() => setHistoryList([]))
      .finally(() => setHistoryLoading(false))
  }

  const formatHistoryDate = (d) => {
    if (!d) return '—'
    const x = typeof d === 'string' ? new Date(d) : d
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')} ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 md:space-y-8 animate-fade-in-up">
      <div className="rounded-3xl p-6 sm:p-8 shadow-sm flex items-center justify-between gap-4" style={{ border: '1px solid color-mix(in srgb, var(--color-border-primary) 90%, transparent)', backgroundColor: 'var(--color-bg-card)' }}>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 text-white shadow-lg shrink-0" style={{ boxShadow: '0 10px 15px -3px color-mix(in srgb, var(--color-primary-500) 25%, transparent)' }}>
            <UserPlus className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--color-text-primary)' }}>系统用户与权限管理</h1>
              <span className="rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)', color: 'var(--color-primary-600)' }}>
                ADMIN CONSOLE
              </span>
            </div>
            <p className="mt-1 text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              新增教师账户、开通/变更订阅套餐、调整有效期与查看变更历史日志
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="btn-gradient-pro inline-flex items-center gap-2 px-5 py-3 text-xs font-black rounded-2xl shadow-lg"
          style={{ boxShadow: '0 10px 15px -3px color-mix(in srgb, var(--color-primary-500) 25%, transparent)' }}
        >
          <UserPlus className="h-4 w-4" />
          添加用户
        </button>
      </div>

      {error && (
        <p className="mb-4 text-sm" style={{ color: '#ef4444' }} role="alert">
          {error}
        </p>
      )}

      {selectedIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg px-4 py-3" style={{ border: '1px solid color-mix(in srgb, var(--color-primary-500) 30%, transparent)', backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 10%, var(--color-bg-card))' }}>
          <span className="text-sm font-medium" style={{ color: 'var(--color-primary-700)' }}>已选 {selectedIds.size} 人</span>
          <button
            type="button"
            onClick={() => handleBatchRenew(30)}
            disabled={batchLoading}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm shadow-sm disabled:opacity-60"
            style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-primary)' }}
            onMouseEnter={(e) => {
              if (!batchLoading) {
                e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
              }
            }}
            onMouseLeave={(e) => {
              if (!batchLoading) {
                e.currentTarget.style.backgroundColor = 'var(--color-bg-card)'
              }
            }}
          >
            <Calendar className="h-4 w-4" />
            批量续期 30 天
          </button>
          <button
            type="button"
            onClick={() => handleBatchRenew(90)}
            disabled={batchLoading}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm shadow-sm disabled:opacity-60"
            style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-primary)' }}
            onMouseEnter={(e) => {
              if (!batchLoading) {
                e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
              }
            }}
            onMouseLeave={(e) => {
              if (!batchLoading) {
                e.currentTarget.style.backgroundColor = 'var(--color-bg-card)'
              }
            }}
          >
            续期 90 天
          </button>
          <span style={{ color: 'var(--color-border-primary)' }}>|</span>
          <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>设为套餐：</span>
          {PLAN_OPTIONS.map((p) => (
            <button
              key={p.code}
              type="button"
              onClick={() => handleBatchSetPlan(p.code, p.code === 'free' ? undefined : 30)}
              disabled={batchLoading}
              className="rounded-lg px-3 py-1.5 text-sm shadow-sm disabled:opacity-60 transition-all"
              style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-primary)' }}
              onMouseEnter={(e) => {
                if (!batchLoading) {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                }
              }}
              onMouseLeave={(e) => {
                if (!batchLoading) {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-card)'
                }
              }}
            >
              {p.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-sm transition-colors"
            style={{ color: 'var(--color-primary-600)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-primary-700)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-primary-600)' }}
          >
            取消选择
          </button>
        </div>
      )}

      <div className="rounded-xl shadow-sm overflow-hidden" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }}>
        {loading ? (
          <div className="p-12 text-center" style={{ color: 'var(--color-text-secondary)' }}>加载中...</div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center" style={{ color: 'var(--color-text-secondary)' }}>暂无用户</div>
        ) : (
          <table className="w-full text-left">
            <thead style={{ backgroundColor: 'var(--color-bg-panel)', borderBottom: '1px solid var(--color-border-primary)' }}>
              <tr>
                <th className="w-10 px-2 py-3">
                  {teachers.length > 0 && (
                    <input
                      type="checkbox"
                      checked={selectedIds.size === teachers.length && teachers.length > 0}
                      onChange={toggleSelectAllTeachers}
                      className="rounded focus:ring-2"
                      style={{ borderColor: 'var(--color-border-primary)', color: 'var(--color-primary-600)' }}
                      aria-label="全选教师"
                    />
                  )}
                </th>
                <th className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>ID</th>
                <th className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>用户名</th>
                <th className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>角色</th>
                <th className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>套餐</th>
                <th className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>到期日</th>
                <th className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>状态</th>
                <th className="px-4 py-3 text-sm font-medium w-28" style={{ color: 'var(--color-text-primary)' }}>操作</th>
              </tr>
            </thead>
            <tbody style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="transition-colors"
                  style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <td className="w-10 px-2 py-3">
                    {u.role === 'teacher' && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(u.id)}
                        onChange={() => toggleSelect(u.id)}
                        className="rounded focus:ring-2"
                        style={{ borderColor: 'var(--color-border-primary)', color: 'var(--color-primary-600)' }}
                        aria-label={`选择 ${u.username}`}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--color-text-primary)' }}>{u.id}</td>
                  <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{u.username}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{u.role === 'admin' ? '管理员' : '教师'}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    {u.role === 'admin' ? (
                      '—'
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={u.plan_code || 'free'}
                          onChange={(e) => handlePlanChange(u.id, e.target.value, 30)}
                          disabled={updatingPlanId === u.id}
                          className="rounded px-2 py-1 text-sm disabled:opacity-60"
                          style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
                          aria-label={`${u.username} 套餐`}
                        >
                          {PLAN_OPTIONS.map((p) => (
                            <option key={p.code} value={p.code}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        {(u.plan_code === 'basic' || u.plan_code === 'pro') && (
                          <select
                            value={defaultPeriodDays(u.period_end)}
                            onChange={(e) => handlePeriodDaysChange(u.id, u.plan_code || 'basic', Number(e.target.value))}
                            disabled={updatingPlanId === u.id}
                            className="rounded px-2 py-1 text-sm disabled:opacity-60"
                            style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-secondary)' }}
                            aria-label={`${u.username} 有效天数`}
                          >
                            {PERIOD_DAYS_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        )}
                        {updatingPlanId === u.id && (
                          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>保存中...</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    {u.role === 'admin' ? '—' : (formatPeriodEnd(u.period_end) ?? '—')}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                        u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {u.is_active ? '启用' : '禁用'}
                    </span>
                  </td>
                  <td className="px-4 py-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openHistory(u.id)}
                      className="inline-flex items-center gap-1 text-sm transition-colors"
                      style={{ color: 'var(--color-text-secondary)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-primary)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)' }}
                      aria-label={`${u.username} 订阅历史`}
                    >
                      <History className="h-4 w-4" />
                      历史
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(u.id)}
                      disabled={u.id === currentUser?.id || deletingId === u.id}
                      className="inline-flex items-center gap-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      style={{ color: '#dc2626' }}
                      onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.color = '#b91c1c' }}
                      onMouseLeave={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.color = '#dc2626' }}
                      aria-label={`删除 ${u.username}`}
                    >
                      <Trash2 className="h-4 w-4" />
                      {deletingId === u.id ? '删除中...' : '删除'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 添加用户弹窗 */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }} onClick={handleCloseModal}>
          <div
            className="rounded-xl shadow-xl w-full max-w-sm p-6"
            style={{ backgroundColor: 'var(--color-bg-card)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>添加用户</h2>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label htmlFor="add-username" className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>
                  用户名
                </label>
                <input
                  id="add-username"
                  type="text"
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg outline-none focus:ring-2 transition-all"
                  style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-primary-500)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border-primary)'
                  }}
                  placeholder="请输入用户名"
                  disabled={submitLoading}
                />
              </div>
              <div>
                <label htmlFor="add-password" className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>
                  密码
                </label>
                <div className="relative">
                  <input
                    id="add-password"
                    type={showPassword ? 'text' : 'password'}
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-10 rounded-lg outline-none focus:ring-2 transition-all"
                    style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-primary-500)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-border-primary)'
                    }}
                    placeholder="至少 6 位"
                    disabled={submitLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 transition-colors"
                    style={{ color: 'var(--color-text-muted)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-muted)' }}
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <span className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>角色</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFormRole('teacher')}
                    className="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition"
                    style={
                      formRole === 'teacher'
                        ? { background: 'linear-gradient(to right, var(--color-primary-600), var(--color-primary-700))', color: 'white' }
                        : { backgroundColor: 'var(--color-bg-panel)', color: 'var(--color-text-primary)' }
                    }
                    onMouseEnter={(e) => {
                      if (formRole !== 'teacher') {
                        e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (formRole !== 'teacher') {
                        e.currentTarget.style.backgroundColor = 'var(--color-bg-panel)'
                      }
                    }}
                  >
                    教师
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormRole('admin')}
                    className="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition"
                    style={
                      formRole === 'admin'
                        ? { background: 'linear-gradient(to right, var(--color-primary-600), var(--color-primary-700))', color: 'white' }
                        : { backgroundColor: 'var(--color-bg-panel)', color: 'var(--color-text-primary)' }
                    }
                    onMouseEnter={(e) => {
                      if (formRole !== 'admin') {
                        e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (formRole !== 'admin') {
                        e.currentTarget.style.backgroundColor = 'var(--color-bg-panel)'
                      }
                    }}
                  >
                    管理员
                  </button>
                </div>
              </div>
              {formError && (
                <p className="text-sm" style={{ color: '#dc2626' }} role="alert">
                  {formError}
                </p>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={submitLoading}
                  className="flex-1 py-2 px-4 rounded-lg disabled:opacity-60 transition-all"
                  style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-panel)', color: 'var(--color-text-primary)' }}
                  onMouseEnter={(e) => {
                    if (!submitLoading) {
                      e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!submitLoading) {
                      e.currentTarget.style.backgroundColor = 'var(--color-bg-panel)'
                    }
                  }}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitLoading}
                  className="flex-1 py-2 px-4 rounded-lg text-white disabled:opacity-60 transition-all"
                  style={{ background: 'linear-gradient(to right, var(--color-primary-600), var(--color-primary-700))' }}
                  onMouseEnter={(e) => {
                    if (!submitLoading) {
                      e.currentTarget.style.opacity = '0.9'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!submitLoading) {
                      e.currentTarget.style.opacity = '1'
                    }
                  }}
                >
                  {submitLoading ? '提交中...' : '确定'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 订阅历史弹窗 */}
      {historyModalUserId != null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}
          onClick={() => setHistoryModalUserId(null)}
        >
          <div
            className="rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
            style={{ backgroundColor: 'var(--color-bg-card)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--color-border-primary)' }}>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                {users.find((u) => u.id === historyModalUserId)?.username ?? ''} 订阅历史
              </h2>
              <button
                type="button"
                onClick={() => setHistoryModalUserId(null)}
                className="transition-colors"
                style={{ color: 'var(--color-text-muted)' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-muted)' }}
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-auto px-6 py-4">
              {historyLoading ? (
                <p style={{ color: 'var(--color-text-secondary)' }}>加载中...</p>
              ) : historyList.length === 0 ? (
                <p style={{ color: 'var(--color-text-secondary)' }}>暂无记录</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border-primary)', color: 'var(--color-text-secondary)' }}>
                      <th className="py-2 pr-4">套餐</th>
                      <th className="py-2 pr-4">周期开始</th>
                      <th className="py-2 pr-4">周期结束</th>
                      <th className="py-2">变更时间</th>
                    </tr>
                  </thead>
                  <tbody style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                    {historyList.map((h) => (
                      <tr key={h.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                        <td className="py-2 pr-4 font-medium" style={{ color: 'var(--color-text-primary)' }}>{h.plan_name}</td>
                        <td className="py-2 pr-4" style={{ color: 'var(--color-text-secondary)' }}>{formatHistoryDate(h.period_start)}</td>
                        <td className="py-2 pr-4" style={{ color: 'var(--color-text-secondary)' }}>{formatHistoryDate(h.period_end)}</td>
                        <td className="py-2" style={{ color: 'var(--color-text-muted)' }}>{formatHistoryDate(h.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
