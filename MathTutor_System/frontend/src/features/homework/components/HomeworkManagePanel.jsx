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
        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-primary)' }}>
          <Calendar className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
          作业日期
        </label>
        <input
          type="date"
          value={assignmentDate}
          onChange={(e) => onAssignmentDateChange(e.target.value)}
          className="h-9 rounded-lg px-3 text-sm transition-all"
          style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-primary-500)'
            e.currentTarget.style.boxShadow = '0 0 0 1px var(--color-primary-500)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border-primary)'
            e.currentTarget.style.boxShadow = ''
          }}
        />
        <button
          type="button"
          onClick={() => onRefreshDraft(assignmentDate)}
          disabled={draftLoading}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
          onMouseEnter={(e) => {
            if (!draftLoading) {
              e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
            }
          }}
          onMouseLeave={(e) => {
            if (!draftLoading) {
              e.currentTarget.style.backgroundColor = 'var(--color-bg-input)'
            }
          }}
        >
          <Loader2 className={`h-4 w-4 ${draftLoading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      <div className="rounded-xl p-4 shadow-sm" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
            {assignmentDate} 当日作业{draft ? ` / ${draftQuestions.length} 题` : ''}
          </span>
          <button
            type="button"
            onClick={onOpenAddBank}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white transition-all"
            style={{ background: 'linear-gradient(to right, var(--color-primary-600), var(--color-primary-700))' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.9'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1'
            }}
          >
            <BookOpen className="h-4 w-4" />
            从题库加入
          </button>
          <button
            type="button"
            onClick={onOpenAddMistakes}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-bg-input)'
            }}
          >
            <FileQuestion className="h-4 w-4" />
            从错题本加入
          </button>
          <button
            type="button"
            onClick={onOpenAssign}
            disabled={!draft || draftQuestions.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-800 transition-colors hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Users className="h-4 w-4" />
            布置给学生
          </button>
        </div>

        {draftLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--color-primary-600)' }} />
          </div>
        ) : !draft ? (
          <p className="py-6 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>暂无当日作业，点击"从题库加入"或"从错题本加入"开始组卷。</p>
        ) : (
          <ul style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
            {draftQuestions.map((question, idx) => (
              <li key={idx} className="flex items-start gap-3 py-3" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                <span className="w-8 shrink-0 pt-0.5 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>{idx + 1}</span>
                <div className="min-w-0 flex-1 break-words text-sm" style={{ color: 'var(--color-text-primary)' }}>
                  <span className="inline">
                    <Latex>{normalizeLatexForKaTeX((question?.content ?? question?.body ?? '').trim() || '（无题干）')}</Latex>
                  </span>
                  {Array.isArray(question?.options) && question.options.length > 0 && (
                    <ul className="mt-1.5 list-none space-y-0.5 pl-0" style={{ color: 'var(--color-text-secondary)' }}>
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
                  className="shrink-0 rounded-md p-1.5 text-red-600 transition-colors disabled:opacity-50"
                  onMouseEnter={(e) => {
                    if (removingQuestionIndex === null) {
                      e.currentTarget.style.backgroundColor = 'color-mix(in srgb, #dc2626 10%, transparent)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
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
