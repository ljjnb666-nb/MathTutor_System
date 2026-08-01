import { Plus, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { useSubscription } from '../contexts/SubscriptionContext'
import { useStudent } from '../contexts/StudentContext'
import StudentFormModal from '../features/student-mgmt/components/StudentFormModal'
import StudentGrid from '../features/student-mgmt/components/StudentGrid'
import { useStudentMgmtState } from '../features/student-mgmt/hooks/useStudentMgmtState'

export default function StudentMgmt() {
  const navigate = useNavigate()
  const { atStudentLimit, refreshSubscription } = useSubscription()
  const { currentStudent, selectStudent } = useStudent()

  const { actions, derived, state } = useStudentMgmtState({
    atStudentLimit,
    navigate,
    refreshSubscription,
    selectStudent,
  })

  return (
    <div className="mx-auto max-w-6xl space-y-6 md:space-y-8 animate-fade-in-up min-h-full flex flex-col">
      <div className="rounded-3xl p-6 sm:p-8 shadow-sm flex flex-wrap items-center justify-between gap-4" style={{ border: '1px solid color-mix(in srgb, var(--color-border-primary) 90%, transparent)', backgroundColor: 'var(--color-bg-card)' }}>
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl font-black shrink-0" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)', color: 'var(--color-primary-600)' }}>
            👥
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--color-text-primary)' }}>学生管理与学情档案</h1>
              <span className="rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)', color: 'var(--color-primary-600)' }}>
                STUDENTS
              </span>
            </div>
            <p className="mt-1 text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              管理已录入学生档案（共 {state.students.length} 人{state.searchTerm.trim() && ` / 筛选后 ${derived.filtered.length} 人`}）并下载全量学情报告
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
            <input
              type="text"
              placeholder="搜索姓名或班级…"
              value={state.searchTerm}
              onChange={(e) => actions.setSearchTerm(e.target.value)}
              className="h-10 w-64 rounded-2xl pl-10 pr-4 text-xs font-bold placeholder:font-normal focus:outline-none focus:ring-4 sm:w-72"
              style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'color-mix(in srgb, var(--color-bg-panel) 80%, transparent)', color: 'var(--color-text-primary)' }}
            />
          </div>
          <button
            type="button"
            onClick={actions.openAdd}
            disabled={state.atStudentLimit}
            title={state.atStudentLimit ? '当前套餐学生数已满，请升级' : undefined}
            className={`btn-gradient-pro inline-flex h-10 items-center gap-2 rounded-2xl px-5 text-xs font-black shadow-lg ${
              state.atStudentLimit ? 'cursor-not-allowed opacity-60' : ''
            }`}
          >
            <Plus className="h-4 w-4" />
            {state.atStudentLimit ? '已达上限' : '添加学生'}
          </button>
        </div>
      </div>

      <div className="flex-1 px-4 py-6">
        <StudentGrid
          currentStudentId={currentStudent?.id ?? null}
          filtered={derived.filtered}
          loading={state.loading}
          onDelete={actions.handleDelete}
          onDownloadReport={actions.handleDownloadReport}
          onEdit={actions.openEdit}
          onSearchClear={() => actions.setSearchTerm('')}
          onSelectAndGo={actions.handleSelectAndGo}
          overviewMap={state.overviewMap}
          reportDownloadingId={state.reportDownloadingId}
          searchTerm={state.searchTerm}
        />
      </div>

      <StudentFormModal
        editingStudent={state.editingStudent}
        form={state.form}
        modalOpen={state.modalOpen}
        onClose={actions.closeModal}
        onSetForm={actions.setForm}
        onSubmit={actions.handleSubmit}
        saving={state.saving}
      />
    </div>
  )
}
