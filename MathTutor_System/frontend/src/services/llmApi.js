import api from './httpClient'

export async function getLlmStatus() {
  const { data } = await api.get('/api/llm/status')
  return data
}

export async function testLlmConnection(headers = {}) {
  const { data } = await api.post('/api/llm/test', {}, { headers })
  return data
}
