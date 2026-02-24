import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from './AuthContext'
import { getSubscriptionMe } from '../services/api'

export const SubscriptionContext = createContext(null)

export function SubscriptionProvider({ children }) {
  const { user } = useAuth()
  const [subscription, setSubscription] = useState(null)
  const [loading, setLoading] = useState(false)

  const refreshSubscription = useCallback(async () => {
    if (!user) {
      setSubscription(null)
      return
    }
    setLoading(true)
    try {
      const data = await getSubscriptionMe()
      setSubscription(data)
    } catch {
      setSubscription(null)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!user) {
      setSubscription(null)
      return
    }
    refreshSubscription()
  }, [user, refreshSubscription])

  const value = {
    subscription,
    loading,
    refreshSubscription,
    atStudentLimit: subscription
      ? subscription.student_count >= subscription.max_students
      : false,
  }

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  )
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext)
  if (!ctx) throw new Error('useSubscription must be used within SubscriptionProvider')
  return ctx
}
