export default function PracticeQuestionEditor({ question, onChange }) {
  const update = (patch) => onChange({ ...question, ...patch })
  const options = Array.isArray(question.options) ? question.options : []

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold text-slate-500">{question.client_question_id}</span>
        <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{question.question_type}</span>
      </div>
      <label className="mt-3 block text-xs font-semibold text-slate-700">
        题干
        <textarea
          value={question.stem || ''}
          onChange={(e) => update({ stem: e.target.value })}
          rows={3}
          className="mt-1 w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="text-xs font-semibold text-slate-700">
          答案
          <input
            value={question.answer || ''}
            onChange={(e) => update({ answer: e.target.value })}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-slate-700">
          分值
          <input
            type="number"
            min="1"
            value={question.score || 0}
            onChange={(e) => update({ score: Number(e.target.value) })}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>
      {options.length > 0 && (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {options.map((option, index) => (
            <label key={index} className="text-xs font-semibold text-slate-700">
              选项 {index + 1}
              <input
                value={option}
                onChange={(e) => {
                  const next = [...options]
                  next[index] = e.target.value
                  update({ options: next })
                }}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          ))}
        </div>
      )}
      <label className="mt-3 block text-xs font-semibold text-slate-700">
        解析
        <textarea
          value={question.explanation || ''}
          onChange={(e) => update({ explanation: e.target.value })}
          rows={2}
          className="mt-1 w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="mt-3 block text-xs font-semibold text-slate-700">
        知识点
        <input
          value={(question.knowledge_points || []).join(', ')}
          onChange={(e) => update({ knowledge_points: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) })}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
    </div>
  )
}
