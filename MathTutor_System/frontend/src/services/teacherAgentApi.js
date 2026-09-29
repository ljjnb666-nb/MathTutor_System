import api from './httpClient'

export function createTeacherAgentRun(payload) {
  return api.post('/api/teacher-agent/runs', payload)
}

export function getTeacherAgentRuns(limit = 20) {
  return api.get('/api/teacher-agent/runs', { params: { limit } })
}

export function getTeacherAgentRun(runId) {
  return api.get(`/api/teacher-agent/runs/${runId}`)
}

export function getTeacherAgentRunArtifacts(runId, artifactType = 'practice_set') {
  return api.get(`/api/teacher-agent/runs/${runId}/artifacts`, { params: { artifact_type: artifactType } })
}

export function createPracticeDraft(runId, payload) {
  return api.post(`/api/teacher-agent/runs/${runId}/artifacts/practice-set`, payload)
}

export function getPracticeArtifact(artifactId) {
  return api.get(`/api/teacher-agent/artifacts/${artifactId}`)
}

export function getPracticeArtifactActions(artifactId) {
  return api.get(`/api/teacher-agent/artifacts/${artifactId}/actions`)
}

export function updatePracticeArtifact(artifactId, payload) {
  return api.patch(`/api/teacher-agent/artifacts/${artifactId}`, payload)
}

export function preparePracticeSave(artifactId) {
  return api.post(`/api/teacher-agent/artifacts/${artifactId}/prepare-save`)
}

export function confirmPracticeAction(actionId, payload) {
  return api.post(`/api/teacher-agent/actions/${actionId}/confirm`, payload)
}

export function cancelPracticeAction(actionId) {
  return api.post(`/api/teacher-agent/actions/${actionId}/cancel`)
}

export function getPracticeAction(actionId) {
  return api.get(`/api/teacher-agent/actions/${actionId}`)
}
