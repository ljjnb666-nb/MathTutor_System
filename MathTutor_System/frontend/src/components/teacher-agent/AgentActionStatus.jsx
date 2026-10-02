import { getAgentActionErrorPresentation, getStatusPresentation } from '../../utils/uiPresentation'

export default function AgentActionStatus({ action }) {
  if (!action) return null
  const presentation = getStatusPresentation('agentAction', action.status)
  const result = action.result_json || {}
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold text-slate-800">保存状态</h2>
      <p className="mt-2 text-sm text-slate-700">{presentation.label}</p>
      {result.question_count != null && (
        <p className="mt-1 text-sm text-emerald-700">已创建 {result.question_count} 道正式题库题目</p>
      )}
      {action.error_message && <p className="mt-1 text-sm text-rose-700">{getAgentActionErrorPresentation(action)}</p>}
    </section>
  )
}
