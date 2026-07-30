import api from './httpClient'

export function getStudentMastery(studentId) {
  return api.get(`/api/analysis/mastery/${studentId}`, { timeout: 20000 })
}

export function getStudentsOverview() {
  return api.get('/api/analysis/students-overview', { timeout: 15000 }).then((res) => res.data)
}

export function getStudentTrend(studentId, weeks = 8) {
  return api
    .get(`/api/analysis/trend/${studentId}`, { params: { weeks }, timeout: 15000 })
    .then((res) => res.data)
}

export function getDashboardStats() {
  return api.get('/api/dashboard/stats', { timeout: 15000 })
}
