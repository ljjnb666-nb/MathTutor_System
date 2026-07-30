import { getBankList, getMistakes } from '../services/api'
import StudentSelectorModal from '../components/StudentSelectorModal'
import HomeworkManagePanel from '../features/homework/components/HomeworkManagePanel'
import HomeworkProgressPanel from '../features/homework/components/HomeworkProgressPanel'
import QuestionPickerModal from '../features/homework/components/QuestionPickerModal'
import { useHomeworkProgressState } from '../features/homework/hooks/useHomeworkProgressState'

export default function HomeworkProgress() {
  const { actions, derived, state } = useHomeworkProgressState()

  if (state.loading && state.exams.length === 0 && state.mainTab !== 'manage') {
    return (
      <div className="flex flex-col">
        <header className="mb-6">
          <h1 className="text-xl font-semibold text-gray-800">作业与做题情况</h1>
          <p className="mt-1 text-sm text-gray-500">作业管理，按题目查看学生作答与对错。</p>
        </header>
        <div className="flex min-h-[40vh] items-center justify-center rounded-xl border border-gray-200 bg-white">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">作业与做题情况</h1>
          <p className="mt-1 text-sm text-gray-500">
            {state.mainTab === 'manage'
              ? '按日期管理当日作业，从题库或错题本加入题目后布置给学生'
              : '按题目查看学生作答与对错；学生端提交后这里会同步更新'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <nav className="flex rounded-lg border border-gray-200 bg-gray-100 p-0.5">
            <button
              type="button"
              onClick={() => actions.setMainTab('manage')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                state.mainTab === 'manage' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              作业管理
            </button>
            <button
              type="button"
              onClick={() => actions.setMainTab('progress')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                state.mainTab === 'progress' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              做题情况
            </button>
          </nav>
        </div>
      </header>

      {state.mainTab === 'manage' && (
        <HomeworkManagePanel
          assignmentDate={state.assignmentDate}
          draft={state.draft}
          draftLoading={state.draftLoading}
          onAssignmentDateChange={actions.setAssignmentDate}
          onOpenAddBank={() => actions.setAddBankOpen(true)}
          onOpenAddMistakes={() => actions.setAddMistakesOpen(true)}
          onOpenAssign={() => actions.setAssignModalOpen(true)}
          onRefreshDraft={actions.fetchDraft}
          onRemoveFromDraft={actions.handleRemoveFromDraft}
          removingQuestionIndex={state.removingQuestionIndex}
        />
      )}

      {state.mainTab === 'progress' && (
        <HomeworkProgressPanel
          assignedExams={derived.assignedExams}
          currentPage={state.currentPage}
          deletingExamId={state.deletingExamId}
          expandedGroups={state.expandedGroups}
          filtered={derived.filtered}
          filterStatus={state.filterStatus}
          filterStudent={state.filterStudent}
          groupedByExam={derived.groupedByExam}
          hasFilters={derived.hasFilters}
          loading={state.loading}
          onClearFilters={() => {
            actions.setFilterStudent('')
            actions.setFilterStatus('all')
          }}
          onDeleteExam={actions.handleDeleteExam}
          onFilterStatusChange={actions.setFilterStatus}
          onFilterStudentChange={actions.setFilterStudent}
          onPageChange={actions.setCurrentPage}
          onRefresh={actions.fetchData}
          onSortByChange={actions.setSortBy}
          onToggleGroup={actions.toggleGroup}
          onToggleViewMode={() => actions.setViewMode((mode) => (mode === 'table' ? 'group' : 'table'))}
          paginatedRows={derived.paginatedRows}
          questionRows={derived.questionRows}
          sortBy={state.sortBy}
          stats={derived.stats}
          studentNames={derived.studentNames}
          totalPages={derived.totalPages}
          viewMode={state.viewMode}
        />
      )}

      <QuestionPickerModal
        emptyText="题库暂无题目"
        fetchList={getBankList}
        onClose={() => actions.setAddBankOpen(false)}
        onConfirm={actions.handleAddFromBank}
        open={state.addBankOpen}
        title="从题库加入题目"
      />

      <QuestionPickerModal
        emptyText="错题本暂无记录"
        fetchList={getMistakes}
        onClose={() => actions.setAddMistakesOpen(false)}
        onConfirm={actions.handleAddFromMistakes}
        open={state.addMistakesOpen}
        title="从错题本加入题目"
      />

      <StudentSelectorModal
        open={state.assignModalOpen}
        onClose={() => actions.setAssignModalOpen(false)}
        onConfirm={actions.handleAssignToStudents}
        defaultTitle={state.draft?.title || `${state.assignmentDate} 作业`}
        allowEditTitle
      />
    </div>
  )
}
