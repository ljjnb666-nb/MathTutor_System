import api from './httpClient'

export function loginApi(username, password) {
  const params = new URLSearchParams()
  params.append('username', username)
  params.append('password', password)
  return api
    .post('/api/token', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 60000,
    })
    .then((res) => res.data)
}

export function getMe() {
  return api.get('/api/users/me', { timeout: 30000 }).then((res) => res.data)
}

export function listUsers() {
  return api.get('/api/users/', { timeout: 10000 }).then((res) => res.data)
}

export function createUser(body) {
  return api.post('/api/users/', body, { timeout: 10000 }).then((res) => res.data)
}

export function deleteUser(id) {
  return api.delete(`/api/users/${id}`, { timeout: 10000 })
}

export function setUserSubscription(userId, body) {
  return api.put(`/api/users/${userId}/subscription`, body, { timeout: 10000 }).then((res) => res.data)
}

export function batchSetSubscription(body) {
  return api.post('/api/users/batch-subscription', body, { timeout: 15000 }).then((res) => res.data)
}

export function getUserSubscriptionHistory(userId) {
  return api.get(`/api/users/${userId}/subscription-history`, { timeout: 10000 }).then((res) => res.data)
}
