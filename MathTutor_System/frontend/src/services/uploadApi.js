import api from './httpClient'

const PARSE_WORD_TIMEOUT = 180000
const GENERATE_ANALYSIS_TIMEOUT = 300000

export function parseWordExam(file) {
  const form = new FormData()
  form.append('file', file)
  return api.post('/api/upload/parse/word', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: PARSE_WORD_TIMEOUT,
  }).then((res) => res.data)
}

export function generateAnalysisForQuestions(body) {
  return api.post('/api/upload/generate-analysis', body, {
    timeout: GENERATE_ANALYSIS_TIMEOUT,
  }).then((res) => res.data)
}
