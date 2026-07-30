import { useEffect, useMemo, useState } from 'react'
import { Bot, CheckCircle2, Circle, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react'
import { createTeacherAgentRun, getTeacherAgentRun, getTeacherAgentRuns } from '../services/teacherAgentApi'
import { useStudent } from '../contexts/StudentContext'

const STEPS = [
  '理解教学目标',
  '读取学生信息',
  '分析薄弱知识点',
  '读取近期错题',
  '检索知识库',
  '生成计划',
  '完成',
]

function statusLabel(status) {
  return {
    completed: '已完成',
    needs_input: '需要补充信息',
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
      setError(err.response?.data?.detail || '生成教学计划失败')
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
    <div className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-2 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-indigo-700">
              <Bot className="h-4 w-4" />
              AI 教师助手
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-normal text-slate-950">只读教学计划工作台</h1>
          </div>
          <div className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
            当前为只读规划模式
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <main className="space-y-5">
            <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <label className="text-sm font-semibold text-slate-800" htmlFor="agent-goal">
                教学目标
              </label>
              <textarea
                id="agent-goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                rows={5}
                className="mt-2 w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                placeholder="根据张同学最近的错题，为他规划一节一次函数复习课。"
              />
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <label className="text-sm font-medium text-slate-700">
                  当前学生
                  <select
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">不指定学生</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">
                  知识点
                  <input
                    value={knowledgePoint}
                    onChange={(e) => setKnowledgePoint(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    placeholder="例如：勾股定理"
                  />
                </label>
                <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={useKnowledgeBase}
                    onChange={(e) => setUseKnowledgeBase(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  使用我的知识库
                </label>
              </div>
              <button
                type="submit"
                disabled={!canSubmit}
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                生成教学计划
              </button>
            </form>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-bold text-slate-800">执行状态</h2>
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
            {run?.status === 'failed' && <StateNotice tone="error" text={run.error_message || '运行失败'} />}
            {run?.status === 'needs_input' && <MissingFields fields={missingFields} />}
            {plan && <PlanResult plan={plan} warnings={warnings} />}
          </main>

          <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800">历史运行</h2>
            <div className="mt-3 space-y-2">
              {history.length === 0 && <p className="text-sm text-slate-500">暂无运行记录</p>}
              {history.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => openHistory(item.id)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-left hover:border-indigo-300 hover:bg-indigo-50"
                >
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
      <h2 className="text-sm font-bold text-amber-900">需要补充信息</h2>
      <ul className="mt-2 space-y-1 text-sm text-amber-800">
        {fields.map((field, index) => (
          <li key={`${field.field}-${index}`}>{field.message || field.field}</li>
        ))}
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
        <SummaryItem label="识别目标" value={plan.intent_type} />
        <SummaryItem label="薄弱知识点" value={(plan.evidence_summary?.weak_points || []).join('、') || '暂无'} />
        <SummaryItem label="近期错题数" value={String(plan.evidence_summary?.recent_mistake_count ?? 0)} />
      </div>
      <div className="mt-4 space-y-3">
        {plan.steps.map((step) => (
          <div key={step.step_id} className="rounded-md border border-slate-200 p-3">
            <h3 className="text-sm font-bold text-slate-900">{step.step_id}. {step.title}</h3>
            <p className="mt-1 text-sm text-slate-700">{step.description}</p>
            <p className="mt-1 text-xs text-slate-500">依据：{step.basis}</p>
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
