import api from './httpClient'

const PPT_GENERATE_TIMEOUT = 120000

export function generatePPT(params) {
  const body = { topic: (params.topic || '').trim(), grade: params.grade || 'Middle' }
  return api
    .post('/api/tools/generate-ppt', body, { timeout: PPT_GENERATE_TIMEOUT })
    .then((res) => res.data)
}

export function buildPPTFile(content) {
  return api
    .post('/api/tools/build-pptx', content, {
      responseType: 'blob',
      timeout: 60000,
    })
    .then((res) => {
      const blob = res.data
      const disposition = res.headers?.['content-disposition'] || ''
      const match = disposition.match(/filename="?([^";]+)"?/i)
      const filename = match ? match[1].trim() : 'Lesson.pptx'
      return { blob, filename }
    })
}
