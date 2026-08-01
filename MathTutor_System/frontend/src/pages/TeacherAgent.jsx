import { useEffect, useState } from 'react'
import { AlertTriangle, Bot, CheckCircle2, Circle, Loader2, ShieldCheck } from 'lucide-react'
import { createTeacherAgentRun, getTeacherAgentRun, getTeacherAgentRuns } from '../services/teacherAgentApi'
import { useStudent } from '../contexts/StudentContext'
import { EmptyState, PageHeader, PageShell, SectionCard, StatusBadge } from '../components/UiV2'

const STEPS = ['理解目标', '读取学生', '分析薄弱点', '读取错题', '检索知识库', '生成计划', '完成']

function statusLabel(status) {
  return {
    completed: '已完成',
    needs_input: '需要补充',
    failed: '失败',
    running: '运行中',
    created: '已创建',
  }[status] || status
}

export default function TeacherAgent() {
  const { students, currentStudent, refreshStudents } = useStudent()
  const [goal, setGoal] = useState('')
  const [studentId, setStudentId] = useState(currentStudent?.id ?? '')
  const [knowledgePoint, setKnowledgePoint] = useState('')
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(false)
  const [loading, setLoading] = useState(false)
  const [run, setRun] = useState(null)
  const [history, setHistory] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    refreshStudents()
    loadHistory()
  }, [refreshStudents])

  useEffect(() => {
    if (currentStudent?.id && !studentId) setStudentId(currentStudent.id)
  }, [currentStudent?.id, studentId])

  const canSubmit = goal.trim().length > 0 && !loading

  async function loadHistory() {
    try {
      const res = await getTeacherAgentRuns(20)
      setHistory(Array.isArray(res.data) ? res.data : [])
    } catch {
      setHistory([])
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError('')
    setRun(null)
    try {
      const payload = {
        goal: goal.trim(),
        student_id: studentId ? Number(studentId) : null,
        knowledge_point: knowledgePoint.trim() || null,
        use_knowledge_base: useKnowledgeBase,
      }
      const res = await createTeacherAgentRun(payload)
      setRun(res.data)
      await loadHistory()
    } catch (err) {
      setError(err.response?.data?.detail || err.message || '生成教学计划失败')
    } finally {
      setLoading(false)
    }
  }

  async function openHistory(id) {
    try {
      const res = await getTeacherAgentRun(id)
      setRun(res.data)
      setError('')
    } catch {
      setError('无法读取该运行记录')
    }
  }

  const plan = run?.plan_json
  const missingFields = run?.missing_fields_json || plan?.missing_fields || []
  const warnings = run?.warnings_json || plan?.warnings || []
  const activeStep = loading ? 5 : run?.status === 'completed' ? 7 : run?.status === 'needs_input' ? 2 : 0

  return (
    <PageShell className="flex flex-col">
      <PageHeader
        title="AI 教师助手"
        description="只读教学计划工作台：基于学生、错题与知识库上下文生成计划，不写入题库或发布作业。"
        icon={Bot}
        actions={
          <StatusBadge tone="success">
            <ShieldCheck className="mr-1 h-3.5 w-3.5" />
            只读规划模式
          </StatusBadge>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[18rem_minmax(0,1fr)_22rem]">
        <aside className="min-h-0 space-y-4 xl:overflow-auto">
          <SectionCard title="最近运行" description="读取当前后端运行记录">
            <div className="space-y-2">
              {history.length === 0 && <EmptyState icon={Bot} title="暂无运行记录" description="提交目标后会显示历史记录" />}
              {history.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => openHistory(item.id)}
                  className="v2-mobile-row w-full text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-sm font-bold text-slate-100">{item.goal}</span>
                    <StatusBadge tone={item.status === 'completed' ? 'success' : item.status === 'failed' ? 'danger' : 'warning'}>
                      {statusLabel(item.status)}
                    </StatusBadge>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">{new Date(item.created_at).toLocaleString()}</p>
                </button>
              ))}
            </div>
          </SectionCard>
        </aside>

        <main className="min-h-0 space-y-4 xl:overflow-auto">
          <form onSubmit={handleSubmit}>
            <SectionCard title="直接告诉 AI 教师助手你想做什么" description="用自然语言描述教学需求，助手会规划可执行的只读教学方案。">
            <label className="block text-sm font-bold" style={{ color: 'var(--color-text-primary)' }} htmlFor="agent-goal">
              教学目标
            </label>
            <textarea
              id="agent-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={5}
              className="w-full resize-none rounded-lg px-3 py-2 text-sm outline-none transition-shadow focus:ring-2"
              style={{
                border: '1px solid var(--color-border-primary)',
                backgroundColor: 'var(--color-bg-input)',
                color: 'var(--color-text-primary)',
                '--tw-ring-color': 'color-mix(in srgb, var(--color-primary-500) 24%, transparent)',
              }}
              placeholder="根据学生最近错题，规划一节一次函数复习课。"
            />

            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                当前学生
                <select
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    border: '1px solid var(--color-border-primary)',
                    backgroundColor: 'var(--color-bg-input)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  <option value="">不指定学生</option>
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                知识点
                <input
                  value={knowledgePoint}
                  onChange={(e) => setKnowledgePoint(e.target.value)}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    border: '1px solid var(--color-border-primary)',
                    backgroundColor: 'var(--color-bg-input)',
                    color: 'var(--color-text-primary)',
                  }}
                  placeholder="例如：勾股定理"
                />
              </label>
              <label
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
                style={{ border: '1px solid var(--color-border-primary)', color: 'var(--color-text-primary)' }}
              >
                <input
                  type="checkbox"
                  checked={useKnowledgeBase}
                  onChange={(e) => setUseKnowledgeBase(e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                使用我的知识库
              </label>
            </div>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <button type="submit" disabled={!canSubmit} className="v2-btn-primary">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                  生成教学计划
                </button>
                <StatusBadge tone="neutral">不保存题库</StatusBadge>
                <StatusBadge tone="neutral">不发布作业</StatusBadge>
              </div>
            </SectionCard>
          </form>

          <SectionCard title="执行状态" description="展示当前后端运行阶段">
            <div className="mt-3 grid gap-2 md:grid-cols-4">
              {STEPS.map((step, index) => {
                const done = index + 1 <= activeStep
                return (
                  <div
                    key={step}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid var(--color-border-primary)' }}
                  >
                    {done ? <CheckCircle2 className="h-4 w-4" style={{ color: '#059669' }} /> : <Circle className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />}
                    <span style={{ color: done ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', fontWeight: done ? 700 : 500 }}>
                      {step}
                    </span>
                  </div>
                )
              })}
            </div>
          </SectionCard>

          {error && <StateNotice tone="error" text={error} />}
          {run?.status === 'failed' && <StateNotice tone="error" text={run.error_message || '运行失败'} />}
          {run?.status === 'needs_input' && <MissingFields fields={missingFields} />}
          {plan && <PlanResult plan={plan} warnings={warnings} />}
        </main>

        <aside className="min-h-0 space-y-4 xl:overflow-auto">
          <SectionCard title="当前上下文" description="本次运行将读取的真实上下文">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">学生</dt>
                <dd className="font-bold text-slate-100">{students.find((s) => String(s.id) === String(studentId))?.name || '不指定'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">知识点</dt>
                <dd className="font-bold text-slate-100">{knowledgePoint.trim() || '未限定'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">知识库</dt>
                <dd><StatusBadge tone={useKnowledgeBase ? 'success' : 'neutral'}>{useKnowledgeBase ? '启用' : '未启用'}</StatusBadge></dd>
              </div>
            </dl>
          </SectionCard>
          <SectionCard title="安全与确认" description="本阶段保持只读边界，不添加写入型教学动作。">
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone="success">只读生成计划</StatusBadge>
              <StatusBadge tone="neutral">无写入产物</StatusBadge>
              <StatusBadge tone="neutral">无写入确认</StatusBadge>
            </div>
          </SectionCard>
        </aside>
      </div>
    </PageShell>
  )
}

function StateNotice({ tone, text }) {
  const style = tone === 'error'
    ? { border: '1px solid rgba(244, 63, 94, 0.24)', backgroundColor: 'color-mix(in srgb, #f43f5e 10%, var(--color-bg-card))', color: '#be123c' }
    : { border: '1px solid rgba(251, 191, 36, 0.24)', backgroundColor: 'color-mix(in srgb, #fbbf24 10%, var(--color-bg-card))', color: '#92400e' }

  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium" style={style}>
      <AlertTriangle className="h-4 w-4" />
      {text}
    </div>
  )
}

function MissingFields({ fields }) {
  return (
    <section
      className="rounded-2xl p-5"
      style={{ border: '1px solid rgba(251, 191, 36, 0.24)', backgroundColor: 'color-mix(in srgb, #fbbf24 10%, var(--color-bg-card))' }}
    >
      <h2 className="text-sm font-bold" style={{ color: '#78350f' }}>
        需要补充信息
      </h2>
      <ul className="mt-2 space-y-1 text-sm" style={{ color: '#92400e' }}>
        {fields.map((field, index) => (
          <li key={`${field.field}-${index}`}>{field.message || field.field}</li>
        ))}
      </ul>
    </section>
  )
}

function PlanResult({ plan, warnings }) {
  return (
    <section
      className="rounded-2xl p-5 shadow-sm"
      style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>{plan.title}</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{plan.summary}</p>
        </div>
        <span className="rounded-lg px-2 py-1 text-xs font-bold" style={{ backgroundColor: 'var(--color-bg-panel)', color: 'var(--color-text-secondary)' }}>
          {plan.safety_mode}
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SummaryItem label="识别目标" value={plan.intent_type} />
        <SummaryItem label="薄弱知识点" value={(plan.evidence_summary?.weak_points || []).join('、') || '暂无'} />
        <SummaryItem label="近期错题数" value={String(plan.evidence_summary?.recent_mistake_count ?? 0)} />
      </div>
      <div className="mt-4 space-y-3">
        {(plan.steps || []).map((step) => (
          <div key={step.step_id} className="rounded-lg p-3" style={{ border: '1px solid var(--color-border-primary)' }}>
            <h3 className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>{step.step_id}. {step.title}</h3>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-text-primary)' }}>{step.description}</p>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>依据：{step.basis}</p>
          </div>
        ))}
      </div>
      {warnings.length > 0 && (
        <div
          className="mt-4 rounded-lg p-3 text-sm"
          style={{ border: '1px solid rgba(251, 191, 36, 0.24)', backgroundColor: 'color-mix(in srgb, #fbbf24 10%, var(--color-bg-card))', color: '#92400e' }}
        >
          {warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      )}
    </section>
  )
}

function SummaryItem({ label, value }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-panel)' }}>
      <div className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>{label}</div>
      <div className="mt-1 text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{value}</div>
    </div>
  )
}
