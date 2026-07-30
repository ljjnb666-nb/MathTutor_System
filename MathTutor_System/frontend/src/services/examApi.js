import api from './httpClient'

export function getExam(id) {
  return api.get(`/api/exams/${id}`, { timeout: 60000 })
}

export function getExams(params = {}) {
  return api.get('/api/exams/', { params, timeout: 60000 })
}

export function updateExam(id, body) {
  return api.put(`/api/exams/${id}`, body, { timeout: 60000 })
}

export function saveExam(body) {
  return api.post('/api/exams/', body, { timeout: 60000 })
}

export function deleteExam(id) {
  return api.delete(`/api/exams/${id}`)
}

export function gradeExam(examId, body) {
  return api.post(`/api/exams/${examId}/grade`, body, { timeout: 15000 })
}
