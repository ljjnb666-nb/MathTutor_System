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
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold text-slate-800">Save action status</h2>
      <p className="mt-2 text-sm text-slate-700">{labels[action.status] || action.status}</p>
      {action.result_json?.question_count != null && (
        <p className="mt-1 text-sm text-emerald-700">Created {action.result_json.question_count} formal question-bank items.</p>
      )}
      {action.result_json?.question_ids && (
        <p className="mt-1 text-xs text-slate-500">Question IDs: {action.result_json.question_ids.join(', ')}</p>
      )}
      {action.error_message && <p className="mt-1 text-sm text-rose-700">{action.error_message}</p>}
    </section>
  )
}
