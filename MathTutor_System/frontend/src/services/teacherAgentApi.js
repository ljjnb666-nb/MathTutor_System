import api from './httpClient'

export function createTeacherAgentRun(payload) {
  return api.post('/api/teacher-agent/runs', payload)
}

export function getTeacherAgentRuns(limit = 20) {
  return api.get('/api/teacher-agent/runs', { params: { limit } })
}

export function getTeacherAgentRun(runId) {
  return api.get(`/api/teacher-agent/runs/${runId}`)
}
