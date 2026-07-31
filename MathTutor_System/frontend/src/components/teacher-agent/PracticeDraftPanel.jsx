import { useEffect, useState } from 'react'
import { Loader2, PlusCircle, Save } from 'lucide-react'
import PracticeQuestionEditor from './PracticeQuestionEditor'
import ConfirmPracticeSaveDialog from './ConfirmPracticeSaveDialog'
import AgentActionStatus from './AgentActionStatus'

export default function PracticeDraftPanel({
  run,
  artifact,
  action,
  loading,
  error,
  confirmation,
  onGenerate,
  onUpdate,
  onPrepare,
  onConfirm,
  onCancelAction,
}) {
  const [config, setConfig] = useState({
    question_count: 5,
    question_types: ['choice'],
    difficulty: 'medium',
    knowledge_points: '',
    use_student_context: true,
    use_knowledge_base: false,
    additional_requirements: '',
  })
  const [draftContent, setDraftContent] = useState(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    setDraftContent(artifact?.content_json || null)
    setDialogOpen(false)
  }, [artifact?.id, artifact?.version])

  if (run?.status !== 'completed') return null
  const content = draftContent || artifact?.content_json
  const validation = artifact?.validation_json

  const submitGenerate = () => {
    onGenerate({
      ...config,
      knowledge_points: config.knowledge_points.split(',').map((item) => item.trim()).filter(Boolean),
    })
  }

  const updateQuestion = (index, nextQuestion) => {
    const next = structuredClone(content)
    next.questions[index] = nextQuestion
    setDraftContent(next)
  }

  const saveEdit = async () => {
    const updated = await onUpdate({ expected_version: artifact.version, content })
    setDraftContent(updated?.content_json || null)
  }

  const prepare = async () => {
    const prepared = await onPrepare()
    if (prepared?.action && prepared?.confirmation_summary) setDialogOpen(true)
  }

  return (
    <section className="rounded-lg p-4 shadow-sm" style={{ border: '1px solid var(--color-primary-300)', backgroundColor: 'var(--color-bg-card)' }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>Practice draft</h2>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Drafts are not written to the formal question bank until confirmed.</p>
        </div>
        {artifact && <span className="rounded px-2 py-1 text-xs font-bold" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)', color: 'var(--color-primary-700)' }}>Version {artifact.version}</span>}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Question count
          <input
            type="number"
            min="1"
            max="10"
            value={config.question_count}
            onChange={(e) => setConfig({ ...config, question_count: Number(e.target.value) })}
            className="mt-1 w-full rounded-md px-3 py-2 text-sm"
            style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
          />
        </label>
        <label className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Question type
          <select
            value={config.question_types[0]}
            onChange={(e) => setConfig({ ...config, question_types: [e.target.value] })}
            className="mt-1 w-full rounded-md px-3 py-2 text-sm"
            style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
          >
            <option value="choice">Choice</option>
            <option value="fill">Fill</option>
            <option value="solution">Solution</option>
            <option value="true_false">True/false</option>
          </select>
        </label>
        <label className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Difficulty
          <select
            value={config.difficulty}
            onChange={(e) => setConfig({ ...config, difficulty: e.target.value })}
            className="mt-1 w-full rounded-md px-3 py-2 text-sm"
            style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
          >
            <option value="easy">easy</option>
            <option value="medium">medium</option>
            <option value="hard">hard</option>
            <option value="mixed">mixed</option>
          </select>
        </label>
        <label className="text-xs font-semibold md:col-span-2" style={{ color: 'var(--color-text-primary)' }}>
          Knowledge points
          <input
            value={config.knowledge_points}
            onChange={(e) => setConfig({ ...config, knowledge_points: e.target.value })}
            placeholder="Linear functions, quadratic equations"
            className="mt-1 w-full rounded-md px-3 py-2 text-sm"
            style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
          />
        </label>
        <label className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Extra requirements
          <input
            value={config.additional_requirements}
            onChange={(e) => setConfig({ ...config, additional_requirements: e.target.value })}
            className="mt-1 w-full rounded-md px-3 py-2 text-sm"
            style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        <label className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-primary)' }}>
          <input type="checkbox" checked={config.use_student_context} onChange={(e) => setConfig({ ...config, use_student_context: e.target.checked })} />
          Use student mistakes
        </label>
        <label className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-primary)' }}>
          <input type="checkbox" checked={config.use_knowledge_base} onChange={(e) => setConfig({ ...config, use_knowledge_base: e.target.checked })} />
          Use my knowledge base
        </label>
      </div>
      <button
        type="button"
        onClick={submitGenerate}
        disabled={loading}
        className="mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        style={{ backgroundColor: 'var(--color-primary-600)' }}
        onMouseEnter={(e) => {
          if (!loading) {
            e.currentTarget.style.backgroundColor = 'var(--color-primary-700)'
          }
        }}
        onMouseLeave={(e) => {
          if (!loading) {
            e.currentTarget.style.backgroundColor = 'var(--color-primary-600)'
          }
        }}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
        Generate practice draft
      </button>

      {error && <p className="mt-3 rounded-md px-3 py-2 text-sm" style={{ border: '1px solid rgba(239, 68, 68, 0.3)', backgroundColor: 'color-mix(in srgb, #ef4444 10%, var(--color-bg-card))', color: '#b91c1c' }}>{error}</p>}
      {validation && (
        <div
          className="mt-4 rounded-md px-3 py-2 text-sm"
          style={
            validation.valid
              ? { border: '1px solid rgba(16, 185, 129, 0.3)', backgroundColor: 'color-mix(in srgb, #10b981 10%, var(--color-bg-card))', color: '#047857' }
              : { border: '1px solid rgba(239, 68, 68, 0.3)', backgroundColor: 'color-mix(in srgb, #ef4444 10%, var(--color-bg-card))', color: '#b91c1c' }
          }
        >
          Validation: {validation.valid ? 'passed' : 'failed'}; questions: {validation.question_count}
          {(validation.errors || []).map((item) => <p key={item.code + item.message}>{item.message}</p>)}
        </div>
      )}

      {content && (
        <div className="mt-5 space-y-3">
          <div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>{content.title}</h3>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{content.summary}</p>
          </div>
          {content.questions.map((question, index) => (
            <PracticeQuestionEditor key={question.client_question_id} question={question} onChange={(next) => updateQuestion(index, next)} />
          ))}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={saveEdit}
              disabled={loading || !artifact || artifact.status === 'saved'}
              className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ border: '1px solid var(--color-border-primary)', color: 'var(--color-text-primary)' }}
              onMouseEnter={(e) => {
                if (!loading && artifact && artifact.status !== 'saved') {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                }
              }}
              onMouseLeave={(e) => {
                if (!loading && artifact && artifact.status !== 'saved') {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }
              }}
            >
              <Save className="h-4 w-4" />
              Save edit
            </button>
            <button
              type="button"
              onClick={prepare}
              disabled={loading || !artifact || artifact.status !== 'ready_for_confirmation' || action?.status === 'executing'}
              className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ backgroundColor: '#059669' }}
              onMouseEnter={(e) => {
                if (!loading && artifact && artifact.status === 'ready_for_confirmation' && action?.status !== 'executing') {
                  e.currentTarget.style.backgroundColor = '#047857'
                }
              }}
              onMouseLeave={(e) => {
                if (!loading && artifact && artifact.status === 'ready_for_confirmation' && action?.status !== 'executing') {
                  e.currentTarget.style.backgroundColor = '#059669'
                }
              }}
            >
              Save to question bank
            </button>
            {action?.status === 'pending_confirmation' && (
              <button
                type="button"
                onClick={onCancelAction}
                disabled={loading}
                className="rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ border: '1px solid var(--color-border-primary)', color: 'var(--color-text-primary)' }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }
                }}
              >
                Cancel action
              </button>
            )}
          </div>
        </div>
      )}
      <AgentActionStatus action={action} />
      <ConfirmPracticeSaveDialog open={dialogOpen} summary={confirmation} loading={loading} onCancel={() => setDialogOpen(false)} onConfirm={async () => { await onConfirm(); setDialogOpen(false) }} />
    </section>
  )
}
