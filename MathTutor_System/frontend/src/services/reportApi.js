import api from './httpClient'

const AFTER_CLASS_COMMENT_TIMEOUT = 120000

export function generateAfterClassComment(params) {
  const body = {
    focus_level: Math.min(5, Math.max(1, Number(params.focus_level) || 3)),
    mastery_level: Math.min(5, Math.max(1, Number(params.mastery_level) || 3)),
    keywords: Array.isArray(params.keywords)
      ? params.keywords.slice(0, 4).map((k) => String(k || '').trim()).filter(Boolean)
      : [],
  }
  if (params.student_name != null && String(params.student_name).trim()) {
    body.student_name = String(params.student_name).trim()
  }
  if (params.draft != null && String(params.draft).trim()) {
    body.draft = String(params.draft).trim().slice(0, 2000)
  }
  if (params.template != null && String(params.template).trim()) {
    body.template = String(params.template).trim().slice(0, 3000)
  }
  return api
    .post('/api/reports/after-class', body, { timeout: AFTER_CLASS_COMMENT_TIMEOUT })
    .then((res) => res.data)
}

export function parseLearningReportDraft(params) {
  const draft = (params.draft || '').trim()
  if (!draft) return Promise.reject(new Error('请提供学情描述'))
  return api
    .post('/api/reports/learning-visual', { draft }, { timeout: 120000 })
    .then((res) => res.data)
}
