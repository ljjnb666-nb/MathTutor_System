export default function AgentActionStatus({ action }) {
  if (!action) return null
  const labels = {
    pending_confirmation: '等待确认',
    executing: '正在保存',
    completed: '保存完成',
    failed: '保存失败',
    cancelled: '已取消',
  }
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold text-slate-800">保存执行状态</h2>
      <p className="mt-2 text-sm text-slate-700">{labels[action.status] || action.status}</p>
      {action.result_json?.question_count != null && (
        <p className="mt-1 text-sm text-emerald-700">已创建正式题目 {action.result_json.question_count} 道。</p>
      )}
      {action.result_json?.question_ids && (
        <p className="mt-1 text-xs text-slate-500">题目 ID：{action.result_json.question_ids.join(', ')}</p>
      )}
      {action.error_message && <p className="mt-1 text-sm text-rose-700">{action.error_message}</p>}
    </section>
  )
}
