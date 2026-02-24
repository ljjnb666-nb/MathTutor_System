import axios from 'axios'

export const AUTH_TOKEN_KEY = 'math_tutor_student_token'

const baseURL =
  typeof import.meta !== 'undefined' && import.meta.env?.DEV
    ? ''
    : (import.meta.env?.VITE_API_BASE_URL || '')

const api = axios.create({
  baseURL,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof localStorage !== 'undefined') {
      localStorage.removeItem(AUTH_TOKEN_KEY)
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.assign('/login')
      }
    }
    return Promise.reject(err)
  }
)

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
