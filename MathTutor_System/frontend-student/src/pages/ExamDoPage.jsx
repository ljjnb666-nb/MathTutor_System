import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import Latex from '../components/Latex'
import { getStudentExam, studentGradeExam } from '../services/api'
import toast from 'react-hot-toast'

function flatQuestionsFromExam(exam) {
  const q = exam?.questions
  if (!q) return []
  if (Array.isArray(q)) return q
  if (q && typeof q === 'object' && Array.isArray(q.questions)) return q.questions
  return []
}

function safeLatex(text) {
  if (!text || typeof text !== 'string') return ''
  try {
    return text.replace(/\\\[/g, '$$').replace(/\\\]/g, '$$').replace(/\\\(/g, '$').replace(/\\\)/g, '$')
  } catch {
    return text
  }
}

/** 去掉选项文本开头的 "A." "B." 等前缀，避免重复显示 */
function getOptionDisplayText(opt) {
  if (typeof opt !== 'string') return String(opt ?? '')
  const s = opt.trim()
  const m = s.match(/^\s*[A-Za-z][.．、]\s*/)
  return m ? s.slice(m[0].length).trim() || s : s
}

/** 是否为选择题（有选项列表） */
function isChoiceQuestion(q) {
  return Array.isArray(q?.options) && q.options.length > 0
}

/** 是否为解答题（学生自评对错，系统不判题） */
function isSolutionQuestion(q) {
  const t = (q?.question_type || q?.type || '').trim()
  return t === '解答' || t === '解答题'
}

