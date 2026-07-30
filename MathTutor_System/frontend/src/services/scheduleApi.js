import api from './httpClient'

const SCHEDULES_TIMEOUT = 30000

export function getSchedules(params = {}) {
  return api.get('/api/schedules/', { params, timeout: SCHEDULES_TIMEOUT }).then((res) => res.data)
}

export function createSchedule(body) {
  return api.post('/api/schedules/', body, { timeout: SCHEDULES_TIMEOUT }).then((res) => res.data)
}

export function updateSchedule(id, body) {
  return api.put(`/api/schedules/${id}`, body, { timeout: SCHEDULES_TIMEOUT }).then((res) => res.data)
}

export function deleteSchedule(id) {
  return api.delete(`/api/schedules/${id}`, { timeout: SCHEDULES_TIMEOUT })
}
