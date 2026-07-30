import { useState } from 'react'
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
    await onPrepare()
    setDialogOpen(true)
  }

  return (
    <section className="rounded-lg border border-indigo-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-950">练习题草稿</h2>
          <p className="text-sm text-slate-500">生成草稿不会写入正式题库，必须由教师确认。</p>
        </div>
        {artifact && <span className="rounded bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700">版本 {artifact.version}</span>}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="text-xs font-semibold text-slate-700">
          题目数量
          <input type="number" min="1" max="10" value={config.question_count} onChange={(e) => setConfig({ ...config, question_count: Number(e.target.value) })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-semibold text-slate-700">
          题型
          <select value={config.question_types[0]} onChange={(e) => setConfig({ ...config, question_types: [e.target.value] })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="choice">选择题</option>
            <option value="fill">填空题</option>
            <option value="solution">解答题</option>
            <option value="true_false">判断题</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-700">
          难度
          <select value={config.difficulty} onChange={(e) => setConfig({ ...config, difficulty: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="easy">easy</option>
            <option value="medium">medium</option>
            <option value="hard">hard</option>
            <option value="mixed">mixed</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-700 md:col-span-2">
          知识点
          <input value={config.knowledge_points} onChange={(e) => setConfig({ ...config, knowledge_points: e.target.value })} placeholder="一次函数, 勾股定理" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-semibold text-slate-700">
          补充要求
          <input value={config.additional_requirements} onChange={(e) => setConfig({ ...config, additional_requirements: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={config.use_student_context} onChange={(e) => setConfig({ ...config, use_student_context: e.target.checked })} />
          参考学生错题
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={config.use_knowledge_base} onChange={(e) => setConfig({ ...config, use_knowledge_base: e.target.checked })} />
          使用我的知识库
        </label>
      </div>
      <button type="button" onClick={submitGenerate} disabled={loading} className="mt-4 inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
        生成练习题草稿
      </button>

      {error && <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {validation && (
        <div className={`mt-4 rounded-md border px-3 py-2 text-sm ${validation.valid ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
          校验状态：{validation.valid ? '通过' : '未通过'}；题目数：{validation.question_count}
          {(validation.errors || []).map((item) => <p key={item.code + item.message}>{item.message}</p>)}
        </div>
      )}

      {content && (
        <div className="mt-5 space-y-3">
          <div>
            <h3 className="text-lg font-bold text-slate-950">{content.title}</h3>
            <p className="text-sm text-slate-600">{content.summary}</p>
          </div>
          {content.questions.map((question, index) => (
            <PracticeQuestionEditor key={question.client_question_id} question={question} onChange={(next) => updateQuestion(index, next)} />
          ))}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={saveEdit} disabled={loading || !artifact || artifact.status === 'saved'} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">
              <Save className="h-4 w-4" />
              保存编辑
            </button>
            <button type="button" onClick={prepare} disabled={loading || !artifact || artifact.status !== 'ready_for_confirmation'} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300">
              保存到题库
            </button>
            {action?.status === 'pending_confirmation' && (
              <button type="button" onClick={onCancelAction} disabled={loading} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold">
                取消 Action
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
