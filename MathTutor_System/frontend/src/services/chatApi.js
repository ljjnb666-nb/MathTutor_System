import api, { apiBaseURL, buildAuthHeaders } from './httpClient'

const CHAT_TIMEOUT = 120000

function buildChatBody(params) {
  const body = {
    messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
  }
  if (params.session_id != null && Number.isFinite(params.session_id)) body.session_id = params.session_id
  if (params.student_id != null && Number.isFinite(params.student_id)) body.student_id = params.student_id
  if (params.knowledge_point != null && String(params.knowledge_point).trim()) {
    body.knowledge_point = String(params.knowledge_point).trim()
  }
  if (params.use_knowledge_base === true) body.use_knowledge_base = true
  if (params.context_question != null && String(params.context_question).trim()) {
    body.context_question = String(params.context_question).trim()
  }
  return body
}

export function chatWithAI(params) {
  return api.post('/api/chat', buildChatBody(params), { timeout: CHAT_TIMEOUT }).then((res) => res.data)
}

export function getChatSessions() {
  return api.get('/api/chat/sessions', { timeout: 15000 }).then((res) => res.data)
}

export function getChatSessionMessages(sessionId) {
  return api.get(`/api/chat/sessions/${sessionId}/messages`, { timeout: 15000 }).then((res) => res.data)
}

export function deleteChatSession(sessionId) {
  return api.delete(`/api/chat/sessions/${sessionId}`, { timeout: 15000 }).then((res) => res.data)
}

export function updateChatSessionPin(sessionId, pinned) {
  return api
    .patch(`/api/chat/sessions/${sessionId}`, { pinned }, { timeout: 15000 })
    .then((res) => res.data)
}

export function updateChatMessage(sessionId, messageId, content) {
  return api
    .patch(`/api/chat/sessions/${sessionId}/messages/${messageId}`, { content }, { timeout: 15000 })
    .then((res) => res.data)
}

export function chatWithAIStream(params, onChunk, onDone) {
  let doneCalled = false
  const finish = (payload) => {
    if (doneCalled) return
    doneCalled = true
    onDone?.(payload)
  }
  return fetch(`${apiBaseURL}/api/chat/stream`, {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify(buildChatBody(params)),
    signal: AbortSignal.timeout(CHAT_TIMEOUT),
  })
    .then(async (res) => {
      if (!res.ok) {
        const err = await parseStreamError(res)
        finish({ error: err })
        return
      }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const data = JSON.parse(line)
            if (data.content != null) onChunk?.(data.content)
            if (data.done === true) finish(data)
            if (data.error) finish({ error: data.error })
          } catch (_) {}
        }
      }
      if (buf.trim()) {
        try {
          const data = JSON.parse(buf)
          if (data.content != null) onChunk?.(data.content)
          if (data.done === true) finish(data)
        } catch (_) {}
      }
    })
    .catch((err) => {
      finish({ error: err.message || '请求失败' })
    })
}

async function parseStreamError(res) {
  const fallback = `${res.status} ${res.statusText || '请求失败'}`.trim()
  try {
    const data = await res.clone().json()
    if (typeof data?.detail === 'string') return `${data.detail}（HTTP ${res.status}）`
    if (typeof data?.message === 'string') return `${data.message}（HTTP ${res.status}）`
  } catch (_) {}
  try {
    const text = await res.text()
    const trimmed = String(text || '').trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return fallback
    return trimmed || fallback
  } catch (_) {
    return fallback
  }
}
