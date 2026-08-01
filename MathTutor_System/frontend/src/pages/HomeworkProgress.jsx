import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  FileText,
  RefreshCw,
  Search,
  Target,
  Users,
} from 'lucide-react'

import { getBankList, getMistakes } from '../services/api'
import StudentSelectorModal from '../components/StudentSelectorModal'
import HomeworkManagePanel from '../features/homework/components/HomeworkManagePanel'
import QuestionPickerModal from '../features/homework/components/QuestionPickerModal'
import { useHomeworkProgressState } from '../features/homework/hooks/useHomeworkProgressState'
import {
  EmptyState,
  LoadingState,
  MetricCard,
  PageHeader,
  PageShell,
  ResponsiveTable,
  SectionCard,
  StatusBadge,
  Toolbar,
} from '../components/UiV2'

function pct(value, total) {
  if (!total) return 0
  return Math.round((value / total) * 100)
}

function examQuestions(exam) {
  const questions = exam?.questions
  if (Array.isArray(questions)) return questions
  if (questions && Array.isArray(questions.questions)) return questions.questions
  return []
}

function formatTime(value) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function buildStudentSummaries(assignedExams) {
  const map = new Map()
  for (const exam of assignedExams) {
    const name = exam.student_name || `学生 #${exam.student_id}`
    const questions = examQuestions(exam)
    const results = Array.isArray(exam.grade_results) ? exam.grade_results : []
    if (!map.has(name)) {
      map.set(name, {
        name,
        exams: 0,
        total: 0,
        submitted: 0,
        correct: 0,
        wrong: 0,
        pending: 0,
        lastActivity: exam.graded_at || exam.created_at,
        weakPoints: new Set(),
      })
    }
    const item = map.get(name)
    item.exams += 1
    item.total += questions.length
    if (exam.graded_at) item.submitted += questions.length
    item.correct += results.filter((row) => row.is_correct === true).length
    item.wrong += results.filter((row) => row.is_correct === false).length
    item.pending += exam.graded_at ? 0 : questions.length
    item.lastActivity = [item.lastActivity, exam.graded_at, exam.created_at].filter(Boolean).sort().at(-1)
    questions.forEach((question, index) => {
      const result = results.find((row) => row.question_index === index)
      if (result?.is_correct === false && question?.knowledge_point) item.weakPoints.add(question.knowledge_point)
    })
  }
  return Array.from(map.values()).map((item) => ({
    ...item,
    accuracy: pct(item.correct, item.correct + item.wrong),
    completion: pct(item.submitted, item.total),
    weakPoints: Array.from(item.weakPoints),
  })).sort((a, b) => a.accuracy - b.accuracy)
}

function buildTrend(rows) {
  const grouped = rows.reduce((acc, row) => {
    const key = (row.graded_at || row.created_at || '').slice(5, 10) || '未提交'
    if (!acc[key]) acc[key] = { key, total: 0, correct: 0 }
    if (row.submitted) {
      acc[key].total += 1
      if (row.is_correct === true) acc[key].correct += 1
    }
    return acc
  }, {})
  return Object.values(grouped)
    .filter((item) => item.key !== '未提交')
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-7)
    .map((item) => ({ ...item, accuracy: pct(item.correct, item.total) }))
}

