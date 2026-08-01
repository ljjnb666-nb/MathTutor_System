import api from './httpClient'

export function testLlmConnection(headers = {}) {
  return api.post('/api/llm/test', {}, { headers, timeout: 45000 }).then((res) => res.data)
}
