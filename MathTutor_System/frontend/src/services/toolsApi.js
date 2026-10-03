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
      // RFC 5987：中文文件名通过 filename*=UTF-8'' 传递，filename= 是 ASCII 兜底。
      const starMatch = disposition.match(/filename\*=(?:UTF-8'')?([^;]+)/i)
      const plainMatch = disposition.match(/filename="?([^";]+)"?/i)
      let filename = (starMatch || plainMatch)?.[1]?.trim() || 'Lesson.pptx'
      if (starMatch) {
        try {
          filename = decodeURIComponent(filename)
        } catch {
          // 保留原样，不因畸形编码中断下载。
        }
      }
      return { blob, filename }
    })
}
