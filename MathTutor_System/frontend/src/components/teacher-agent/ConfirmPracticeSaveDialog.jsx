export default function ConfirmPracticeSaveDialog({ open, summary, loading, onCancel, onConfirm }) {
  if (!open) return null
  const willNot = summary?.will_not || []
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
        <h2 className="text-lg font-bold text-slate-950">确认保存到题库</h2>
        <div className="mt-3 space-y-2 text-sm text-slate-700">
          <p>将创建 {summary?.question_count ?? 0} 道正式题目。</p>
          <p>目标题库：{summary?.target_question_bank || 'question_bank'}</p>
          <p>知识点：{(summary?.knowledge_points || []).join('、') || '未指定'}</p>
          <p>总分：{summary?.total_score ?? 0}</p>
          <p>Artifact 版本：{summary?.artifact_version}</p>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">
            {willNot.map((item) => <p key={item}>不会：{item}</p>)}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={loading} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold">
            取消
          </button>
          <button type="button" onClick={onConfirm} disabled={loading} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300">
            {loading ? '正在保存' : '确认保存到题库'}
          </button>
        </div>
      </div>
    </div>
  )
}
