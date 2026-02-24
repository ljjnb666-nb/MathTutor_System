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
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-800">用户管理</h1>
        <button
          type="button"
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 active:bg-blue-800 transition"
        >
          <UserPlus className="h-4 w-4" />
          添加用户
        </button>
      </div>

      {error && (
        <p className="mb-4 text-sm text-red-500" role="alert">
          {error}
        </p>
      )}

      {selectedIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <span className="text-sm font-medium text-blue-800">已选 {selectedIds.size} 人</span>
          <button
            type="button"
            onClick={() => handleBatchRenew(30)}
            disabled={batchLoading}
            className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60"
          >
            <Calendar className="h-4 w-4" />
            批量续期 30 天
          </button>
          <button
            type="button"
            onClick={() => handleBatchRenew(90)}
            disabled={batchLoading}
            className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60"
          >
            续期 90 天
          </button>
          <span className="text-gray-400">|</span>
          <span className="text-sm text-gray-600">设为套餐：</span>
          {PLAN_OPTIONS.map((p) => (
            <button
              key={p.code}
              type="button"
              onClick={() => handleBatchSetPlan(p.code, p.code === 'free' ? undefined : 30)}
              disabled={batchLoading}
              className="rounded-lg bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60"
            >
              {p.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-sm text-blue-600 hover:text-blue-700"
          >
            取消选择
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">加载中...</div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-gray-500">暂无用户</div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="w-10 px-2 py-3">
                  {teachers.length > 0 && (
                    <input
                      type="checkbox"
                      checked={selectedIds.size === teachers.length && teachers.length > 0}
                      onChange={toggleSelectAllTeachers}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      aria-label="全选教师"
                    />
                  )}
                </th>
                <th className="px-4 py-3 text-sm font-medium text-gray-700">ID</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-700">用户名</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-700">角色</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-700">套餐</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-700">到期日</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-700">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-700 w-28">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50/50">
                  <td className="w-10 px-2 py-3">
                    {u.role === 'teacher' && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(u.id)}
                        onChange={() => toggleSelect(u.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        aria-label={`选择 ${u.username}`}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-800">{u.id}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">{u.username}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{u.role === 'admin' ? '管理员' : '教师'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {u.role === 'admin' ? (
                      '—'
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={u.plan_code || 'free'}
                          onChange={(e) => handlePlanChange(u.id, e.target.value, 30)}
                          disabled={updatingPlanId === u.id}
                          className="rounded border border-gray-200 bg-white px-2 py-1 text-sm text-gray-800 disabled:opacity-60"
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
                            className="rounded border border-gray-200 bg-white px-2 py-1 text-sm text-gray-600 disabled:opacity-60"
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
                          <span className="text-xs text-gray-500">保存中...</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
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
                      className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800"
                      aria-label={`${u.username} 订阅历史`}
                    >
                      <History className="h-4 w-4" />
                      历史
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(u.id)}
                      disabled={u.id === currentUser?.id || deletingId === u.id}
                      className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={handleCloseModal}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-800 mb-4">添加用户</h2>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label htmlFor="add-username" className="block text-sm font-medium text-gray-700 mb-1">
                  用户名
                </label>
                <input
                  id="add-username"
                  type="text"
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="请输入用户名"
                  disabled={submitLoading}
                />
              </div>
              <div>
                <label htmlFor="add-password" className="block text-sm font-medium text-gray-700 mb-1">
                  密码
                </label>
                <div className="relative">
                  <input
                    id="add-password"
                    type={showPassword ? 'text' : 'password'}
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="至少 6 位"
                    disabled={submitLoading}
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
              <div>
                <span className="block text-sm font-medium text-gray-700 mb-2">角色</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFormRole('teacher')}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition ${
                      formRole === 'teacher'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    教师
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormRole('admin')}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition ${
                      formRole === 'admin'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    管理员
                  </button>
                </div>
              </div>
              {formError && (
                <p className="text-sm text-red-500" role="alert">
                  {formError}
                </p>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={submitLoading}
                  className="flex-1 py-2 px-4 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitLoading}
                  className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => setHistoryModalUserId(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-800">
                {users.find((u) => u.id === historyModalUserId)?.username ?? ''} 订阅历史
              </h2>
              <button
                type="button"
                onClick={() => setHistoryModalUserId(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-auto px-6 py-4">
              {historyLoading ? (
                <p className="text-gray-500">加载中...</p>
              ) : historyList.length === 0 ? (
                <p className="text-gray-500">暂无记录</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-600">
                      <th className="py-2 pr-4">套餐</th>
                      <th className="py-2 pr-4">周期开始</th>
                      <th className="py-2 pr-4">周期结束</th>
                      <th className="py-2">变更时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {historyList.map((h) => (
                      <tr key={h.id}>
                        <td className="py-2 pr-4 font-medium">{h.plan_name}</td>
                        <td className="py-2 pr-4 text-gray-600">{formatHistoryDate(h.period_start)}</td>
                        <td className="py-2 pr-4 text-gray-600">{formatHistoryDate(h.period_end)}</td>
                        <td className="py-2 text-gray-500">{formatHistoryDate(h.created_at)}</td>
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
