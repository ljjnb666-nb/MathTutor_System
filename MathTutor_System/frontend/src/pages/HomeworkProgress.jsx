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
      <div className="mx-auto max-w-6xl space-y-6 animate-fade-in-up">
        <header className="rounded-3xl p-6 sm:p-8 shadow-sm flex items-center justify-between" style={{ border: '1px solid color-mix(in srgb, var(--color-border-primary) 90%, transparent)', backgroundColor: 'var(--color-bg-card)' }}>
          <div>
            <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--color-text-primary)' }}>作业与做题情况跟踪</h1>
            <p className="mt-1 text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>作业管理，按题目查看学生作答与对错状态。</p>
          </div>
        </header>
        <div className="flex min-h-[40vh] items-center justify-center rounded-3xl shadow-sm" style={{ border: '1px solid color-mix(in srgb, var(--color-border-primary) 90%, transparent)', backgroundColor: 'var(--color-bg-card)' }}>
          <div className="h-10 w-10 animate-spin rounded-full border-4" style={{ borderColor: 'color-mix(in srgb, var(--color-primary-500) 20%, transparent)', borderTopColor: 'var(--color-primary-600)' }} />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 md:space-y-8 animate-fade-in-up">
      <header className="rounded-3xl p-6 sm:p-8 shadow-sm flex flex-wrap items-center justify-between gap-4" style={{ border: '1px solid color-mix(in srgb, var(--color-border-primary) 90%, transparent)', backgroundColor: 'var(--color-bg-card)' }}>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--color-text-primary)' }}>作业与做题情况跟踪</h1>
            <span className="rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)', color: 'var(--color-primary-600)' }}>
              STUDENT WORK
            </span>
          </div>
          <p className="mt-1 text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {state.mainTab === 'manage'
              ? '按日期管理当日作业，从题库或错题本加入题目后布置给学生'
              : '按题目查看学生作答与对错；学生端提交后这里会实时同步'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <nav className="flex rounded-2xl p-1" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-panel)' }}>
            <button
              type="button"
              onClick={() => actions.setMainTab('manage')}
              className="rounded-xl px-4 py-2 text-xs font-black transition-all"
              style={
                state.mainTab === 'manage'
                  ? { backgroundColor: 'var(--color-bg-card)', color: 'var(--color-primary-600)', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }
                  : { color: 'var(--color-text-secondary)' }
              }
              onMouseEnter={(e) => {
                if (state.mainTab !== 'manage') {
                  e.currentTarget.style.color = 'var(--color-text-primary)'
                }
              }}
              onMouseLeave={(e) => {
                if (state.mainTab !== 'manage') {
                  e.currentTarget.style.color = 'var(--color-text-secondary)'
                }
              }}
            >
              作业管理
            </button>
            <button
              type="button"
              onClick={() => actions.setMainTab('progress')}
              className="rounded-xl px-4 py-2 text-xs font-black transition-all"
              style={
                state.mainTab === 'progress'
                  ? { backgroundColor: 'var(--color-bg-card)', color: 'var(--color-primary-600)', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }
                  : { color: 'var(--color-text-secondary)' }
              }
              onMouseEnter={(e) => {
                if (state.mainTab !== 'progress') {
                  e.currentTarget.style.color = 'var(--color-text-primary)'
                }
              }}
              onMouseLeave={(e) => {
                if (state.mainTab !== 'progress') {
                  e.currentTarget.style.color = 'var(--color-text-secondary)'
                }
              }}
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
