import api from './httpClient'

const PPT_GENERATE_TIMEOUT = 120000
const LLM_KEY_TEST_TIMEOUT = 30000

function buildLlmConfigHeaders(config) {
  const headers = {}
  if (config.provider) headers['x-llm-provider'] = config.provider
  if (config.apiKey) headers['x-llm-api-key'] = config.apiKey
  if (config.baseUrl) headers['x-llm-base-url'] = config.baseUrl
  if (config.model) headers['x-llm-model'] = config.model
  return headers
}

export function testLlmApiKey(config) {
  const body = {
    provider: config.provider || '',
    api_key: config.apiKey || '',
    base_url: config.baseUrl || '',
    model: config.model || '',
  }
  return api
    .post('/api/tools/test-llm-key', body, {
      skipStoredLlmHeaders: true,
      timeout: LLM_KEY_TEST_TIMEOUT,
    })
    .then((res) => res.data)
}

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
