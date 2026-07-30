export const PAGE_SIZE = 20

export function formatDate(value) {
  if (!value) return '--'
  const date = typeof value === 'string' ? new Date(value) : value
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDateShort(value) {
  if (!value) return '--'
  const date = typeof value === 'string' ? new Date(value) : value
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

export function flatQuestionsFromExam(exam) {
  const questions = exam?.questions
  if (!questions) return []
  if (Array.isArray(questions)) return questions
  if (typeof questions === 'object' && Array.isArray(questions.questions)) return questions.questions
  return []
}

export function snippet(content) {
  if (!content || typeof content !== 'string') return '--'
  const text = content.replace(/<[^>]+>/g, '').replace(/\$[^$]+\$/g, '').replace(/\s+/g, ' ').trim()
  return text.length > 50 ? `${text.slice(0, 50)}...` : text || '--'
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export function getOptionDisplayText(opt) {
  if (typeof opt !== 'string') return String(opt ?? '')
  const s = opt.trim()
  const m = s.match(/^\s*[A-Za-z][.．、]\s*/)
  return m ? s.slice(m[0].length).trim() || s : s
}

export function bankItemToQuestion(item) {
  return {
    content: item.content ?? '',
    options: Array.isArray(item.options) ? item.options : [],
    answer: item.answer ?? '',
    analysis: item.analysis ?? '',
    knowledge_point: item.knowledge_point ?? '综合',
    question_type: item.question_type ?? '综合',
    difficulty: item.difficulty ?? 'L3',
  }
}

export function mistakeToQuestion(item) {
  return {
    content: item.content ?? '',
    options: [],
    answer: item.solution ?? '',
    analysis: '',
    knowledge_point: item.topic ?? '综合',
    question_type: '综合',
    difficulty: 'L3',
  }
}

export function buildQuestionRows(assignedExams) {
  const rows = []
  for (const exam of assignedExams) {
    const questions = flatQuestionsFromExam(exam)
    const gradeResults = exam.grade_results || []
    const getResult = (idx) => gradeResults.find((row) => row.question_index === idx)

    for (let i = 0; i < questions.length; i += 1) {
      const question = questions[i]
      const content = typeof question === 'object' ? question.content : ''
      const result = getResult(i)
      rows.push({
        key: `${exam.id}-${i}`,
        examId: exam.id,
        student_name: exam.student_name ?? '--',
        examTitle: exam.title || '未命名',
        created_at: exam.created_at,
        graded_at: exam.graded_at,
        questionIndex: i + 1,
        totalQuestions: questions.length,
        contentSnippet: snippet(content),
        is_correct: result != null ? result.is_correct : null,
        submitted: !!exam.graded_at,
      })
    }
  }
  return rows
}

export function filterQuestionRows(questionRows, filterStudent, filterStatus, sortBy) {
  let list = questionRows
  if (filterStudent.trim()) {
    const q = filterStudent.trim().toLowerCase()
    list = list.filter((row) => (row.student_name ?? '').toLowerCase().includes(q))
  }
  if (filterStatus === 'correct') list = list.filter((row) => row.is_correct === true)
  else if (filterStatus === 'wrong') list = list.filter((row) => row.is_correct === false)
  else if (filterStatus === 'pending') list = list.filter((row) => !row.submitted)

  if (sortBy === 'time') list = [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  else if (sortBy === 'student') list = [...list].sort((a, b) => (a.student_name || '').localeCompare(b.student_name || ''))
  else if (sortBy === 'status') {
    list = [...list].sort((a, b) => {
      const order = (row) => (row.submitted ? (row.is_correct ? 0 : 1) : 2)
      return order(a) - order(b)
    })
  }

  return list
}

export function groupRowsByExam(rows) {
  const map = new Map()
  for (const row of rows) {
    const key = `${row.examId}-${row.student_name}`
    if (!map.has(key)) {
      map.set(key, {
        examId: row.examId,
        examTitle: row.examTitle,
        student_name: row.student_name,
        created_at: row.created_at,
        graded_at: row.graded_at,
        submitted: row.submitted,
        rows: [],
      })
    }
    map.get(key).rows.push(row)
  }
  return Array.from(map.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

export function buildStats(questionRows) {
  const total = questionRows.length
  const submitted = questionRows.filter((row) => row.submitted).length
  const correct = questionRows.filter((row) => row.is_correct === true).length
  const wrong = questionRows.filter((row) => row.is_correct === false).length
  const pending = total - submitted
  return { total, submitted, correct, wrong, pending }
}
