import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getStudents } from '../services/api'
import { useAuth } from './AuthContext'

const STORAGE_KEY = 'math_tutor_current_student_id'

const StudentContext = createContext(null)

export function StudentProvider({ children }) {
  const { isAuthenticated } = useAuth()
  const [currentStudent, setCurrentStudent] = useState(null)
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(false)

  const refreshStudents = useCallback(async () => {
    if (!isAuthenticated) return
    setLoading(true)
    try {
      const res = await getStudents()
      const list = Array.isArray(res.data) ? res.data : []
      setStudents(list)
      const savedId = localStorage.getItem(STORAGE_KEY)
      if (savedId) {
        const id = parseInt(savedId, 10)
        if (Number.isFinite(id)) {
          const found = list.find((s) => s.id === id)
          setCurrentStudent(found ? { id: found.id, name: found.name, tags: found.tags ?? [] } : null)
          return
        }
        localStorage.removeItem(STORAGE_KEY)
        setCurrentStudent(null)
        return
      }
      setCurrentStudent((prev) => {
        if (!prev) return null
        const found = list.find((s) => s.id === prev.id)
        return found ? { id: found.id, name: found.name, tags: found.tags ?? [] } : null
      })
    } catch (_) {
      setStudents([])
      setCurrentStudent(null)
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  const selectStudent = useCallback((studentId) => {
    if (studentId == null) {
      setCurrentStudent(null)
      localStorage.removeItem(STORAGE_KEY)
      return
    }
    setStudents((list) => {
      const found = list.find((s) => s.id === studentId)
      if (found) {
        localStorage.setItem(STORAGE_KEY, String(studentId))
        setCurrentStudent({ id: found.id, name: found.name, tags: found.tags ?? [] })
      }
      return list
    })
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      setStudents([])
      setCurrentStudent(null)
      return
    }
    refreshStudents()
  }, [isAuthenticated, refreshStudents])

  const value = {
    currentStudent,
    students,
    loading,
    selectStudent,
    refreshStudents,
  }

  return <StudentContext.Provider value={value}>{children}</StudentContext.Provider>
}

export function useStudent() {
  const ctx = useContext(StudentContext)
  if (!ctx) {
    throw new Error('useStudent must be used within StudentProvider')
  }
  return ctx
}
