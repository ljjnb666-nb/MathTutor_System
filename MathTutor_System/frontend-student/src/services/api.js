import axios from 'axios'
import { createApiClient } from '../../../shared/frontend/createApiClient'

export const AUTH_TOKEN_KEY = 'math_tutor_student_token'

const api = createApiClient(axios, {
  importMeta: import.meta,
  tokenStorageKey: AUTH_TOKEN_KEY,
  onUnauthorized: () => {
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.assign('/login')
    }
  },
})

export default api

export function studentLogin(login_code, password = null) {
  return api.post('/api/student/token', { login_code, password }).then((res) => res.data)
}

export function getStudentMe() {
  return api.get('/api/student/me').then((res) => res.data)
}

export function getStudentMistakes(params = {}) {
  const { topic, ...rest } = params
  const p = { ...rest }
  if (topic != null && String(topic).trim()) p.topic = String(topic).trim()
  return api.get('/api/student/mistakes', { params: p }).then((res) => res.data)
}

export function getStudentMistake(id) {
  return api.get(`/api/student/mistakes/${id}`).then((res) => res.data)
}

export function studentMistakeReview(id) {
  return api.put(`/api/student/mistakes/${id}/review`).then((res) => res.data)
}

export function studentMistakeMaster(id) {
  return api.put(`/api/student/mistakes/${id}/master`).then((res) => res.data)
}

export function getStudentAnalysisMastery() {
  return api.get('/api/student/analysis/mastery').then((res) => res.data)
}

export function getStudentAnalysisTrend(weeks = 8) {
  return api.get('/api/student/analysis/trend', { params: { weeks } }).then((res) => res.data)
}

export function getStudentExams() {
  return api.get('/api/student/exams').then((res) => res.data)
}

export function getStudentExam(id) {
  return api.get(`/api/student/exams/${id}`).then((res) => res.data)
}

export function studentGradeExam(examId, body) {
  return api.post(`/api/student/exams/${examId}/grade`, body).then((res) => res.data)
}

export function updateStudentPassword(old_password, new_password) {
  return api.put('/api/student/me/password', { old_password, new_password }).then((res) => res.data)
}

export function getStudentReportPdf() {
  return api.get('/api/student/report/pdf', { responseType: 'blob' }).then((res) => res.data)
}
