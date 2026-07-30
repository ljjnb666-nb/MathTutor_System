import api from './httpClient'

export function getMistakes(params = {}) {
  return api.get('/api/mistakes/', { params, timeout: 20000 })
}

export function createMistake(body) {
  return api.post('/api/mistakes/', body, { timeout: 15000 })
}

export function addMistake(body) {
  return createMistake(body)
}

export function incrementMistakeReview(id) {
  const numId = id != null ? Number(id) : NaN
  if (Number.isNaN(numId)) return Promise.reject(new Error('错题记录 ID 无效'))
  return api.put(`/api/mistakes/${numId}/review`, {}, { timeout: 10000 })
}

export function markMistakeMaster(id) {
  const numId = id != null ? Number(id) : NaN
  if (Number.isNaN(numId)) return Promise.reject(new Error('错题记录 ID 无效'))
  return api.put(`/api/mistakes/${numId}/master`, {}, { timeout: 10000 })
}

export function deleteMistake(id) {
  const numId = id != null ? Number(id) : NaN
  if (Number.isNaN(numId)) return Promise.reject(new Error('错题记录 ID 无效'))
  return api.delete(`/api/mistakes/${numId}`, { timeout: 10000 })
}
