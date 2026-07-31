export default function AgentActionStatus({ action }) {
  if (!action) return null
  const labels = {
    pending_confirmation: 'Waiting for confirmation',
    executing: 'Saving',
    completed: 'Save completed',
    failed: 'Save failed',
    cancelled: 'Cancelled',
  }
  return (
    <section
      className="rounded-lg p-4 shadow-sm"
      style={{
        border: '1px solid var(--color-border-primary)',
        backgroundColor: 'var(--color-bg-card)'
      }}
    >
      <h2 className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>Save action status</h2>
      <p className="mt-2 text-sm" style={{ color: 'var(--color-text-primary)' }}>{labels[action.status] || action.status}</p>
      {action.result_json?.question_count != null && (
        <p className="mt-1 text-sm" style={{ color: '#047857' }}>Created {action.result_json.question_count} formal question-bank items.</p>
      )}
      {action.result_json?.question_ids && (
        <p className="mt-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>Question IDs: {action.result_json.question_ids.join(', ')}</p>
      )}
      {action.error_message && <p className="mt-1 text-sm" style={{ color: '#b91c1c' }}>{action.error_message}</p>}
    </section>
  )
}
