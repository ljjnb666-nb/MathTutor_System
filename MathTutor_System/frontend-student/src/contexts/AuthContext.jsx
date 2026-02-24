import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { studentLogin as apiLogin, getStudentMe, AUTH_TOKEN_KEY } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [student, setStudent] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadMe = useCallback(async () => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY)
    if (!token) {
      setStudent(null)
      setLoading(false)
      return
    }
    try {
      const me = await getStudentMe()
      setStudent(me)
    } catch {
      localStorage.removeItem(AUTH_TOKEN_KEY)
      setStudent(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMe()
  }, [loadMe])

  const login = useCallback(async (loginCode, password = null) => {
    const data = await apiLogin(loginCode, password || undefined)
    localStorage.setItem(AUTH_TOKEN_KEY, data.access_token)
    const me = await getStudentMe()
    setStudent(me)
    return me
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY)
    setStudent(null)
  }, [])

  return (
    <AuthContext.Provider value={{ student, loading, login, logout, refreshMe: loadMe }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
