import { useEffect, useState } from 'react'
import { AlertTriangle, Bot, CheckCircle2, Circle, Loader2, ShieldCheck } from 'lucide-react'
import PracticeDraftPanel from '../components/teacher-agent/PracticeDraftPanel'
import {
  cancelPracticeAction,
  confirmPracticeAction,
  createPracticeDraft,
  createTeacherAgentRun,
  getPracticeArtifactActions,
  getTeacherAgentRun,
  getTeacherAgentRunArtifacts,
  getTeacherAgentRuns,
  preparePracticeSave,
  updatePracticeArtifact,
} from '../services/teacherAgentApi'
import { useStudent } from '../contexts/StudentContext'

const STEPS = ['Understand goal', 'Read student', 'Analyze weak points', 'Read mistakes', 'Search knowledge base', 'Generate plan', 'Done']

function statusLabel(status) {
  return {
    completed: 'Completed',
    needs_input: 'Needs input',
    failed: 'Failed',
    running: 'Running',
    created: 'Created',
  }[status] || status
}

export default function TeacherAgent() {
  const { students, currentStudent, refreshStudents } = useStudent()
  const [goal, setGoal] = useState('')
  const [studentId, setStudentId] = useState(currentStudent?.id ?? '')
  const [knowledgePoint, setKnowledgePoint] = useState('')
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(false)
  const [loading, setLoading] = useState(false)
  const [practiceLoading, setPracticeLoading] = useState(false)
  const [run, setRun] = useState(null)
  const [history, setHistory] = useState([])
  const [artifact, setArtifact] = useState(null)
  const [action, setAction] = useState(null)
  const [confirmation, setConfirmation] = useState(null)
  const [error, setError] = useState('')
  const [practiceError, setPracticeError] = useState('')

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
    setPracticeError('')
    setRun(null)
    setArtifact(null)
    setAction(null)
    setConfirmation(null)
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
      setError(err.response?.data?.detail || err.message || 'Failed to generate teaching plan')
    } finally {
      setLoading(false)
    }
  }

  async function openHistory(id) {
    try {
      const res = await getTeacherAgentRun(id)
      setRun(res.data)
      setError('')
      setPracticeError('')
      setArtifact(null)
      setAction(null)
      setConfirmation(null)
      await restorePracticeState(res.data.id)
    } catch {
      setError('Unable to load this run')
    }
  }

  async function restorePracticeState(runId) {
    try {
      const artifactsRes = await getTeacherAgentRunArtifacts(runId)
      const latestArtifact = Array.isArray(artifactsRes.data) ? artifactsRes.data[0] : null
      if (!latestArtifact) return
      setArtifact(latestArtifact)
      const actionsRes = await getPracticeArtifactActions(latestArtifact.id)
      const latestAction = Array.isArray(actionsRes.data) ? actionsRes.data[0] : null
      if (!latestAction) return
      setAction(latestAction)
      if (latestAction.status === 'pending_confirmation') {
        setConfirmation({
          question_count: latestArtifact.content_json?.questions?.length ?? 0,
          knowledge_points: latestArtifact.content_json?.knowledge_points || [],
          artifact_version: latestArtifact.version,
          target_question_bank: 'current teacher private question bank',
          target_label: 'current teacher private question bank',
          will_not: ['publish homework', 'create exam', 'send notifications', 'charge payment', 'create PPTX'],
        })
      }
    } catch {
      setPracticeError('Unable to restore practice draft state')
    }
  }

  async function handleGeneratePractice(config) {
    if (!run?.id) return
    setPracticeLoading(true)
    setPracticeError('')
    setAction(null)
    setConfirmation(null)
    try {
      const payload = {
        ...config,
        student_id: studentId ? Number(studentId) : null,
        use_student_context: Boolean(studentId) && config.use_student_context,
      }
      const res = await createPracticeDraft(run.id, payload)
      setArtifact(res.data)
    } catch (err) {
      setPracticeError(readError(err, 'Failed to generate practice draft'))
    } finally {
      setPracticeLoading(false)
    }
  }

  async function handleUpdatePractice(payload) {
    setPracticeLoading(true)
    setPracticeError('')
    try {
      const res = await updatePracticeArtifact(artifact.id, payload)
      setArtifact(res.data)
      setAction(null)
      setConfirmation(null)
      return res.data
    } catch (err) {
      const status = err.response?.status
      setPracticeError(status === 409 ? 'This draft was updated. Refresh and retry.' : readError(err, 'Failed to save edit'))
      return null
    } finally {
      setPracticeLoading(false)
    }
  }

  async function handlePrepareSave() {
    setPracticeLoading(true)
    setPracticeError('')
    try {
      const res = await preparePracticeSave(artifact.id)
      setAction(res.data.action)
      setConfirmation(res.data.confirmation_summary)
      return res.data
    } catch (err) {
      setPracticeError(readError(err, 'Failed to prepare save'))
      return null
    } finally {
      setPracticeLoading(false)
    }
  }

  async function handleConfirmSave() {
    if (!action) return
    setPracticeLoading(true)
    setPracticeError('')
    try {
      const res = await confirmPracticeAction(action.id, {
        idempotency_key: action.idempotency_key,
        expected_artifact_version: action.expected_artifact_version,
      })
      setAction(res.data)
      if (res.data.status === 'completed') {
        setArtifact((prev) => (prev ? { ...prev, status: 'saved', confirmed_at: res.data.completed_at } : prev))
      }
    } catch (err) {
      setPracticeError(readError(err, 'Failed to confirm save'))
    } finally {
      setPracticeLoading(false)
    }
  }

  async function handleCancelAction() {
    if (!action) return
    setPracticeLoading(true)
    setPracticeError('')
    try {
      const res = await cancelPracticeAction(action.id)
      setAction(res.data)
    } catch (err) {
      setPracticeError(readError(err, 'Failed to cancel action'))
    } finally {
      setPracticeLoading(false)
    }
  }

  const plan = run?.plan_json
  const missingFields = run?.missing_fields_json || plan?.missing_fields || []
  const warnings = run?.warnings_json || plan?.warnings || []
  const activeStep = loading ? 5 : run?.status === 'completed' ? 7 : run?.status === 'needs_input' ? 2 : 0

  return (
    <div className="mx-auto max-w-6xl space-y-6 md:space-y-8 animate-fade-in-up">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-3xl p-6 sm:p-8 shadow-sm" style={{ border: '1px solid color-mix(in srgb, var(--color-border-primary) 90%, transparent)', backgroundColor: 'var(--color-bg-card)' }}>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 text-white shadow-lg shrink-0" style={{ boxShadow: '0 10px 15px -3px color-mix(in srgb, var(--color-primary-500) 25%, transparent)' }}>
            <Bot className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--color-text-primary)' }}>AI 教师智能助手 Workspace</h1>
              <span className="rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)', color: 'var(--color-primary-600)' }}>
                Autonomous Agent
              </span>
            </div>
            <p className="mt-1 text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              基于学生错题与学情画像，自动进行多轮推理与备课计划生成。
            </p>
          </div>
        </div>

        <div className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold shadow-sm" style={{ border: '1px solid rgba(16, 185, 129, 0.2)', backgroundColor: 'color-mix(in srgb, #10b981 8%, var(--color-bg-card))', color: '#047857' }}>
          <ShieldCheck className="h-4 w-4 shrink-0" style={{ color: '#059669' }} />
          <span>AI 仅自动生成草稿，入库保存需由教师显式确认</span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <main className="space-y-6">
          <form onSubmit={handleSubmit} className="rounded-3xl p-6 sm:p-8 shadow-sm space-y-5" style={{ border: '1px solid color-mix(in srgb, var(--color-border-primary) 90%, transparent)', backgroundColor: 'var(--color-bg-card)' }}>
            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-wider" style={{ color: 'var(--color-text-primary)' }} htmlFor="agent-goal">
                教学目标 / 备课需求
              </label>
              <textarea
                id="agent-goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                rows={5}
                className="mt-2 w-full resize-none rounded-md px-3 py-2 text-sm outline-none focus:ring-2"
                style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
                placeholder="Plan a review lesson based on recent mistakes."
              />
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <label className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                  Current student
                  <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="mt-1 w-full rounded-md px-3 py-2 text-sm" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}>
                    <option value="">No student</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>{student.name}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                  Knowledge point
                  <input value={knowledgePoint} onChange={(e) => setKnowledgePoint(e.target.value)} className="mt-1 w-full rounded-md px-3 py-2 text-sm" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }} placeholder="Linear functions" />
                </label>
                <label className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium" style={{ border: '1px solid var(--color-border-primary)', color: 'var(--color-text-primary)' }}>
                  <input type="checkbox" checked={useKnowledgeBase} onChange={(e) => setUseKnowledgeBase(e.target.checked)} className="h-4 w-4 rounded" />
                  Use my knowledge base
                </label>
              </div>
              <button type="submit" disabled={!canSubmit} className="mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed transition-colors" style={{ backgroundColor: canSubmit ? 'var(--color-primary-600)' : 'var(--color-border-primary)' }}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                生成备课计划方案
              </button>
            </div>
          </form>

            <section className="rounded-lg p-4 shadow-sm" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }}>
              <h2 className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>Run status</h2>
              <div className="mt-3 grid gap-2 md:grid-cols-4">
                {STEPS.map((step, index) => {
                  const done = index + 1 <= activeStep
                  return (
                    <div key={step} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm" style={{ border: '1px solid var(--color-border-primary)' }}>
                      {done ? <CheckCircle2 className="h-4 w-4" style={{ color: '#059669' }} /> : <Circle className="h-4 w-4" style={{ color: 'var(--color-border-primary)' }} />}
                      <span style={{ fontWeight: done ? 600 : 400, color: done ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>{step}</span>
                    </div>
                  )
                })}
              </div>
            </section>

            {error && <StateNotice tone="error" text={error} />}
            {run?.status === 'failed' && <StateNotice tone="error" text={run.error_message || 'Run failed'} />}
            {run?.status === 'needs_input' && <MissingFields fields={missingFields} />}
            {plan && <PlanResult plan={plan} warnings={warnings} />}
            <PracticeDraftPanel
              run={run}
              artifact={artifact}
              action={action}
              loading={practiceLoading}
              error={practiceError}
              confirmation={confirmation}
              onGenerate={handleGeneratePractice}
              onUpdate={handleUpdatePractice}
              onPrepare={handlePrepareSave}
              onConfirm={handleConfirmSave}
              onCancelAction={handleCancelAction}
            />
          </main>

          <aside className="rounded-lg p-4 shadow-sm" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }}>
            <h2 className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>Run history</h2>
            <div className="mt-3 space-y-2">
              {history.length === 0 && <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>No runs yet</p>}
              {history.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => openHistory(item.id)}
                  className="w-full rounded-md px-3 py-2 text-left transition-colors"
                  style={{ border: '1px solid var(--color-border-primary)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-primary-300)'
                    e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)'
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
                  <p className="mt-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>{new Date(item.created_at).toLocaleString()}</p>
                </button>
              ))}
            </div>
          </aside>
        </div>
    </div>
  )
}

