import { Loader2, X } from 'lucide-react'

export default function StudentFormModal({
  editingStudent,
  form,
  modalOpen,
  onClose,
  onSetForm,
  onSubmit,
  saving,
}) {
  if (!modalOpen) return null

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}>
      <div className="w-full max-w-md rounded-xl shadow-xl" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>{editingStudent ? '编辑学生' : '添加学生'}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
              e.currentTarget.style.color = 'var(--color-text-primary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = 'var(--color-text-muted)'
            }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 px-4 py-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>姓名</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => onSetForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="请输入姓名"
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-all"
              style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-primary-500)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border-primary)'
              }}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>年级</label>
              <input
                type="text"
                value={form.grade}
                onChange={(e) => onSetForm((prev) => ({ ...prev, grade: e.target.value }))}
                placeholder="如：八年级"
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-all"
                style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-primary-500)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border-primary)'
                }}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>班级</label>
              <input
                type="text"
                value={form.class_name}
                onChange={(e) => onSetForm((prev) => ({ ...prev, class_name: e.target.value }))}
                placeholder="如：3班"
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-all"
                style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-primary-500)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border-primary)'
                }}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>标签（逗号分隔）</label>
            <input
              type="text"
              value={form.tagsStr}
              onChange={(e) => onSetForm((prev) => ({ ...prev, tagsStr: e.target.value }))}
              placeholder="如：数学课代表，几何弱项"
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-all"
              style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-primary-500)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border-primary)'
              }}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>学生端登录码（选填）</label>
            <input
              type="text"
              value={form.login_code}
              onChange={(e) => onSetForm((prev) => ({ ...prev, login_code: e.target.value }))}
              placeholder="学生用此码登录学生端"
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-all"
              style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-primary-500)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border-primary)'
              }}
            />
            <p className="mt-1 text-xs" style={{ color: '#d97706' }}>每个学生的登录码必须唯一，重复时保存会报错。</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>学生端密码（选填）</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => onSetForm((prev) => ({ ...prev, password: e.target.value }))}
              placeholder={editingStudent ? '不修改请留空' : '不填则仅用登录码登录'}
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-all"
              style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-primary-500)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border-primary)'
              }}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium transition-all"
              style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-panel)', color: 'var(--color-text-primary)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--color-bg-panel)'
              }}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60 transition-all"
              style={{ background: 'linear-gradient(to right, var(--color-primary-600), var(--color-primary-700))' }}
              onMouseEnter={(e) => {
                if (!saving) {
                  e.currentTarget.style.opacity = '0.9'
                }
              }}
              onMouseLeave={(e) => {
                if (!saving) {
                  e.currentTarget.style.opacity = '1'
                }
              }}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingStudent ? '保存' : '添加'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
