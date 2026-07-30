import Latex from 'react-latex-next'
import { BookOpen, Calendar, FileQuestion, Loader2, Trash2, Users } from 'lucide-react'

import { normalizeLatexForKaTeX } from '../../../utils/latex'
import { flatQuestionsFromExam, getOptionDisplayText } from '../utils/homeworkUtils'

export default function HomeworkManagePanel({
  assignmentDate,
  draft,
  draftLoading,
  onAssignmentDateChange,
  onOpenAddBank,
  onOpenAddMistakes,
  onOpenAssign,
  onRefreshDraft,
  onRemoveFromDraft,
  removingQuestionIndex,
}) {
  const draftQuestions = flatQuestionsFromExam(draft)

  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <Calendar className="h-4 w-4 text-gray-500" />
          作业日期
        </label>
        <input
          type="date"
          value={assignmentDate}
          onChange={(e) => onAssignmentDateChange(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button
          type="button"
          onClick={() => onRefreshDraft(assignmentDate)}
          disabled={draftLoading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Loader2 className={`h-4 w-4 ${draftLoading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="font-medium text-gray-800">
            {assignmentDate} 当日作业{draft ? ` / ${draftQuestions.length} 题` : ''}
          </span>
          <button
            type="button"
            onClick={onOpenAddBank}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <BookOpen className="h-4 w-4" />
            从题库加入
          </button>
          <button
            type="button"
            onClick={onOpenAddMistakes}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <FileQuestion className="h-4 w-4" />
            从错题本加入
          </button>
          <button
            type="button"
            onClick={onOpenAssign}
            disabled={!draft || draftQuestions.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-800 hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Users className="h-4 w-4" />
            布置给学生
          </button>
        </div>

        {draftLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : !draft ? (
          <p className="py-6 text-center text-sm text-gray-500">暂无当日作业，点击“从题库加入”或“从错题本加入”开始组卷。</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {draftQuestions.map((question, idx) => (
              <li key={idx} className="flex items-start gap-3 py-3">
                <span className="w-8 shrink-0 pt-0.5 text-xs font-medium text-gray-500">{idx + 1}</span>
                <div className="min-w-0 flex-1 break-words text-sm text-gray-700">
                  <span className="inline">
                    <Latex>{normalizeLatexForKaTeX((question?.content ?? question?.body ?? '').trim() || '（无题干）')}</Latex>
                  </span>
                  {Array.isArray(question?.options) && question.options.length > 0 && (
                    <ul className="mt-1.5 list-none space-y-0.5 pl-0 text-gray-600">
                      {question.options.map((opt, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span className="shrink-0">{String.fromCharCode(65 + i)}.</span>
                          <span className="inline">
                            <Latex>{normalizeLatexForKaTeX(getOptionDisplayText(opt))}</Latex>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveFromDraft(idx)}
                  disabled={removingQuestionIndex !== null}
                  className="shrink-0 rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  title="从当日作业中移除"
                  aria-label="从当日作业中移除"
                >
                  {removingQuestionIndex === idx ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
