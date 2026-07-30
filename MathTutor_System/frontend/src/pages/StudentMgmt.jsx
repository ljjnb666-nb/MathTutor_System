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
    <div className="min-h-full flex flex-col bg-gray-50/50">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-800">学生管理与学情总览</h1>
          <span className="text-sm text-gray-500">
            共 {state.students.length} 人
            {state.searchTerm.trim() && ` / 筛选后 ${derived.filtered.length} 人`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="搜索姓名或班级"
              value={state.searchTerm}
              onChange={(e) => actions.setSearchTerm(e.target.value)}
              className="h-9 w-72 rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 sm:w-80"
            />
          </div>
          <button
            type="button"
            onClick={actions.openAdd}
            disabled={state.atStudentLimit}
            title={state.atStudentLimit ? '当前套餐学生数已满，请升级' : undefined}
            className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-white shadow-sm ${
              state.atStudentLimit ? 'cursor-not-allowed bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
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
