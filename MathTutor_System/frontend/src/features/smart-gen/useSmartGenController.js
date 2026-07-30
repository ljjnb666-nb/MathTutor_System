import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import { generateQuestions, generateExam, saveExam, getExams, updateExam, uploadRagDocument, verifyQuestion } from '../../services/api'
import { useSmartGen } from '../../contexts/SmartGenContext'
import { useStudent } from '../../contexts/StudentContext'
import { useSubscription } from '../../contexts/SubscriptionContext'

const DIFFICULTY_LABELS = {
  L1: 'L1 基础',
  L2: 'L2 简单',
  L3: 'L3 综合',
  L4: 'L4 较难',
  L5: 'L5 竞赛',
}

export function useSmartGenController() {
  const {
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
  } = useSmartGen()
  const { currentStudent } = useStudent()
  const { subscription } = useSubscription()
  const [regeneratingIndex, setRegeneratingIndex] = useState(null)
  const [expandedIndices, setExpandedIndices] = useState(new Set())
  const [showQuestionModal, setShowQuestionModal] = useState(false)
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(false)
  const [ragUploading, setRagUploading] = useState(false)
  const [pendingRefConfig, setPendingRefConfig] = useState(null)
  const [referenceQuestion, setReferenceQuestion] = useState(null)
  const [isGeneratingExam, setIsGeneratingExam] = useState(false)
  const [savingExam, setSavingExam] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [selectedPoints, setSelectedPoints] = useState([])
  const [addingToToday, setAddingToToday] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const ragFileInputRef = useRef(null)
  const autoGenerateRunRef = useRef(false)
  const weakPointAppliedRef = useRef(false)

  const handleUseKnowledgeBaseChange = useCallback(
    (next) => {
      if (next === true && !subscription?.plan?.features?.rag) {
        toast.error('本地知识库为基础版/专业版功能，请前往“套餐与定价”升级后使用')
        return
      }
      setUseKnowledgeBase(next)
    },
    [subscription?.plan?.features?.rag]
  )

  const handleAddPoint = useCallback((label) => {
    const trimmed = (label ?? '').trim()
    if (!trimmed) return
    setSelectedPoints((prev) => [...prev, trimmed])
  }, [])

  const handleRemovePoint = useCallback((index) => {
    setSelectedPoints((prev) => prev.filter((_, i) => i !== index))
  }, [])

  useEffect(() => {
    setParams((prev) => ({ ...prev, knowledge_point: selectedPoints.join(' + ') }))
  }, [selectedPoints, setParams])

  useEffect(() => {
    const prevBody = document.body.style.overflow
    const prevHtml = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevBody
      document.documentElement.style.overflow = prevHtml
    }
  }, [])

  const getDetailMessage = useCallback((err) => {
    const d = err.response?.data?.detail
    if (typeof d === 'string') return d
    if (Array.isArray(d) && d.length) return d.map((e) => e.msg || e.message || JSON.stringify(e)).join('；')
    return err.message || '生成题目失败，请检查网络或后端服务'
  }, [])

  const handleRagFileChange = useCallback(
    async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      e.target.value = ''
      setRagUploading(true)
      try {
        await uploadRagDocument(file)
        toast.success('知识库已更新')
      } catch (err) {
        const msg = err.response?.data?.detail ?? err.message
        toast.error(typeof msg === 'string' ? msg : '上传失败')
      } finally {
        setRagUploading(false)
      }
    },
    []
  )

  const handleFilterChange = useCallback((cfg) => {
    const newScenario = cfg.scenario ?? undefined
    setParams((prev) => ({
      ...prev,
      knowledge_point: cfg.knowledge_point ?? prev.knowledge_point,
      scenario: newScenario ?? prev.scenario,
      question_type: cfg.question_type ?? prev.question_type,
      difficulty: cfg.difficulty ? `L${cfg.difficulty}` : prev.difficulty,
      count: cfg.count ?? prev.count,
    }))
    if (newScenario && newScenario !== 'specialized' && newScenario !== 'error_analysis') {
      setReferenceQuestion(null)
    }
  }, [setParams])

  const handleGenerate = useCallback(
    async (cfg, refContent) => {
      if (!currentStudent) {
        toast.error('请先在左侧选择学生')
        return
      }
      const resolved = cfg ?? {}
      const finalKnowledgePoint = (
        selectedPoints.length > 0
          ? selectedPoints.join(' + ')
          : (resolved.knowledge_point ?? params.knowledge_point ?? '')
      ).trim()
      if (!finalKnowledgePoint) {
        toast.error('请选择或添加知识点')
        return
      }
      const difficulty = resolved.difficulty ?? params.difficulty
      const count = resolved.count ?? params.count
      const questionType = resolved.question_type ?? params.question_type
      const scenario = (resolved.scenario ?? params.scenario ?? 'default').trim() || 'default'

      setParams((prev) => ({ ...prev, knowledge_point: finalKnowledgePoint, scenario, difficulty, count, question_type: questionType }))
      setLoading(true)
      setQuestions([])
      setSyncResult(null)
      setLastError('')
      try {
        const payload = {
          knowledge_point: finalKnowledgePoint,
          scenario,
          difficulty,
          question_type: questionType ?? '综合',
          count,
        }
        if (refContent != null && String(refContent).trim()) payload.ref_content = String(refContent).trim()
        if (currentStudent?.id != null) payload.student_id = currentStudent.id
        if (useKnowledgeBase) payload.use_knowledge_base = true
        const res = await generateQuestions(payload)
        const data = res.data
        if (useKnowledgeBase && (res.headers || {})['x-rag-used'] !== 'true') {
          toast('本次未使用知识库（可能未命中）', { icon: 'ℹ️' })
        }

        if (data && typeof data === 'object' && !Array.isArray(data) && data.knowledge_card) {
          setSyncResult({
            knowledge_card: data.knowledge_card,
            examples: Array.isArray(data.examples) ? data.examples : [],
          })
          const rawList = Array.isArray(data.questions) ? data.questions : []
          const list = rawList.map((q) => ({
            ...q,
            knowledge_point: (q.knowledge_point && String(q.knowledge_point).trim()) || finalKnowledgePoint,
          }))
          setQuestions(list)
          setSavedIndices(new Set())
          setBatchSaved(false)
          if (list.length) toast.success(`已生成讲义与 ${list.length} 道练习题`)
          else toast.success('已生成同步辅导讲义')
          return
        }

        setSyncResult(null)
        const rawList = Array.isArray(data) ? data : []
        const list = rawList.map((q) => ({
          ...q,
          knowledge_point: (q.knowledge_point && String(q.knowledge_point).trim()) || finalKnowledgePoint,
        }))
        setQuestions(list)
        setSavedIndices(new Set())
        setBatchSaved(false)
        if (list.length) toast.success(`已生成 ${list.length} 道题目`)
        else toast.success('请求完成，暂无题目')
      } catch (err) {
        if (err.upgradeRequired) {
          toast.error(err.upgradeMessage || '启用知识库需升级套餐')
          navigate('/pricing')
          return
        }
        const message = getDetailMessage(err)
        setLastError(message)
        toast.error(message || '生成失败，请重试')
        setQuestions([])
        setSyncResult(null)
      } finally {
        setLoading(false)
      }
    },
    [
      currentStudent,
      getDetailMessage,
      navigate,
      params.count,
      params.difficulty,
      params.knowledge_point,
      params.question_type,
      params.scenario,
      selectedPoints,
      setBatchSaved,
      setLastError,
      setLoading,
      setParams,
      setQuestions,
      setSavedIndices,
      setSyncResult,
      useKnowledgeBase,
    ]
  )

  useEffect(() => {
    const state = location.state
    if (!state?.fromWeakPoint) {
      weakPointAppliedRef.current = false
      return
    }
    if (!Array.isArray(state.weakPointQuestions) || state.weakPointQuestions.length === 0 || weakPointAppliedRef.current) return
    weakPointAppliedRef.current = true
    const weakKp = (state.weakPointParams?.knowledge_point ?? '').trim() || '综合'
    const fixedList = state.weakPointQuestions.map((q) => ({
      ...q,
      knowledge_point: (q.knowledge_point && String(q.knowledge_point).trim()) || weakKp,
    }))
    setQuestions(fixedList)
    if (state.weakPointParams && typeof state.weakPointParams === 'object') {
      setParams((prev) => ({ ...prev, ...state.weakPointParams }))
    }
    setSavedIndices(new Set())
    setBatchSaved(false)
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.pathname, location.state, navigate, setBatchSaved, setParams, setQuestions, setSavedIndices])

  useEffect(() => {
    const state = location.state
    if (!state?.autoGenerate || autoGenerateRunRef.current || !currentStudent) return
    const kp = (state.knowledge_point ?? params.knowledge_point ?? '').trim()
    if (!kp) return

    autoGenerateRunRef.current = true
    const scenario = (state.scenario ?? params.scenario ?? '').trim() || 'default'
    const cfg = {
      knowledge_point: kp,
      scenario,
      difficulty: state.difficulty ?? params.difficulty,
      count: state.count ?? params.count,
      question_type: state.question_type ?? params.question_type,
    }
    navigate(location.pathname, { replace: true, state: {} })
    handleGenerate(cfg).catch(() => {})
  }, [currentStudent, handleGenerate, location.pathname, location.state, navigate, params.count, params.difficulty, params.knowledge_point, params.question_type, params.scenario])

  const handleGenerateClick = useCallback(
    (cfg) => {
      if (!currentStudent) {
        toast.error('请先在左侧选择学生')
        return
      }
      const scenario = cfg?.scenario ?? params.scenario ?? 'default'
      if (scenario === 'specialized' || scenario === 'error_analysis') {
        setPendingRefConfig(cfg ?? null)
        setShowQuestionModal(true)
        return
      }
      handleGenerate(cfg)
    },
    [currentStudent, handleGenerate, params.scenario]
  )

  const handleSelectReference = useCallback(
    (q) => {
      const newKp = (q?.knowledge_point && String(q.knowledge_point).trim()) || '系统自动分析考点'
      setReferenceQuestion(q)
      setParams((prev) => ({ ...prev, knowledge_point: newKp }))
      setShowQuestionModal(false)
      const refContent = q?.content ?? q?.body ?? ''
      const cfg = pendingRefConfig
        ? { ...pendingRefConfig, knowledge_point: newKp }
        : { knowledge_point: newKp }
      setPendingRefConfig(null)
      handleGenerate(cfg, refContent)
    },
    [handleGenerate, pendingRefConfig, setParams]
  )

  const handleUpdateQuestion = useCallback((index, newQuestionData) => {
    setQuestions((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], ...newQuestionData }
      return next
    })
  }, [setQuestions])

  const handleRegenerate = useCallback(
    async (index) => {
      const knowledgePoint = (params.knowledge_point || '').trim()
      if (!knowledgePoint) {
        toast.error('无法重新生成：当前无知识点')
        return
      }
      setRegeneratingIndex(index)
      try {
        const { data } = await generateQuestions({
          knowledge_point: knowledgePoint,
          scenario: params.scenario ?? 'default',
          difficulty: params.difficulty,
          question_type: params.question_type ?? '综合',
          count: 1,
        })
        const list = Array.isArray(data) ? data : []
        const newQ = list[0]
        if (!newQ) {
          toast.error('重新生成未返回题目，请重试')
          return
        }

        setQuestions((prev) => {
          const next = [...prev]
          const existing = next[index]
          const fixedKp = (existing?.knowledge_point && String(existing.knowledge_point).trim()) || (params.knowledge_point ?? '').trim()
          next[index] = {
            ...newQ,
            knowledge_point: (newQ.knowledge_point && String(newQ.knowledge_point).trim()) || fixedKp,
            difficulty: params.difficulty,
            question_type: params.question_type,
          }
          return next
        })
        setSavedIndices((prev) => {
          const next = new Set(prev)
          next.delete(index)
          return next
        })
        toast.success('已重新生成该题')
      } catch (err) {
        if (err.upgradeRequired) {
          toast.error(err.upgradeMessage || '该功能需升级套餐')
          navigate('/pricing')
          return
        }
        toast.error(getDetailMessage(err))
      } finally {
        setRegeneratingIndex(null)
      }
    },
    [getDetailMessage, navigate, params.difficulty, params.knowledge_point, params.question_type, params.scenario, setQuestions, setSavedIndices]
  )

  const handleGenerateExam = useCallback(async () => {
    if (!currentStudent) {
      toast.error('请先在左侧选择学生')
      return
    }
    const knowledgePoint = (params.knowledge_point ?? '').trim()
    if (!knowledgePoint) {
      toast.error('请选择知识点')
      return
    }
    setIsGeneratingExam(true)
    setLastError('')
    try {
      const res = await generateExam({
        knowledge_point: knowledgePoint,
        difficulty: params.difficulty ?? 'L3',
        student_id: currentStudent?.id,
        use_knowledge_base: useKnowledgeBase,
      })
      const data = res.data
      if (useKnowledgeBase && (res.headers || {})['x-rag-used'] !== 'true') {
        toast('本次未使用知识库（可能未命中）', { icon: 'ℹ️' })
      }
      const rawList = Array.isArray(data) ? data : []
      const list = rawList.map((q) => ({
        ...q,
        knowledge_point: (q.knowledge_point && String(q.knowledge_point).trim()) || knowledgePoint,
      }))
      setQuestions(list)
      setSavedIndices(new Set())
      setBatchSaved(false)
      toast.success(`试卷生成完毕，共 ${list.length} 道题`)
    } catch (err) {
      if (err.upgradeRequired) {
        toast.error(err.upgradeMessage || '启用知识库需升级套餐')
        navigate('/pricing')
        return
      }
      const message = getDetailMessage(err)
      setLastError(message)
      toast.error(message || '生成失败，请重试')
      setQuestions([])
    } finally {
      setIsGeneratingExam(false)
    }
  }, [currentStudent, getDetailMessage, navigate, params.difficulty, params.knowledge_point, setBatchSaved, setLastError, setQuestions, setSavedIndices, useKnowledgeBase])

  const handleSaveAsExam = useCallback(async () => {
    const hasQuestions = questions.length > 0
    const hasSyncResult = syncResult != null
    if (!hasQuestions && !hasSyncResult) return
    setSavingExam(true)
    try {
      const title =
        (params.knowledge_point || '试卷') +
        ' ' +
        new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
      const questionsSnapshot = questions.map((q) => ({
        content: q.content ?? '',
        options: Array.isArray(q.options) ? q.options : [],
        answer: q.answer ?? '',
        analysis: q.analysis ?? '',
        design_logic: q.design_logic ?? null,
        type_tag: q.type_tag ?? null,
        student_id: q.student_id ?? currentStudent?.id ?? null,
      }))
      const payload = {
        title,
        student_id: currentStudent?.id ?? null,
        questions: hasSyncResult
          ? { ...syncResult, questions: questionsSnapshot }
          : questionsSnapshot,
      }
      const { data } = await saveExam(payload)
      const examId = data?.id
      if (examId != null) {
        toast.success('试卷已保存')
        navigate(`/exams/${examId}`)
      } else {
        toast.error('保存成功但未返回试卷 ID')
      }
    } catch (err) {
      toast.error(getDetailMessage(err))
    } finally {
      setSavingExam(false)
    }
  }, [currentStudent, getDetailMessage, navigate, params.knowledge_point, questions, syncResult])

  const handleAddToTodayHomework = useCallback(async () => {
    if (questions.length === 0) {
      toast.error('请先生成题目后再加入今日作业')
      return
    }
    const today = new Date().toISOString().slice(0, 10)
    const questionsSnapshot = questions.map((q) => ({
      content: q.content ?? '',
      options: Array.isArray(q.options) ? q.options : [],
      answer: q.answer ?? '',
      analysis: q.analysis ?? '',
      knowledge_point: q.knowledge_point ?? params.knowledge_point ?? '综合',
      question_type: q.question_type ?? params.question_type ?? '综合',
      difficulty: q.difficulty ?? params.difficulty ?? 'L3',
    }))
    setAddingToToday(true)
    try {
      const res = await getExams({ assignment_date: today })
      const list = Array.isArray(res.data) ? res.data : []
      const draft = list.find((e) => e.student_id == null)
      const flat = draft?.questions
        ? Array.isArray(draft.questions)
          ? draft.questions
          : (draft.questions?.questions || [])
        : []
      if (draft) {
        await updateExam(draft.id, { questions: [...flat, ...questionsSnapshot] })
      } else {
        await saveExam({
          title: `${today} 作业`,
          student_id: null,
          questions: questionsSnapshot,
          assignment_date: today,
        })
      }
      toast.success('已加入今日作业', {
        duration: 4000,
        icon: '✅',
      })
    } catch (err) {
      toast.error(getDetailMessage(err) || '加入失败')
    } finally {
      setAddingToToday(false)
    }
  }, [getDetailMessage, params.difficulty, params.knowledge_point, params.question_type, questions])

  return {
    addingToToday,
    batchSaved,
    currentStudent,
    difficultyLabel: DIFFICULTY_LABELS[params.difficulty] ?? params.difficulty,
    expandedIndices,
    handleAddPoint,
    handleAddToTodayHomework,
    handleFilterChange,
    handleGenerate,
    handleGenerateClick,
    handleGenerateExam,
    handleRagFileChange,
    handleRegenerate,
    handleRemovePoint,
    handleSaveAsExam,
    handleSelectReference,
    handleUpdateQuestion,
    handleUseKnowledgeBaseChange,
    isGeneratingExam,
    lastError,
    loading,
    params,
    pendingRefConfig,
    questions,
    ragFileInputRef,
    ragUploading,
    referenceQuestion,
    regeneratingIndex,
    savedIndices,
    savingExam,
    selectedPoints,
    setExpandedIndices,
    setPendingRefConfig,
    setReferenceQuestion,
    setShowQuestionModal,
    showQuestionModal,
    syncResult,
    useKnowledgeBase,
    verifyQuestion,
  }
}
