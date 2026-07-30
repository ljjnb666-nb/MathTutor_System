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
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="text-lg font-semibold text-gray-800">{editingStudent ? '编辑学生' : '添加学生'}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 px-4 py-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">姓名</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => onSetForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="请输入姓名"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">年级</label>
              <input
                type="text"
                value={form.grade}
                onChange={(e) => onSetForm((prev) => ({ ...prev, grade: e.target.value }))}
                placeholder="如：八年级"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">班级</label>
              <input
                type="text"
                value={form.class_name}
                onChange={(e) => onSetForm((prev) => ({ ...prev, class_name: e.target.value }))}
                placeholder="如：3班"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">标签（逗号分隔）</label>
            <input
              type="text"
              value={form.tagsStr}
              onChange={(e) => onSetForm((prev) => ({ ...prev, tagsStr: e.target.value }))}
              placeholder="如：数学课代表，几何弱项"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">学生端登录码（选填）</label>
            <input
              type="text"
              value={form.login_code}
              onChange={(e) => onSetForm((prev) => ({ ...prev, login_code: e.target.value }))}
              placeholder="学生用此码登录学生端"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <p className="mt-1 text-xs text-amber-600">每个学生的登录码必须唯一，重复时保存会报错。</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">学生端密码（选填）</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => onSetForm((prev) => ({ ...prev, password: e.target.value }))}
              placeholder={editingStudent ? '不修改请留空' : '不填则仅用登录码登录'}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
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
