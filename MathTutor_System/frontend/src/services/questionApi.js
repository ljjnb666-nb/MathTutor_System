import api from './httpClient'

export function getQuestions(params = {}) {
  return api.get('/api/questions/', { params, timeout: 60000 })
}

export function saveQuestion(body) {
  return api.post('/api/questions/', body)
}

export function saveQuestionsBatch(body) {
  return api.post('/api/questions/batch/', body)
}

export function deleteQuestion(id) {
  return api.delete(`/api/questions/${id}/`)
}

export function collectQuestion(body) {
  return api.post('/api/bank/collect', body, { timeout: 15000 }).then((res) => res.data)
}

export function getBankList(params = {}) {
  return api.get('/api/bank/', { params, timeout: 20000 })
}

export function deleteFromBank(id) {
  return api.delete(`/api/bank/${id}`, { timeout: 10000 })
}
