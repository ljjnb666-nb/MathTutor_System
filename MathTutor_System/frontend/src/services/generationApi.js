import api from './httpClient'

export const GENERATE_TIMEOUT = 300000

export function generateQuestions(params) {
  const body = {
    knowledge_point: params.knowledge_point,
    scenario: params.scenario ?? 'default',
    difficulty: params.difficulty,
    question_type: params.question_type ?? '选择',
    count: params.count ?? 3,
  }
  if (params.ref_content != null && String(params.ref_content).trim()) {
    body.ref_content = String(params.ref_content).trim()
  }
  if (params.student_id != null && Number.isFinite(params.student_id)) {
    body.student_id = params.student_id
  }
  if (params.use_knowledge_base === true) {
    body.use_knowledge_base = true
  }
  return api.post('/api/generate', body, { timeout: GENERATE_TIMEOUT })
}

export function generateWeakPointQuestions(params) {
  const body = {
    student_id: params.student_id,
    count: params.count ?? 5,
    difficulty: params.difficulty ?? 'L3',
    question_type: params.question_type ?? '综合',
    use_knowledge_base: params.use_knowledge_base === true,
  }
  return api.post('/api/generate/weak-point', body, { timeout: GENERATE_TIMEOUT })
}

export function generateExam(params) {
  const body = {
    knowledge_point: (params.knowledge_point ?? '').trim(),
    difficulty: params.difficulty ?? 'L3',
  }
  if (params.student_id != null && Number.isFinite(params.student_id)) {
    body.student_id = params.student_id
  }
  if (params.use_knowledge_base === true) {
    body.use_knowledge_base = true
  }
  return api.post('/api/exam', body, { timeout: GENERATE_TIMEOUT })
}

export function verifyQuestion(question) {
  return api
    .post('/api/verify', question, { timeout: GENERATE_TIMEOUT })
    .then((res) => res.data)
}