export default function ExamDoPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [exam, setExam] = useState(null)
  const [loading, setLoading] = useState(true)
  const [answers, setAnswers] = useState({}) // index -> string (选项字母或填空文本)
  const [selfGrade, setSelfGrade] = useState({}) // 解答题：index -> true|false（学生自评）
  const [submitting, setSubmitting] = useState(false)
  const [graded, setGraded] = useState(null) // 提交后 { graded, mistakes_added, grade_summary?, grade_results? }

  useEffect(() => {
    if (!id) return
    getStudentExam(id)
      .then((data) => setExam(data))
      .catch((e) => {
        toast.error('加载失败：' + (e.response?.data?.detail ?? e.message))
        navigate('/exams', { replace: true })
      })
      .finally(() => setLoading(false))
  }, [id, navigate])

  const questions = exam ? flatQuestionsFromExam(exam) : []
  const alreadySubmitted = !!(exam?.graded_at)
  const allAnswered =
    questions.length > 0 &&
    questions.every((q, i) => {
      if (isSolutionQuestion(q)) return selfGrade[i] !== undefined
      const v = answers[i]
      if (isChoiceQuestion(q)) return v !== undefined && v !== ''
      return v !== undefined
    })

  const handleSubmit = async () => {
    if (!allAnswered) {
      toast.error('请完成所有题目后再提交')
      return
    }
    setSubmitting(true)
    try {
      const body = {
        student_answers: questions.map((_, index) => {
          const q = questions[index]
          if (isSolutionQuestion(q)) {
            return {
              question_index: index,
              student_answer: '',
              is_correct: selfGrade[index] === true,
            }
          }
          return {
            question_index: index,
            student_answer: (answers[index] ?? '').trim(),
          }
        }),
      }
      const res = await studentGradeExam(Number(id), body)
      setGraded(res)
      const summary = res.grade_summary
      const correct = summary ? summary.correct : res.graded
      const total = summary ? summary.total : res.graded
      toast.success(`已提交：答对 ${correct}/${total} 题，${res.mistakes_added} 题加入错题本`)
    } catch (e) {
      toast.error(e.response?.data?.detail ?? '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !exam) {
    return (
      <div className="flex flex-col items-center justify-center py-12" role="status" aria-live="polite">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500" aria-hidden />
        <p className="mt-3 text-sm text-gray-500">加载试卷中…</p>
      </div>
    )
  }

  // 已提交或再次打开已提交作业：显示结果（含上次答案、正确答案、解析），不可再提交
  const resultData = graded || (alreadySubmitted && exam ? { grade_summary: exam.grade_summary, grade_results: exam.grade_results, mistakes_added: 0 } : null)
  if (resultData) {
    const summary = resultData.grade_summary || { correct: 0, total: 0 }
    const resultsList = resultData.grade_results || []
    const correctCount = summary.correct ?? 0
    const totalCount = summary.total ?? resultsList.length
    const resultByIndex = {}
    resultsList.forEach((r, idx) => { resultByIndex[r.question_index ?? idx] = r })

    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-gray-800 sm:text-2xl">{exam.title || '未命名作业'} · 答题结果</h1>
          <button
            type="button"
            onClick={() => navigate('/exams')}
            className="rounded-btn bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-card transition-all hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            aria-label="返回题目列表"
          >
            返回题目列表
          </button>
        </div>
        <p className="text-gray-600">
          答对 <strong>{correctCount}</strong> / <strong>{totalCount}</strong> 题
          {resultData.mistakes_added > 0 && `，其中 ${resultData.mistakes_added} 题已加入错题本。`}
        </p>

        <ul className="space-y-6">
          {questions.map((q, index) => {
            const r = resultByIndex[index]
            const isCorrect = r?.is_correct
            const studentAnswer = r?.student_answer ?? ''
            const isSolution = isSolutionQuestion(q)
            return (
              <li key={index} className="student-card-static rounded-card p-5">
                <div className="mb-2 flex items-center gap-2 text-sm">
                  <span className="font-medium text-gray-500">第 {index + 1} 题</span>
                  {q.knowledge_point && <span className="text-gray-400">· {q.knowledge_point}</span>}
                  {isCorrect !== undefined && (
                    isCorrect ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" aria-hidden />
                    )
                  )}
                </div>
                <div className="prose prose-sm max-w-none text-gray-800">
                  <Latex>{safeLatex(q.content ?? q.body ?? '')}</Latex>
                  {Array.isArray(q.options) && q.options.length > 0 && (
                    <ul className="mt-2 list-none space-y-1 pl-0 text-gray-600">
                      {(q.options || []).map((opt, i) => (
                        <li key={i}>
                          <span className="font-medium">{String.fromCharCode(65 + i)}.</span>{' '}
                          <Latex>{safeLatex(getOptionDisplayText(opt))}</Latex>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="mt-4 space-y-2 border-t border-gray-100 pt-3 text-sm">
                  <p className="text-gray-700">
                    <span className="font-medium text-gray-500">你的答案：</span>
                    {isSolution
                      ? (isCorrect ? '自评答对' : '自评答错')
                      : (studentAnswer || '—')}
                  </p>
                  {(q.answer || q.analysis) && (
                    <>
                      {q.answer && (
                        <p className="text-gray-700">
                          <span className="font-medium text-gray-500">正确答案：</span>
                          <Latex>{safeLatex((q.answer ?? '').trim())}</Latex>
                        </p>
                      )}
                      {q.analysis && (
                        <div className="rounded-lg bg-gray-50 p-3 text-gray-700">
                          <span className="font-medium text-gray-500">解析：</span>
                          <div className="mt-1">
                            <Latex>{safeLatex((q.analysis ?? '').trim())}</Latex>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        <div className="flex flex-wrap gap-3 border-t border-gray-200 pt-5">
          <button
            type="button"
            onClick={() => navigate('/exams')}
            className="rounded-btn bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-card transition-all hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            aria-label="返回题目列表"
          >
            返回题目列表
          </button>
          {resultData.mistakes_added > 0 ? (
            <button
              type="button"
              onClick={() => navigate('/mistakes')}
              className="rounded-btn border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
              aria-label="去错题本查看"
            >
              去看错题本（{resultData.mistakes_added} 题）
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/mistakes')}
              className="rounded-btn border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-card transition-all hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              aria-label="去错题本"
            >
              错题本
            </button>
          )}
        </div>
      </div>
    )
  }

  const answeredCount = questions.filter((q, i) =>
    isSolutionQuestion(q) ? selfGrade[i] !== undefined : (answers[i] !== undefined && (isChoiceQuestion(q) ? answers[i] !== '' : true))
  ).length

  // 未提交：做题页（选择题选选项，填空题填答案，解答题自评）
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-gray-800 sm:text-2xl">{exam.title || '未命名作业'}</h1>
        <button
          type="button"
          onClick={() => navigate('/exams')}
          className="rounded-btn border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 shadow-card transition-all hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          aria-label="返回题目列表"
        >
          返回列表
        </button>
      </div>

      <p className="text-sm text-gray-500">
        选择题、填空题由系统判题；解答题请自评对错后提交。
      </p>

      <div className="rounded-card border border-gray-200 bg-white px-4 py-2.5 shadow-card">
        <p className="text-sm font-medium text-gray-700">
          进度：<span className="tabular-nums text-primary-600">{answeredCount}</span> / <span className="tabular-nums">{questions.length}</span> 题
        </p>
      </div>

      <ul className="space-y-6">
        {questions.map((q, index) => {
          const isChoice = isChoiceQuestion(q)
          return (
            <li key={index} className="student-card-static rounded-card p-5">
              <div className="mb-2 text-sm font-medium text-gray-500">
                第 {index + 1} 题
                {q.knowledge_point && ` · ${q.knowledge_point}`}
              </div>
              <div className="prose prose-sm max-w-none text-gray-800">
                <Latex>{safeLatex(q.content ?? q.body ?? '')}</Latex>
                {isChoice && (
                  <ul className="mt-3 list-none space-y-1.5 pl-0" role="radiogroup" aria-label={`第 ${index + 1} 题选项`}>
                    {(q.options || []).map((opt, i) => {
                      const label = String.fromCharCode(65 + i)
                      const value = label
                      const checked = answers[index] === value
                      return (
                        <li key={i}>
                          <label className="flex cursor-pointer gap-2 rounded-btn border border-gray-200 px-3 py-2.5 transition-colors hover:bg-gray-50 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50">
                            <input
                              type="radio"
                              name={`q-${index}`}
                              value={value}
                              checked={checked}
                              onChange={() => setAnswers((a) => ({ ...a, [index]: value }))}
                              className="mt-1 h-4 w-4 border-gray-300 text-primary-600 focus:ring-primary-500"
                              aria-label={`选项 ${label}`}
                            />
                            <span className="shrink-0 font-medium text-gray-600">{label}.</span>
                            <span className="min-w-0 flex-1">
                              <Latex>{safeLatex(getOptionDisplayText(opt))}</Latex>
                            </span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
              {!isChoice && isSolutionQuestion(q) && (
                <div className="mt-4 flex gap-2" role="group" aria-label={`第 ${index + 1} 题自评对错`}>
                  <button
                    type="button"
                    onClick={() => setSelfGrade((g) => ({ ...g, [index]: true }))}
                    className={`inline-flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
                      selfGrade[index] === true
                        ? 'bg-green-600 text-white'
                        : 'border border-green-600 bg-white text-green-600 hover:bg-green-50'
                    }`}
                    aria-pressed={selfGrade[index] === true}
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    答对
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelfGrade((g) => ({ ...g, [index]: false }))}
                    className={`inline-flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${
                      selfGrade[index] === false
                        ? 'bg-red-600 text-white'
                        : 'border border-red-600 bg-white text-red-600 hover:bg-red-50'
                    }`}
                    aria-pressed={selfGrade[index] === false}
                  >
                    <XCircle className="h-4 w-4" aria-hidden />
                    答错
                  </button>
                </div>
              )}
              {!isChoice && !isSolutionQuestion(q) && (
                <div className="mt-4">
                  <label htmlFor={`fill-${index}`} className="sr-only">
                    第 {index + 1} 题答案
                  </label>
                  <input
                    id={`fill-${index}`}
                    type="text"
                    value={answers[index] ?? ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [index]: e.target.value }))}
                    placeholder="请输入答案（填空题）"
                    className="w-full rounded-btn border border-gray-300 px-3 py-2 text-gray-800 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    aria-label={`第 ${index + 1} 题答案`}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <div className="flex justify-end border-t border-gray-200 pt-5">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!allAnswered || submitting}
          className="rounded-btn bg-primary-600 px-6 py-2.5 text-sm font-medium text-white shadow-card transition-all hover:bg-primary-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          aria-label={submitting ? '提交中' : '提交答案'}
        >
          {submitting ? '提交中…' : '提交答案'}
        </button>
      </div>
    </div>
  )
}
