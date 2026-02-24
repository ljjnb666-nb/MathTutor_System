import { createContext, useContext, useState, useEffect, useRef } from 'react'

const STORAGE_KEY = 'math_tutor_smartgen'

const defaultParams = {
  knowledge_point: '勾股定理',
  scenario: 'default',
  difficulty: 'L2',
  question_type: '综合',
  count: 3,
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    return {
      questions: Array.isArray(data.questions) ? data.questions : [],
      params: data.params && typeof data.params === 'object' ? { ...defaultParams, ...data.params } : defaultParams,
      savedIndices: new Set(Array.isArray(data.savedIndices) ? data.savedIndices : []),
      batchSaved: !!data.batchSaved,
    }
  } catch {
    return null
  }
}

function saveToStorage(questions, params, savedIndices, batchSaved) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        questions,
        params,
        savedIndices: Array.from(savedIndices || []),
        batchSaved: !!batchSaved,
      })
    )
  } catch (_) {}
}

const SmartGenContext = createContext(null)

export function SmartGenProvider({ children }) {
  const initial = useRef(null)
  if (initial.current === null) initial.current = loadFromStorage()

  const [questions, setQuestions] = useState(() => initial.current?.questions ?? [])
  const [params, setParams] = useState(() => initial.current?.params ?? defaultParams)
  const [lastError, setLastError] = useState('')
  const [savedIndices, setSavedIndices] = useState(() => initial.current?.savedIndices ?? new Set())
  const [batchSaved, setBatchSaved] = useState(() => initial.current?.batchSaved ?? false)
  /** 生成中状态放在 Context，切换页面再回来仍能显示“生成中”或已生成结果，不会被打断 */
  const [loading, setLoading] = useState(false)

  /** 持久化：刷新页面后仍保留已生成的题目与筛选参数 */
  useEffect(() => {
    saveToStorage(questions, params, savedIndices, batchSaved)
  }, [questions, params, savedIndices, batchSaved])

  const value = {
    questions,
    setQuestions,
    params,
    setParams,
    lastError,
    setLastError,
    savedIndices,
    setSavedIndices,
    batchSaved,
    setBatchSaved,
    loading,
    setLoading,
  }

  return <SmartGenContext.Provider value={value}>{children}</SmartGenContext.Provider>
}

export function useSmartGen() {
  const ctx = useContext(SmartGenContext)
  if (!ctx) {
    throw new Error('useSmartGen must be used within SmartGenProvider')
  }
  return ctx
}
