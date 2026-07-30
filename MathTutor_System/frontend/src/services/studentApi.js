import api from './httpClient'

const STUDENTS_TIMEOUT = 60000

export function getStudents(params = {}) {
  return api.get('/api/students/', { params, timeout: STUDENTS_TIMEOUT })
}

export function createStudent(body) {
  return api.post('/api/students/', body, { timeout: STUDENTS_TIMEOUT })
}

export function updateStudent(id, body) {
  return api.put(`/api/students/${id}`, body, { timeout: STUDENTS_TIMEOUT })
}

export function deleteStudent(id) {
  return api.delete(`/api/students/${id}`, { timeout: STUDENTS_TIMEOUT })
}

export function updateStudentTags(id, body) {
  return api.post(`/api/students/${id}/tags`, body, { timeout: STUDENTS_TIMEOUT })
}

export function getStudentReportPdf(studentId) {
  return api.get(`/api/reports/${studentId}`, {
    responseType: 'blob',
    timeout: 30000,
  })
}
