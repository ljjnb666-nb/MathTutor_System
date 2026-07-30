import { useStudent } from '../contexts/StudentContext'
import ScheduleFormModal from '../features/schedule/components/ScheduleFormModal'
import ScheduleList from '../features/schedule/components/ScheduleList'
import ScheduleToolbar from '../features/schedule/components/ScheduleToolbar'
import { useSchedulePageState } from '../features/schedule/hooks/useSchedulePageState'

export default function SchedulePage() {
  const { currentStudent } = useStudent()
  const { actions, derived, state } = useSchedulePageState(currentStudent?.id ?? null)

  return (
    <div className="min-h-full flex flex-col bg-gray-50">
      <ScheduleToolbar
        allRangeSub={state.allRangeSub}
        count={derived.filteredSchedules.length}
        customFrom={state.customFrom}
        customTo={state.customTo}
        dateRange={state.dateRange}
        filterStudent={derived.filterStudent}
        filterStudentId={state.filterStudentId}
        historyCustomFrom={state.historyCustomFrom}
        historyCustomTo={state.historyCustomTo}
        historyRangeSub={state.historyRangeSub}
        onOpenAdd={actions.openAdd}
        onSetAllRangeSub={actions.setAllRangeSub}
        onSetCustomFrom={actions.setCustomFrom}
        onSetCustomTo={actions.setCustomTo}
        onSetDateRange={actions.setDateRange}
        onSetFilterStudentId={actions.setFilterStudentId}
        onSetHistoryCustomFrom={actions.setHistoryCustomFrom}
        onSetHistoryCustomTo={actions.setHistoryCustomTo}
        onSetHistoryRangeSub={actions.setHistoryRangeSub}
        onSetScheduleView={actions.setScheduleView}
        onSetStudentDropdownOpen={actions.setStudentDropdownOpen}
        scheduleView={state.scheduleView}
        studentDropdownOpen={state.studentDropdownOpen}
        students={state.students}
      />

      <div className="flex-1 px-4 py-6">
        <ScheduleList
          conflictMap={derived.conflictMap}
          dateRange={state.dateRange}
          filteredSchedules={derived.filteredSchedules}
          filterStudentId={state.filterStudentId}
          loading={state.loading}
          onDelete={actions.handleDelete}
          onEdit={actions.openEdit}
          onOpenCopy={actions.openCopy}
          onToggleSort={() => actions.setSortOrder((value) => (value === 'timeAsc' ? 'timeDesc' : 'timeAsc'))}
          scheduleView={state.scheduleView}
          schedules={state.schedules}
          sortOrder={state.sortOrder}
          sortedSchedules={derived.sortedSchedules}
          students={state.students}
        />
      </div>

      <ScheduleFormModal
        editingSchedule={state.editingSchedule}
        form={state.form}
        formStudentDropdownOpen={state.formStudentDropdownOpen}
        modalOpen={state.modalOpen}
        onClose={actions.closeModal}
        onSetForm={actions.setForm}
        onSetFormStudentDropdownOpen={actions.setFormStudentDropdownOpen}
        onSubmit={actions.handleSubmit}
        saving={state.saving}
        selectedStudent={derived.selectedStudent}
        students={state.students}
      />
    </div>
  )
}