function ProgressTrend({ points }) {
  if (!points.length) {
    return <EmptyState icon={BarChart3} title="暂无趋势数据" description="学生提交并批改后，按日期生成真实正确率趋势。" />
  }
  return (
    <div className="v2-progress-chart">
      <div className="v2-progress-chart-grid">
        {[100, 75, 50, 25, 0].map((mark) => <span key={mark}>{mark}%</span>)}
      </div>
      <div className="v2-progress-bars">
        {points.map((point) => (
          <div key={point.key} className="v2-progress-bar-item">
            <div className="v2-progress-bar-track">
              <div className="v2-progress-bar-fill" style={{ height: `${Math.max(point.accuracy, 4)}%` }} />
            </div>
            <span>{point.key}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RiskBadge({ summary }) {
  if (summary.pending > 0) return <StatusBadge tone="warning">待提交</StatusBadge>
  if (summary.accuracy > 0 && summary.accuracy < 60) return <StatusBadge tone="danger">正确率低</StatusBadge>
  if (summary.weakPoints.length >= 2) return <StatusBadge tone="warning">薄弱点多</StatusBadge>
  return <StatusBadge tone="success">稳定</StatusBadge>
}

export default function HomeworkProgress() {
  const { actions, derived, state } = useHomeworkProgressState()

  const summaries = buildStudentSummaries(derived.assignedExams)
  const lowAccuracy = summaries.filter((item) => item.accuracy > 0 && item.accuracy < 60)
  const pendingStudents = summaries.filter((item) => item.pending > 0)
  const trend = buildTrend(derived.questionRows)
  const latestExam = derived.assignedExams
    .slice()
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0]
  const completedStudents = summaries.filter((item) => item.pending === 0 && item.total > 0).length
  const completionRate = pct(derived.stats.submitted, derived.stats.total)
  const accuracyRate = pct(derived.stats.correct, derived.stats.correct + derived.stats.wrong)
  const averageQuestions = summaries.length ? Math.round(derived.stats.total / summaries.length) : 0

  const columns = [
    {
      key: 'student',
      title: '学生',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-[var(--color-text-primary)]">{row.name}</p>
          <p className="text-xs text-[var(--color-text-secondary)]">{row.exams} 份作业 / {row.total} 题</p>
        </div>
      ),
    },
    {
      key: 'completion',
      title: '完成情况',
      render: (row) => (
        <div className="min-w-[8rem] space-y-1">
          <div className="flex justify-between text-xs">
            <span>{row.completion}%</span>
            <span className="text-[var(--color-text-secondary)]">{row.pending} 待提交</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--color-bg-panel-muted)]">
            <div className="h-full rounded-full bg-violet-500" style={{ width: `${row.completion}%` }} />
          </div>
        </div>
      ),
    },
    {
      key: 'accuracy',
      title: '正确率',
      render: (row) => <span className={row.accuracy < 60 && row.accuracy > 0 ? 'font-black text-rose-400' : 'font-black text-emerald-400'}>{row.accuracy || '--'}{row.accuracy ? '%' : ''}</span>,
    },
    {
      key: 'weak',
      title: '薄弱知识点',
      render: (row) => row.weakPoints.length ? row.weakPoints.slice(0, 2).join('、') : '暂无',
    },
    {
      key: 'activity',
      title: '最近活动',
      render: (row) => formatTime(row.lastActivity),
    },
  ]

  if (state.loading && state.exams.length === 0 && state.mainTab !== 'manage') {
    return (
      <PageShell>
        <PageHeader title="学生做题情况" description="正在读取作业与批改记录。" icon={BarChart3} />
        <LoadingState title="正在加载做题情况" description="从现有试卷和作业记录生成统计。" />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader
        title="学生做题情况"
        description="按作业、学生和批改状态查看完成率、正确率与异常学生。"
        icon={BarChart3}
        meta={<StatusBadge tone="neutral">{state.mainTab === 'manage' ? '作业管理' : '做题情况'}</StatusBadge>}
        actions={(
          <button type="button" className="v2-button v2-button-secondary" onClick={actions.fetchData} disabled={state.loading}>
            <RefreshCw className={`h-4 w-4 ${state.loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        )}
      />

      <Toolbar>
        <div className="flex flex-wrap gap-2">
          {[
            ['progress', '做题情况'],
            ['manage', '作业管理'],
          ].map(([key, label]) => (
            <button key={key} type="button" className={state.mainTab === key ? 'v2-btn-primary' : 'v2-btn-secondary'} onClick={() => actions.setMainTab(key)}>
              {label}
            </button>
          ))}
        </div>
        {state.mainTab === 'progress' && (
          <>
            <label className="v2-search md:min-w-[18rem]">
              <Search className="h-4 w-4 shrink-0" />
              <input value={state.filterStudent} onChange={(event) => actions.setFilterStudent(event.target.value)} placeholder="搜索学生姓名..." />
            </label>
            <label className="v2-control">
              <span>状态</span>
              <select value={state.filterStatus} onChange={(event) => actions.setFilterStatus(event.target.value)}>
                <option value="all">全部状态</option>
                <option value="correct">答对</option>
                <option value="wrong">答错</option>
                <option value="pending">未提交</option>
              </select>
            </label>
            <label className="v2-control">
              <span>排序</span>
              <select value={state.sortBy} onChange={(event) => actions.setSortBy(event.target.value)}>
                <option value="time">按布置时间</option>
                <option value="student">按学生</option>
                <option value="status">按状态</option>
              </select>
            </label>
          </>
        )}
      </Toolbar>

      {state.mainTab === 'manage' ? (
        <SectionCard title="作业管理" description="沿用现有当日作业组卷、加入题库/错题、布置给学生能力。">
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
        </SectionCard>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard label="完成作业人数" value={`${completedStudents} / ${summaries.length}`} hint={`完成率 ${completionRate}%`} icon={Users} tone="primary" />
            <MetricCard label="平均正确率" value={accuracyRate ? `${accuracyRate}%` : '--'} hint={`${derived.stats.correct} 对 / ${derived.stats.wrong} 错`} icon={Target} tone={accuracyRate && accuracyRate < 60 ? 'danger' : 'success'} />
            <MetricCard label="平均题量" value={averageQuestions} hint={`${derived.stats.total} 道真实题目`} icon={Clock} tone="info" />
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="space-y-4">
              <SectionCard title="正确率趋势" description="按已批改记录日期聚合，不生成模拟趋势。">
                <ProgressTrend points={trend} />
              </SectionCard>

              <SectionCard
                title="学生做题情况明细"
                description={`${derived.filtered.length} 道题记录，按学生聚合为 ${summaries.length} 人。`}
                actions={derived.hasFilters && (
                  <button
                    type="button"
                    className="v2-btn-secondary"
                    onClick={() => {
                      actions.setFilterStudent('')
                      actions.setFilterStatus('all')
                    }}
                  >
                    清空筛选
                  </button>
                )}
              >
                {derived.assignedExams.length === 0 ? (
                  <EmptyState icon={FileText} title="暂无作业记录" description="在作业管理中布置给学生后，这里会显示真实做题情况。" />
                ) : (
                  <ResponsiveTable
                    columns={columns}
                    rows={summaries}
                    rowKey={(row) => row.name}
                    empty={<EmptyState icon={Search} title="没有符合条件的学生" description="请调整学生或状态筛选。" />}
                    renderMobile={(row) => (
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-black text-[var(--color-text-primary)]">{row.name}</p>
                            <p className="text-xs text-[var(--color-text-secondary)]">{row.exams} 份作业 / {row.total} 题</p>
                          </div>
                          <RiskBadge summary={row} />
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <span>完成 {row.completion}%</span>
                          <span>正确 {row.accuracy || '--'}{row.accuracy ? '%' : ''}</span>
                          <span>待交 {row.pending}</span>
                        </div>
                      </div>
                    )}
                  />
                )}
              </SectionCard>
            </div>

            <aside className="space-y-4">
              <SectionCard title="异常提醒" actions={<StatusBadge tone={lowAccuracy.length + pendingStudents.length ? 'warning' : 'success'}>{lowAccuracy.length + pendingStudents.length}</StatusBadge>}>
                {[...lowAccuracy, ...pendingStudents].slice(0, 4).length ? (
                  <div className="space-y-3">
                    {[...lowAccuracy, ...pendingStudents].slice(0, 4).map((item) => (
                      <div key={`${item.name}-${item.pending}-${item.accuracy}`} className="v2-homework-alert-row">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                        <div className="min-w-0">
                          <p className="truncate font-black">{item.name}</p>
                          <p>{item.pending > 0 ? `仍有 ${item.pending} 题未提交` : `正确率 ${item.accuracy}%`}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={CheckCircle2} title="暂无异常" description="当前学生完成率和正确率没有触发提醒。" />
                )}
              </SectionCard>

              <SectionCard title="推荐干预" description="基于真实错题知识点和未提交状态生成入口提示。">
                <div className="space-y-3">
                  <div className="v2-homework-action-row">
                    <Target className="h-4 w-4 text-violet-300" />
                    <div>
                      <p>知识点专项巩固</p>
                      <span>{lowAccuracy.length || pendingStudents.length || 0} 名学生需要关注</span>
                    </div>
                  </div>
                  <div className="v2-homework-action-row">
                    <Clock className="h-4 w-4 text-emerald-300" />
                    <div>
                      <p>未提交跟进</p>
                      <span>{pendingStudents.length} 名学生存在未提交记录</span>
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="作业详情">
                {latestExam ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-black text-violet-300">{latestExam.title || '未命名作业'}</p>
                      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{latestExam.student_name || '未绑定学生'} · {formatTime(latestExam.created_at)}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="v2-mini-stat"><span>题目</span><strong>{examQuestions(latestExam).length}</strong></div>
                      <div className="v2-mini-stat"><span>完成</span><strong>{latestExam.graded_at ? '是' : '否'}</strong></div>
                      <div className="v2-mini-stat"><span>错题</span><strong>{(latestExam.grade_results || []).filter((row) => row.is_correct === false).length}</strong></div>
                    </div>
                  </div>
                ) : (
                  <EmptyState icon={FileText} title="暂无作业" description="布置作业后显示最近一份详情。" />
                )}
              </SectionCard>
            </aside>
          </div>
        </>
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
    </PageShell>
  )
}