function StateNotice({ tone, text }) {
  return (
    <div className="flex items-center gap-2 rounded-md px-3 py-2 text-sm" style={tone === 'error' ? { border: '1px solid rgba(244, 63, 94, 0.2)', backgroundColor: 'color-mix(in srgb, #f43f5e 10%, var(--color-bg-card))', color: '#be123c' } : { border: '1px solid rgba(251, 191, 36, 0.2)', backgroundColor: 'color-mix(in srgb, #fbbf24 10%, var(--color-bg-card))', color: '#92400e' }}>
      <AlertTriangle className="h-4 w-4" />
      {text}
    </div>
  )
}

function MissingFields({ fields }) {
  return (
    <section className="rounded-lg p-4" style={{ border: '1px solid rgba(251, 191, 36, 0.2)', backgroundColor: 'color-mix(in srgb, #fbbf24 10%, var(--color-bg-card))' }}>
      <h2 className="text-sm font-bold" style={{ color: '#78350f' }}>More information needed</h2>
      <ul className="mt-2 space-y-1 text-sm" style={{ color: '#92400e' }}>
        {fields.map((field, index) => <li key={`${field.field}-${index}`}>{field.message || field.field}</li>)}
      </ul>
    </section>
  )
}

function PlanResult({ plan, warnings }) {
  return (
    <section className="rounded-lg p-4 shadow-sm" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>{plan.title}</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{plan.summary}</p>
        </div>
        <span className="rounded-md px-2 py-1 text-xs font-bold" style={{ backgroundColor: 'var(--color-bg-panel)', color: 'var(--color-text-secondary)' }}>{plan.safety_mode}</span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SummaryItem label="Intent" value={plan.intent_type} />
        <SummaryItem label="Weak points" value={(plan.evidence_summary?.weak_points || []).join(', ') || 'None'} />
        <SummaryItem label="Recent mistakes" value={String(plan.evidence_summary?.recent_mistake_count ?? 0)} />
      </div>
      <div className="mt-4 space-y-3">
        {(plan.steps || []).map((step) => (
          <div key={step.step_id} className="rounded-md p-3" style={{ border: '1px solid var(--color-border-primary)' }}>
            <h3 className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>{step.step_id}. {step.title}</h3>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-text-primary)' }}>{step.description}</p>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>Basis: {step.basis}</p>
          </div>
        ))}
      </div>
      {warnings.length > 0 && (
        <div className="mt-4 rounded-md p-3 text-sm" style={{ border: '1px solid rgba(251, 191, 36, 0.2)', backgroundColor: 'color-mix(in srgb, #fbbf24 10%, var(--color-bg-card))', color: '#92400e' }}>
          {warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      )}
    </section>
  )
}

function SummaryItem({ label, value }) {
  return (
    <div className="rounded-md px-3 py-2" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-panel)' }}>
      <div className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>{label}</div>
      <div className="mt-1 text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{value}</div>
    </div>
  )
}

function readError(err, fallback) {
  const detail = err.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (detail?.message) return detail.message
  return err.message || fallback
}
