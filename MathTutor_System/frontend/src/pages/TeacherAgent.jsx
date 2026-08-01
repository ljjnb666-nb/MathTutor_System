import { useEffect, useState } from 'react'
import { AlertTriangle, Bot, CheckCircle2, Circle, Loader2, ShieldCheck } from 'lucide-react'
import { createTeacherAgentRun, getTeacherAgentRun, getTeacherAgentRuns } from '../services/teacherAgentApi'
import { useStudent } from '../contexts/StudentContext'

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
    <div className="mx-auto max-w-6xl space-y-6 md:space-y-8 animate-fade-in-up">
      <header
        className="flex flex-col gap-4 rounded-2xl p-6 shadow-sm md:flex-row md:items-center md:justify-between"
        style={{
          border: '1px solid color-mix(in srgb, var(--color-border-primary) 90%, transparent)',
          backgroundColor: 'var(--color-bg-card)',
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 text-white shadow-lg"
            style={{ boxShadow: '0 10px 18px -8px color-mix(in srgb, var(--color-primary-500) 45%, transparent)' }}
          >
            <Bot className="h-7 w-7" />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-wider" style={{ color: 'var(--color-primary-600)' }}>
              AI Teacher Assistant
            </p>
            <h1 className="mt-1 text-xl font-black tracking-normal" style={{ color: 'var(--color-text-primary)' }}>
              只读教学计划工作台
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              基于学生、错题与知识库上下文生成教学计划，不写入题库或发布作业。
            </p>
          </div>
        </div>

        <div
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold"
          style={{
            border: '1px solid rgba(16, 185, 129, 0.24)',
            backgroundColor: 'color-mix(in srgb, #10b981 9%, var(--color-bg-card))',
            color: '#047857',
          }}
        >
          <ShieldCheck className="h-4 w-4" />
          只读规划模式
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <main className="space-y-6">
          <form
            onSubmit={handleSubmit}
            className="space-y-5 rounded-2xl p-6 shadow-sm"
            style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }}
          >
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

            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary-600)' }}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
              生成教学计划
            </button>
          </form>

          <section
            className="rounded-2xl p-5 shadow-sm"
            style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }}
          >
            <h2 className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
              执行状态
            </h2>
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
          </section>

          {error && <StateNotice tone="error" text={error} />}
          {run?.status === 'failed' && <StateNotice tone="error" text={run.error_message || '运行失败'} />}
          {run?.status === 'needs_input' && <MissingFields fields={missingFields} />}
          {plan && <PlanResult plan={plan} warnings={warnings} />}
        </main>

        <aside
          className="h-fit rounded-2xl p-5 shadow-sm"
          style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }}
        >
          <h2 className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
            历史运行
          </h2>
          <div className="mt-3 space-y-2">
            {history.length === 0 && <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>暂无运行记录</p>}
            {history.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => openHistory(item.id)}
                className="w-full rounded-lg px-3 py-2 text-left transition-colors"
                style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'transparent' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-primary-300)'
                  e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--color-primary-500) 9%, transparent)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border-primary)'
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{item.goal}</span>
                  <span className="shrink-0 text-xs" style={{ color: 'var(--color-text-secondary)' }}>{statusLabel(item.status)}</span>
                </div>
                <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>{new Date(item.created_at).toLocaleString()}</p>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
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
