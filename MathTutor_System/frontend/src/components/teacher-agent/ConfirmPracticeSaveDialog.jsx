export default function ConfirmPracticeSaveDialog({ open, summary, loading, onCancel, onConfirm }) {
  if (!open) return null
  const willNot = summary?.will_not || []
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'var(--color-bg-overlay)' }} role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-lg p-5 shadow-xl" style={{ backgroundColor: 'var(--color-bg-card)' }}>
        <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>Confirm question-bank save</h2>
        <div className="mt-3 space-y-2 text-sm" style={{ color: 'var(--color-text-primary)' }}>
          <p>Will create {summary?.question_count ?? 0} formal question-bank items.</p>
          <p>Target: {summary?.target_label || summary?.target_question_bank || 'question_bank'}</p>
          <p>Knowledge points: {(summary?.knowledge_points || []).join(', ') || 'none'}</p>
          <p>Total score: {summary?.total_score ?? 0}</p>
          <p>Artifact version: {summary?.artifact_version}</p>
          <div className="rounded-md p-3" style={{ border: '1px solid rgba(251, 191, 36, 0.3)', backgroundColor: 'color-mix(in srgb, #fbbf24 10%, var(--color-bg-card))', color: '#92400e' }}>
            {willNot.map((item) => <p key={item}>Will not: {item}</p>)}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-md px-4 py-2 text-sm font-semibold transition-colors"
            style={{
              border: '1px solid var(--color-border-primary)',
              color: 'var(--color-text-primary)'
            }}
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
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
            {loading ? 'Saving' : 'Confirm save to question bank'}
          </button>
        </div>
      </div>
    </div>
  )
}
