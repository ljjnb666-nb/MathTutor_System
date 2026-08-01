import { useCallback, useEffect, useMemo, useState } from 'react'
import { Calendar, Eye, EyeOff, History, RefreshCw, Trash2, UserPlus, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { batchSetSubscription, createUser, deleteUser, getUserSubscriptionHistory, listUsers, setUserSubscription } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { EmptyState, ErrorState, LoadingState, MetricCard, PageHeader, PageShell, ResponsiveTable, SectionCard, StatusBadge } from '../components/UiV2'

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
  if (!periodEnd) return '—'
  const date = typeof periodEnd === 'string' ? new Date(periodEnd) : periodEnd
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function defaultPeriodDays(periodEnd) {
  if (!periodEnd) return 30
  const date = typeof periodEnd === 'string' ? new Date(periodEnd) : periodEnd
  const daysLeft = Math.ceil((date.getTime() - Date.now()) / 86400000)
  if (daysLeft <= 0) return 30
  return PERIOD_DAYS_OPTIONS.map((item) => item.value).reduce((a, b) => (Math.abs(a - daysLeft) <= Math.abs(b - daysLeft) ? a : b))
}

function formatHistoryDate(value) {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  return `${formatPeriodEnd(date)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export default function AdminUserPage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
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
      const message = err?.response?.data?.detail ?? err?.message ?? '获取用户列表失败'
      setError(typeof message === 'string' ? message : '获取失败')
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const teachers = users.filter((user) => user.role !== 'admin')
  const filteredUsers = useMemo(() => users.filter((user) => {
    const matchesQuery = !query.trim() || user.username?.toLowerCase().includes(query.trim().toLowerCase()) || String(user.id).includes(query.trim())
    const matchesRole = roleFilter === 'all' || user.role === roleFilter
    return matchesQuery && matchesRole
  }), [query, roleFilter, users])

  const roleCount = users.reduce((acc, user) => ({ ...acc, [user.role]: (acc[user.role] || 0) + 1 }), {})

  const handleOpenAdd = () => {
    setFormUsername('')
    setFormPassword('')
    setFormRole('teacher')
    setFormError('')
    setShowPassword(false)
    setModalOpen(true)
  }

  const handleAddUser = async (event) => {
    event.preventDefault()
    setFormError('')
    const username = formUsername.trim()
    if (!username) return setFormError('请输入用户名')
    if (formPassword.length < 6) return setFormError('密码至少 6 位')
    setSubmitLoading(true)
    try {
      await createUser({ username, password: formPassword, role: formRole })
      setModalOpen(false)
      fetchUsers()
    } catch (err) {
      const message = err?.response?.data?.detail ?? err?.message ?? '创建失败'
      setFormError(typeof message === 'string' ? message : '创建失败')
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleDelete = async (id) => {
    if (id === currentUser?.id) {
      setError('不能删除当前登录账号')
      return
    }
    if (!window.confirm('确定删除这条用户记录？删除后无法恢复。')) return
    setDeletingId(id)
    setError('')
    try {
      await deleteUser(id)
      fetchUsers()
    } catch (err) {
      const message = err?.response?.data?.detail ?? err?.message ?? '删除失败'
      setError(typeof message === 'string' ? message : '删除失败')
    } finally {
      setDeletingId(null)
    }
  }

  const handlePlanChange = async (userId, planCode, periodDays = 30) => {
    setUpdatingPlanId(userId)
    try {
      const body = { plan_code: planCode }
      if (planCode !== 'free') body.period_days = periodDays
      await setUserSubscription(userId, body)
      toast.success('套餐已更新')
      fetchUsers()
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? err?.message ?? '更新失败')
    } finally {
      setUpdatingPlanId(null)
    }
  }

  const handlePeriodDaysChange = async (userId, planCode, days) => {
    if (planCode === 'free') return
    setUpdatingPlanId(userId)
    try {
      await setUserSubscription(userId, { plan_code: planCode, period_days: days })
      toast.success('有效期已更新')
      fetchUsers()
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? err?.message ?? '更新失败')
    } finally {
      setUpdatingPlanId(null)
    }
  }

  const toggleSelect = (id) => setSelectedIds((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const handleBatchRenew = async (periodDays) => {
    if (selectedIds.size === 0) return
    setBatchLoading(true)
    try {
      const result = await batchSetSubscription({ user_ids: Array.from(selectedIds), period_days: periodDays })
      toast.success(result.failed?.length ? `已续期 ${result.updated} 人，${result.failed.length} 人失败` : `已为 ${result.updated} 人续期 ${periodDays} 天`)
      setSelectedIds(new Set())
      fetchUsers()
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? err?.message ?? '批量续期失败')
    } finally {
      setBatchLoading(false)
    }
  }

  const handleBatchSetPlan = async (planCode, periodDays) => {
    if (selectedIds.size === 0) return
    setBatchLoading(true)
    try {
      const result = await batchSetSubscription({ user_ids: Array.from(selectedIds), plan_code: planCode, period_days: periodDays ?? 30 })
      toast.success(result.failed?.length ? `已更新 ${result.updated} 人，${result.failed.length} 人失败` : `已为 ${result.updated} 人设置套餐`)
      setSelectedIds(new Set())
      fetchUsers()
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? err?.message ?? '批量设置失败')
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

  const columns = [
    { key: 'select', title: '', render: (user) => user.role === 'teacher' ? <input type="checkbox" checked={selectedIds.has(user.id)} onChange={() => toggleSelect(user.id)} aria-label={`选择 ${user.username}`} /> : null },
    { key: 'id', title: 'ID' },
    { key: 'username', title: '用户名' },
    { key: 'role', title: '角色', render: (user) => <StatusBadge tone={user.role === 'admin' ? 'danger' : 'primary'}>{user.role === 'admin' ? '管理员' : '教师'}</StatusBadge> },
    { key: 'plan', title: '套餐', render: (user) => user.role === 'admin' ? '—' : (
      <div className="v2-admin-inline-controls">
        <select value={user.plan_code || 'free'} onChange={(event) => handlePlanChange(user.id, event.target.value, 30)} disabled={updatingPlanId === user.id} aria-label={`${user.username} 套餐`}>
          {PLAN_OPTIONS.map((plan) => <option key={plan.code} value={plan.code}>{plan.name}</option>)}
        </select>
        {(user.plan_code === 'basic' || user.plan_code === 'pro') && (
          <select value={defaultPeriodDays(user.period_end)} onChange={(event) => handlePeriodDaysChange(user.id, user.plan_code || 'basic', Number(event.target.value))} disabled={updatingPlanId === user.id} aria-label={`${user.username} 有效天数`}>
            {PERIOD_DAYS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        )}
      </div>
    ) },
    { key: 'period_end', title: '到期日', render: (user) => user.role === 'admin' ? '—' : formatPeriodEnd(user.period_end) },
    { key: 'is_active', title: '状态', render: (user) => <StatusBadge tone={user.is_active ? 'success' : 'neutral'}>{user.is_active ? '启用' : '禁用'}</StatusBadge> },
    { key: 'actions', title: '操作', render: (user) => (
      <div className="v2-admin-actions">
        <button type="button" className="v2-icon-button" onClick={() => openHistory(user.id)} aria-label={`${user.username} 订阅历史`}><History className="h-4 w-4" /></button>
        <button type="button" className="v2-icon-button danger" onClick={() => handleDelete(user.id)} disabled={user.id === currentUser?.id || deletingId === user.id} aria-label={`删除 ${user.username}`}><Trash2 className="h-4 w-4" /></button>
      </div>
    ) },
  ]

  return (
    <PageShell className="space-y-5">
      <PageHeader
        title="用户管理"
        description="管理真实用户、订阅套餐与历史记录，不提供后端未支持的封禁、重置密码或角色变更。"
        icon={Users}
        meta={<StatusBadge tone="primary">ADMIN CONSOLE</StatusBadge>}
        actions={<button type="button" className="v2-btn-primary" onClick={handleOpenAdd}><UserPlus className="h-4 w-4" />添加用户</button>}
      />

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="用户总数" value={users.length} hint="来自用户 API" icon={Users} />
        <MetricCard label="教师" value={roleCount.teacher || 0} hint="可批量订阅操作" icon={Users} tone="success" />
        <MetricCard label="管理员" value={roleCount.admin || 0} hint="不显示订阅操作" icon={Users} tone="warning" />
        <MetricCard label="已选择" value={selectedIds.size} hint="批量操作对象" icon={CheckIconShim} tone="info" />
      </div>

      <section className="v2-admin-layout">
        <main className="v2-admin-main">
          <SectionCard title="用户列表" description="搜索、筛选与真实管理操作。">
            <div className="v2-admin-toolbar">
              <label><span>搜索</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="用户名或 ID" /></label>
              <label><span>角色</span><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="all">全部</option><option value="teacher">教师</option><option value="admin">管理员</option></select></label>
              <button type="button" className="v2-btn-secondary" onClick={fetchUsers}><RefreshCw className="h-4 w-4" />刷新</button>
            </div>
            {error && <p className="v2-inline-error" role="alert">{error}</p>}
            {loading ? <LoadingState title="正在加载用户" /> : error && users.length === 0 ? <ErrorState title="用户加载失败" description={error} onRetry={fetchUsers} /> : (
              <ResponsiveTable
                columns={columns}
                rows={filteredUsers}
                rowKey={(user) => user.id}
                empty={<EmptyState icon={Users} title={users.length === 0 ? '暂无用户' : '没有匹配用户'} description="不会用假用户填充列表。" />}
                renderMobile={(user) => (
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between gap-3"><strong>{user.username}</strong><StatusBadge tone={user.role === 'admin' ? 'danger' : 'primary'}>{user.role}</StatusBadge></div>
                    <div className="text-xs text-slate-400">ID: {user.id} · 到期：{formatPeriodEnd(user.period_end)}</div>
                    <div className="flex justify-end">{columns.find((column) => column.key === 'actions').render(user)}</div>
                  </div>
                )}
              />
            )}
          </SectionCard>
        </main>

        <aside className="v2-admin-side">
          <SectionCard title="批量操作" description="仅对已选教师生效。">
            {selectedIds.size === 0 ? <EmptyState icon={Calendar} title="未选择教师" description="勾选教师后可批量续期或设置套餐。" /> : (
              <div className="v2-admin-batch">
                <p>已选 {selectedIds.size} 人</p>
                <button type="button" className="v2-btn-secondary" disabled={batchLoading} onClick={() => handleBatchRenew(30)}>续期 30 天</button>
                <button type="button" className="v2-btn-secondary" disabled={batchLoading} onClick={() => handleBatchRenew(90)}>续期 90 天</button>
                {PLAN_OPTIONS.map((plan) => <button key={plan.code} type="button" className="v2-btn-secondary" disabled={batchLoading} onClick={() => handleBatchSetPlan(plan.code, plan.code === 'free' ? undefined : 30)}>设为{plan.name}</button>)}
              </div>
            )}
          </SectionCard>
          <SectionCard title="操作边界" description="当前页面只暴露真实 API。">
            <div className="v2-admin-boundary">
              <p>删除用户会二次确认。</p>
              <p>未实现封禁、重置密码、角色修改等不存在接口。</p>
            </div>
          </SectionCard>
        </aside>
      </section>

      {modalOpen && (
        <div className="v2-modal-backdrop" onClick={() => !submitLoading && setModalOpen(false)}>
          <form className="v2-admin-modal" onSubmit={handleAddUser} onClick={(event) => event.stopPropagation()}>
            <h2>添加用户</h2>
            <label className="v2-field"><span>用户名</span><input value={formUsername} onChange={(event) => setFormUsername(event.target.value)} disabled={submitLoading} placeholder="请输入用户名" /></label>
            <label className="v2-field"><span>密码</span><div className="v2-admin-password"><input type={showPassword ? 'text' : 'password'} value={formPassword} onChange={(event) => setFormPassword(event.target.value)} disabled={submitLoading} placeholder="至少 6 位" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? '隐藏密码' : '显示密码'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></label>
            <label className="v2-field"><span>角色</span><select value={formRole} onChange={(event) => setFormRole(event.target.value)}><option value="teacher">教师</option><option value="admin">管理员</option></select></label>
            {formError && <p className="v2-inline-error" role="alert">{formError}</p>}
            <div className="flex gap-2"><button type="button" className="v2-btn-secondary flex-1" disabled={submitLoading} onClick={() => setModalOpen(false)}>取消</button><button type="submit" className="v2-btn-primary flex-1" disabled={submitLoading}>{submitLoading ? '提交中...' : '确定'}</button></div>
          </form>
        </div>
      )}

      {historyModalUserId != null && (
        <div className="v2-modal-backdrop" onClick={() => setHistoryModalUserId(null)}>
          <div className="v2-admin-modal wide" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3"><h2>{users.find((user) => user.id === historyModalUserId)?.username ?? ''} 订阅历史</h2><button type="button" className="v2-icon-button" onClick={() => setHistoryModalUserId(null)}>×</button></div>
            {historyLoading ? <LoadingState title="正在加载历史" /> : historyList.length === 0 ? <EmptyState icon={History} title="暂无记录" /> : (
              <div className="v2-admin-history">
                {historyList.map((item) => <div key={item.id}><strong>{item.plan_name}</strong><span>{formatHistoryDate(item.period_start)} - {formatHistoryDate(item.period_end)}</span><small>{formatHistoryDate(item.created_at)}</small></div>)}
              </div>
            )}
          </div>
        </div>
      )}
    </PageShell>
  )
}

function CheckIconShim(props) {
  return <Calendar {...props} />
}
