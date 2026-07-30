import api from './httpClient'

export function uploadRagDocument(file, options = {}) {
  const form = new FormData()
  form.append('file', file)
  if (options.knowledge_point != null && String(options.knowledge_point).trim()) {
    form.append('knowledge_point', String(options.knowledge_point).trim())
  }
  if (options.chunk_type != null && String(options.chunk_type).trim()) {
    form.append('chunk_type', String(options.chunk_type).trim())
  }
  return api.post('/api/rag/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  })
}

export function uploadRagDocumentAsync(file, options = {}) {
  const form = new FormData()
  form.append('file', file)
  if (options.knowledge_point != null && String(options.knowledge_point).trim()) {
    form.append('knowledge_point', String(options.knowledge_point).trim())
  }
  if (options.chunk_type != null && String(options.chunk_type).trim()) {
    form.append('chunk_type', String(options.chunk_type).trim())
  }
  return api.post('/api/rag/upload/async', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30000,
    validateStatus: (s) => s === 202 || s >= 400,
  }).then((res) => {
    if (res.status === 202) return res.data
    throw res
  })
}

export function getRagUploadStatus(taskId) {
  return api.get(`/api/rag/upload/status/${taskId}`).then((res) => res.data)
}

export function checkBackendHealth() {
  return api.get('/api/health', { timeout: 4000 }).then((res) => res.data)
}

export function listRagDocuments() {
  return api.get('/api/rag/documents').then((res) => res.data)
}

export function getRagDocumentChunks(source) {
  return api.get('/api/rag/documents/chunks', { params: { source } }).then((res) => res.data)
}

export function deleteRagDocument(source) {
  return api.delete('/api/rag/documents/' + encodeURIComponent(source)).then((res) => res.data)
}
