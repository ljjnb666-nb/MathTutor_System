import api from './httpClient'

export function getPlans() {
  return api.get('/api/plans/', { timeout: 10000 }).then((res) => res.data)
}

export function getSubscriptionMe() {
  return api.get('/api/subscription/me', { timeout: 10000 }).then((res) => res.data)
}

export function getPaymentConfig() {
  return api.get('/api/payment/config', { timeout: 5000 }).then((res) => res.data)
}

export function createOrder(body) {
  return api.post('/api/orders', body, { timeout: 15000 }).then((res) => res.data)
}

export function getOrderStatus(outTradeNo) {
  return api.get(`/api/orders/${encodeURIComponent(outTradeNo)}/status`, { timeout: 5000 }).then((res) => res.data)
}
