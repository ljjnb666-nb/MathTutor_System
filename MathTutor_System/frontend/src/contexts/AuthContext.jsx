import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { loginApi, getMe, AUTH_TOKEN_KEY } from '../services/api'

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [restoring, setRestoring] = useState(true)

  const login = useCallback(async (username, password) => {
    const data = await loginApi(username, password)
    const accessToken = data?.access_token
    if (!accessToken) throw new Error('登录失败：未返回 Token')
    localStorage.setItem(AUTH_TOKEN_KEY, accessToken)
    setToken(accessToken)
    const me = await getMe()
    setUser(me)
    setIsAuthenticated(true)
    return me
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY)
    setToken(null)
    setUser(null)
    setIsAuthenticated(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    const stored = localStorage.getItem(AUTH_TOKEN_KEY)
    if (!stored) {
      setRestoring(false)
      return
    }
    setToken(stored)
    getMe()
      .then((me) => {
        if (!cancelled) {
          setUser(me)
          setIsAuthenticated(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          localStorage.removeItem(AUTH_TOKEN_KEY)
          setToken(null)
          setUser(null)
          setIsAuthenticated(false)
        }
      })
      .finally(() => {
        if (!cancelled) setRestoring(false)
      })
    return () => { cancelled = true }
  }, [])

  const value = {
    user,
    token,
    isAuthenticated,
    restoring,
    login,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
