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
    <div className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-2 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-indigo-700">
              <Bot className="h-4 w-4" />
              AI Teacher Agent
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-normal text-slate-950">Read-only teaching plan workspace</h1>
          </div>
          <div className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
            The model only creates drafts. Formal question-bank saves require teacher confirmation.
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <main className="space-y-5">
            <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <label className="text-sm font-semibold text-slate-800" htmlFor="agent-goal">
                Teaching goal
              </label>
              <textarea
                id="agent-goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                rows={5}
                className="mt-2 w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                placeholder="Plan a review lesson based on recent mistakes."
              />
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <label className="text-sm font-medium text-slate-700">
                  Current student
                  <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value="">No student</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>{student.name}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Knowledge point
                  <input value={knowledgePoint} onChange={(e) => setKnowledgePoint(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Linear functions" />
                </label>
                <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
                  <input type="checkbox" checked={useKnowledgeBase} onChange={(e) => setUseKnowledgeBase(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                  Use my knowledge base
                </label>
              </div>
              <button type="submit" disabled={!canSubmit} className="mt-4 inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                Generate teaching plan
              </button>
            </form>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-bold text-slate-800">Run status</h2>
              <div className="mt-3 grid gap-2 md:grid-cols-4">
                {STEPS.map((step, index) => {
                  const done = index + 1 <= activeStep
                  return (
                    <div key={step} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                      {done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-slate-300" />}
                      <span className={done ? 'font-semibold text-slate-800' : 'text-slate-500'}>{step}</span>
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

          <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800">Run history</h2>
            <div className="mt-3 space-y-2">
              {history.length === 0 && <p className="text-sm text-slate-500">No runs yet</p>}
              {history.map((item) => (
                <button type="button" key={item.id} onClick={() => openHistory(item.id)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-left hover:border-indigo-300 hover:bg-indigo-50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-slate-800">{item.goal}</span>
                    <span className="shrink-0 text-xs text-slate-500">{statusLabel(item.status)}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</p>
                </button>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

function StateNotice({ tone, text }) {
  return (
    <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
      <AlertTriangle className="h-4 w-4" />
      {text}
    </div>
  )
}

function MissingFields({ fields }) {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <h2 className="text-sm font-bold text-amber-900">More information needed</h2>
      <ul className="mt-2 space-y-1 text-sm text-amber-800">
        {fields.map((field, index) => <li key={`${field.field}-${index}`}>{field.message || field.field}</li>)}
      </ul>
    </section>
  )
}

function PlanResult({ plan, warnings }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">{plan.title}</h2>
          <p className="mt-1 text-sm text-slate-600">{plan.summary}</p>
        </div>
        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{plan.safety_mode}</span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SummaryItem label="Intent" value={plan.intent_type} />
        <SummaryItem label="Weak points" value={(plan.evidence_summary?.weak_points || []).join(', ') || 'None'} />
        <SummaryItem label="Recent mistakes" value={String(plan.evidence_summary?.recent_mistake_count ?? 0)} />
      </div>
      <div className="mt-4 space-y-3">
        {(plan.steps || []).map((step) => (
          <div key={step.step_id} className="rounded-md border border-slate-200 p-3">
            <h3 className="text-sm font-bold text-slate-900">{step.step_id}. {step.title}</h3>
            <p className="mt-1 text-sm text-slate-700">{step.description}</p>
            <p className="mt-1 text-xs text-slate-500">Basis: {step.basis}</p>
          </div>
        ))}
      </div>
      {warnings.length > 0 && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      )}
    </section>
  )
}

function SummaryItem({ label, value }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-800">{value}</div>
    </div>
  )
}

function readError(err, fallback) {
  const detail = err.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (detail?.message) return detail.message
  return err.message || fallback
}
