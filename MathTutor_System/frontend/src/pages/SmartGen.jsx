import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Loader2, Save, Copy, FileText, Download, Upload, Sparkles, CalendarPlus } from 'lucide-react'
import toast from 'react-hot-toast'
import { generateQuestions, generateExam, saveExam, getExams, updateExam, uploadRagDocument, verifyQuestion } from '../services/api'
import { useSmartGen } from '../contexts/SmartGenContext'
import { useStudent } from '../contexts/StudentContext'
import { useSubscription } from '../contexts/SubscriptionContext'
import FilterPanel from '../components/FilterPanel'
import QuestionCard from '../components/QuestionCard'
import KnowledgeCard from '../components/KnowledgeCard'
import ExampleList from '../components/ExampleList'
import QuestionSelectModal from '../components/QuestionSelectModal'
import 'katex/dist/katex.min.css'

const DIFFICULTY_LABELS = {
  L1: 'L1 基础',
  L2: 'L2 简单',
  L3: 'L3 综合',
  L4: 'L4 较难',
  L5: 'L5 竞赛',
}

export default function SmartGen() {
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

  /** 打开「启用本地知识库」时：免费用户直接提示需升级，不切换开关 */
  const handleUseKnowledgeBaseChange = useCallback(
    (next) => {
      if (next === true && !subscription?.plan?.features?.rag) {
        toast.error('本地知识库为基础版/专业版功能，请前往「套餐与定价」升级后使用')
        return
      }
      setUseKnowledgeBase(next)
    },
    [subscription?.plan?.features?.rag]
  )
  const [ragUploading, setRagUploading] = useState(false)
  /** 专项突破/错题分析：点击「生成」时锁定的左侧配置，选参考题后用此配置请求，保证题型/难度/数量一致 */
  const [pendingRefConfig, setPendingRefConfig] = useState(null)
  const [referenceQuestion, setReferenceQuestion] = useState(null)
  const [isGeneratingExam, setIsGeneratingExam] = useState(false)
  const [savingExam, setSavingExam] = useState(false)
  /** 同步辅导 (讲练结合) 返回：knowledge_card + examples + questions */
  const [syncResult, setSyncResult] = useState(null)
  /** 多知识点：数组，用于综合考察多个小节（如 17.1 勾股定理 + 18.2 平行四边形） */
  const [selectedPoints, setSelectedPoints] = useState([])
  const navigate = useNavigate()
  const location = useLocation()
  const ragFileInputRef = useRef(null)
  const autoGenerateRunRef = useRef(false)
  const weakPointAppliedRef = useRef(false)

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
  }, [selectedPoints])

  // 智能出题页锁定整页滚动，仅左右列内滚动
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

  const handleRagFileChange = useCallback(async (e) => {
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
  }, [])

  const getDetailMessage = (err) => {
    const d = err.response?.data?.detail
    if (typeof d === 'string') return d
    if (Array.isArray(d) && d.length) return d.map((e) => e.msg || e.message || JSON.stringify(e)).join('；')
    return err.message || '生成题目失败，请检查网络或后端服务'
  }

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
    // 切换到非「专项突破/错题分析」时清除参考题，解除知识点锁定
    if (newScenario && newScenario !== 'specialized' && newScenario !== 'error_analysis') {
      setReferenceQuestion(null)
    }
  }, [])

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
      const question_type = resolved.question_type ?? params.question_type
      const scenario = (resolved.scenario ?? params.scenario ?? 'default').trim() || 'default'

      setParams((prev) => ({ ...prev, knowledge_point: finalKnowledgePoint, scenario, difficulty, count, question_type }))
      setLoading(true)
      setQuestions([])
      setSyncResult(null)
      setLastError('')
      try {
        const payload = {
          knowledge_point: finalKnowledgePoint,
          scenario,
          difficulty,
          question_type: question_type ?? '综合',
          count,
        }
        if (refContent != null && String(refContent).trim()) payload.ref_content = String(refContent).trim()
        if (currentStudent?.id != null) payload.student_id = currentStudent.id
        if (useKnowledgeBase) payload.use_knowledge_base = true
        const res = await generateQuestions(payload)
        const data = res.data
        if (useKnowledgeBase && (res.headers || {})['x-rag-used'] !== 'true')
          toast('本次未使用知识库（可能未命中）', { icon: 'ℹ️' })
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
        } else {
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
        }
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
    [selectedPoints, params.knowledge_point, params.scenario, params.difficulty, params.question_type, params.count, currentStudent, useKnowledgeBase, setLoading, setQuestions, setSyncResult, setLastError, setSavedIndices, setBatchSaved, setParams, navigate]
  )

  // 路由跳转携带 fromWeakPoint + weakPointQuestions 时，直接应用题目到 context（学情图谱「按弱项一键出题」）
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
  }, [location.state, location.pathname, navigate, setQuestions, setParams, setSavedIndices, setBatchSaved])

  // 路由跳转携带 autoGenerate 时自动触发生成（如学情图谱「生成强化题」）；确保 scenario 为空时默认为 default，并有错误处理
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
  }, [location.state, location.pathname, currentStudent, navigate, handleGenerate, params.knowledge_point, params.scenario, params.difficulty, params.count, params.question_type])

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
    [params.scenario, handleGenerate, currentStudent]
  )

  const handleSelectReference = useCallback(
    (q) => {
      const newKp = (q?.knowledge_point && String(q.knowledge_point).trim()) || '系统自动分析考点'
      setReferenceQuestion(q)
      setParams((prev) => ({ ...prev, knowledge_point: newKp }))
      setShowQuestionModal(false)
      const refContent = q?.content ?? q?.body ?? ''
      // 使用点击「生成」时锁定的左侧配置，确保题型/难度/数量与左侧一致
      const cfg = pendingRefConfig
        ? { ...pendingRefConfig, knowledge_point: newKp }
        : { knowledge_point: newKp }
      setPendingRefConfig(null)
      handleGenerate(cfg, refContent)
    },
    [handleGenerate, setParams, pendingRefConfig]
  )

  const difficultyLabel = DIFFICULTY_LABELS[params.difficulty] ?? params.difficulty

  const toQuestionPayload = (q) => ({
    content: q.content ?? q.body ?? '',
    options: q.options ?? [],
    answer: q.answer ?? '',
    analysis: q.analysis ?? '',
    knowledge_point: (q.knowledge_point ?? params.knowledge_point ?? '').trim() || '综合',
    difficulty: (q.difficulty ?? params.difficulty) ?? 'L2',
    question_type: (q.question_type ?? params.question_type) ?? '选择',
    source: 'AI生成',
    ...(currentStudent?.id != null && { student_id: currentStudent.id }),
  })

  const handleUpdateQuestion = useCallback((index, newQuestionData) => {
    setQuestions((prev) => {
      const next = [...prev]
      const existing = next[index]
      next[index] = { ...existing, ...newQuestionData }
      return next
    })
  }, [])

  const handleRegenerate = useCallback(
    async (index) => {
      const knowledge_point = (params.knowledge_point || '').trim()
      if (!knowledge_point) {
        toast.error('无法重新生成：当前无知识点')
        return
      }
      setRegeneratingIndex(index)
      try {
        const { data } = await generateQuestions({
          knowledge_point,
          scenario: params.scenario ?? 'default',
          difficulty: params.difficulty,
          question_type: params.question_type ?? '综合',
          count: 1,
        })
        const list = Array.isArray(data) ? data : []
        const newQ = list[0]
        if (newQ) {
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
        } else {
          toast.error('重新生成未返回题目，请重试')
        }
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
    [params.knowledge_point, params.scenario, params.difficulty, params.question_type, navigate]
  )

  const handleGenerateExam = useCallback(async () => {
    if (!currentStudent) {
      toast.error('请先在左侧选择学生')
      return
    }
    const knowledge_point = (params.knowledge_point ?? '').trim()
    if (!knowledge_point) {
      toast.error('请选择知识点')
      return
    }
    setIsGeneratingExam(true)
    setLastError('')
    try {
      const res = await generateExam({
        knowledge_point,
        difficulty: params.difficulty ?? 'L3',
        student_id: currentStudent?.id,
        use_knowledge_base: useKnowledgeBase,
      })
      const data = res.data
      if (useKnowledgeBase && (res.headers || {})['x-rag-used'] !== 'true')
        toast('本次未使用知识库（可能未命中）', { icon: 'ℹ️' })
      const rawList = Array.isArray(data) ? data : []
      const list = rawList.map((q) => ({
        ...q,
        knowledge_point: (q.knowledge_point && String(q.knowledge_point).trim()) || knowledge_point,
      }))
      setQuestions(list)
      setSavedIndices(new Set())
      setBatchSaved(false)
      toast.success(`试卷生成完毕！共 ${list.length} 道题`)
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
  }, [params.knowledge_point, params.difficulty, currentStudent, useKnowledgeBase, setQuestions, setSavedIndices, setBatchSaved, setLastError, navigate])

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
  }, [questions, params.knowledge_point, currentStudent, navigate, syncResult])

  const [addingToToday, setAddingToToday] = useState(false)
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
  }, [questions, params.knowledge_point, params.question_type, params.difficulty])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="mb-3 shrink-0 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-4">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-gray-800">智能出题</h1>
          <p className="mt-0.5 text-xs sm:text-sm text-gray-500">设置知识点与难度，一键生成数学题</p>
        </div>
      </header>

      {/* 移动端：单列整体滚动，配置区在上、题目区在下；桌面端：左右两列各自滚动 */}
      <div
        className="flex flex-col md:flex-row min-h-0 min-w-0 flex-1 overflow-y-auto md:overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
        onWheel={(e) => e.stopPropagation()}
      >
        {/* 出题配置：移动端整块展示无高度限制，桌面端左侧固定宽且内部滚动 */}
        <aside className="w-full md:w-80 shrink-0 max-h-none md:h-full md:min-h-0 overflow-visible md:overflow-y-auto overflow-x-hidden bg-gray-50/80 md:overscroll-contain border-b md:border-b-0 md:border-r border-gray-200 rounded-t-xl md:rounded-t-none md:rounded-l-xl pb-6 md:pb-0">
          <FilterPanel
            onFilterChange={handleFilterChange}
            onGenerate={handleGenerateClick}
            loading={loading}
            onGenerateExam={handleGenerateExam}
            isGeneratingExam={isGeneratingExam}
            referenceQuestion={params.scenario === 'specialized' || params.scenario === 'error_analysis' ? referenceQuestion : null}
            onClearReference={() => setReferenceQuestion(null)}
            onOpenSelectModal={() => setShowQuestionModal(true)}
            disableKnowledgePoint={!!referenceQuestion && (params.scenario === 'specialized' || params.scenario === 'error_analysis')}
            lockedKnowledgePointLabel={referenceQuestion && (params.scenario === 'specialized' || params.scenario === 'error_analysis') ? params.knowledge_point : ''}
            useKnowledgeBase={useKnowledgeBase}
            onUseKnowledgeBaseChange={handleUseKnowledgeBaseChange}
            knowledgePointFromParent={params.knowledge_point ?? ''}
            selectedPoints={selectedPoints}
            onAddPoint={handleAddPoint}
            onRemovePoint={handleRemovePoint}
          />
        </aside>

        <QuestionSelectModal
          open={showQuestionModal}
          onClose={() => {
            setShowQuestionModal(false)
            setPendingRefConfig(null)
          }}
          onSelect={handleSelectReference}
        />

        {/* 右侧题目区：移动端随内容高度、整页一起滚动；桌面端独立滚动 */}
        <main className="min-h-0 min-w-0 flex-none md:flex-1 overflow-visible md:overflow-y-auto overflow-x-hidden bg-gray-50 md:overscroll-contain rounded-b-xl md:rounded-b-none md:rounded-r-xl">
          <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col px-4 sm:px-6 py-4 sm:py-5">
            {/* 工具栏：当前学生 + 上传资料 */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white px-4 py-3 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 min-w-0">
                {currentStudent ? (
                  <span className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1.5 text-sm font-medium text-indigo-700 ring-1 ring-indigo-200/60">
                    正在为 <span className="font-semibold ml-1">{currentStudent.name}</span> 生成题目
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1.5 text-sm text-amber-700 ring-1 ring-amber-200/60">
                    <span className="md:hidden">请先选择学生</span>
                    <span className="hidden md:inline">请先在左侧选择学生</span>
                  </span>
                )}
              </div>
              <input
                type="file"
                ref={ragFileInputRef}
                accept=".pdf,.docx"
                className="hidden"
                onChange={handleRagFileChange}
              />
              <button
                type="button"
                disabled={ragUploading}
                onClick={() => ragFileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 hover:border-gray-300 active:scale-[0.98] disabled:opacity-50 transition-all"
              >
                {ragUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                上传资料
              </button>
            </div>
            {/* 仅在有错误且无题目时显示 */}
            {!loading && lastError && questions.length === 0 && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800">
                <span className="font-medium">知识点：</span>
                <span>{params.knowledge_point || '—'}</span>
              </div>
            )}

            {loading && (
              <div className="flex flex-1 flex-col items-center justify-center py-24">
                <div className="relative">
                  <Loader2 className="h-14 w-14 animate-spin text-blue-600" />
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-blue-600/80">AI</span>
                </div>
                <p className="mt-5 text-sm font-medium text-gray-700">
                  {params.count > 1 ? `正在生成 ${params.count} 道题…` : 'AI 正在思考中…'}
                </p>
                <p className="mt-1 text-xs text-gray-500">生成完成后题目将显示在下方</p>
              </div>
            )}

            {!loading && questions.length === 0 && !syncResult?.knowledge_card && (
              <div className="flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gradient-to-b from-blue-50/50 to-white py-20 px-8 text-center">
                {lastError ? (
                  <>
                    <p className="text-sm font-medium text-amber-800">{lastError}</p>
                    <p className="mt-3 text-xs text-gray-500 max-w-sm">
                      {lastError.includes('API Key') || lastError.includes('未配置')
                        ? '请打开左上角菜单，在侧栏底部点击「设置」并填写 API Key 后保存，再重新生成。'
                        : '请检查网络或后端服务后重试。'}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleGenerate()}
                      className="mt-5 inline-flex items-center gap-2 rounded-lg bg-amber-100 px-4 py-2.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-200 active:scale-[0.98]"
                    >
                      重试
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-600 mb-4">
                      <Sparkles className="h-7 w-7" />
                    </div>
                    <p className="text-base font-medium text-gray-700">在上方设置题型、难度与数量</p>
                    <p className="mt-1 text-sm text-gray-500">点击「生成练习题」即可生成题目</p>
                  </>
                )}
              </div>
            )}

            {!loading && (questions.length > 0 || syncResult?.knowledge_card) && (
              <>
                {syncResult?.knowledge_card && (
                  <div className="mb-6">
                    <KnowledgeCard data={syncResult.knowledge_card} />
                  </div>
                )}
                {syncResult?.examples?.length > 0 && (
                  <div className="mb-6">
                    <ExampleList data={syncResult.examples} />
                  </div>
                )}

                {/* 试卷头 + 操作栏（仅当有练习题时显示） */}
                {questions.length > 0 && (
                <div className="mb-6 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-800">
                        8年级上册 · {(questions.length > 0 && questions[0]?.knowledge_point) || params.knowledge_point || '—'}
                      </h2>
                      <p className="mt-1 text-sm text-gray-500">
                        难度 {difficultyLabel}
                        <span className="text-gray-300 mx-1.5">·</span>
                        {questions.length} 题
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setExpandedIndices(new Set(questions.map((_, i) => i)))}
                        className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                      >
                        展开全部
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedIndices(new Set())}
                        className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                      >
                        收起全部
                      </button>
                    </div>
                  </div>
                  <div className="px-5 py-3.5 bg-gray-50/70 flex flex-wrap items-center gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleAddToTodayHomework}
                        disabled={addingToToday}
                        className="inline-flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-medium text-green-800 shadow-sm hover:bg-green-100 active:scale-[0.98] transition-transform disabled:opacity-50"
                      >
                        {addingToToday ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
                        加入今日作业
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveAsExam}
                        disabled={savingExam}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 transition-transform"
                      >
                        {savingExam ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        保存为试卷
                      </button>
                    </div>
                    <span className="w-px h-7 bg-gray-200 hidden sm:block" aria-hidden />
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 hover:border-gray-300 active:scale-[0.98] transition-transform"
                      >
                        <Copy className="h-4 w-4" />
                        复制文本
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 hover:border-gray-300 active:scale-[0.98] transition-transform"
                      >
                        <FileText className="h-4 w-4" />
                        导出 Word
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 hover:border-gray-300 active:scale-[0.98] transition-transform"
                      >
                        <Download className="h-4 w-4" />
                        导出 PDF
                      </button>
                    </div>
                  </div>
                </div>
                )}

                {questions.length > 0 && (
                <ul className="space-y-6 pb-4">
                  {questions.map((q, i) => {
                    const expanded = expandedIndices.has(i)
                    const showSectionHeader =
                      questions.length === 28 && [0, 8, 16].includes(i)
                    const sectionTitles = { 0: '一、选择题', 8: '二、填空题', 16: '三、解答题' }
                    return (
                      <li key={i}>
                        {showSectionHeader && (
                          <div className="mb-4 mt-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2.5 text-sm font-semibold text-purple-800">
                            {sectionTitles[i]}
                          </div>
                        )}
                        <QuestionCard
                          data={{
                            ...q,
                            knowledge_point: (q.knowledge_point ?? '').trim() || '未标注',
                            difficulty: q.difficulty ?? params.difficulty,
                            question_type:
                              questions.length === 28
                                ? i < 8
                                  ? '选择'
                                  : i < 16
                                    ? '填空'
                                    : '解答'
                                : (q.question_type ?? params.question_type),
                          }}
                          index={i + 1}
                          expanded={expanded}
                          onToggle={() => {
                            setExpandedIndices((prev) => {
                              const next = new Set(prev)
                              if (next.has(i)) next.delete(i)
                              else next.add(i)
                              return next
                            })
                          }}
                          onRegenerate={() => handleRegenerate(i)}
                          regenerating={regeneratingIndex === i}
                          onVerify={async (payload) => await verifyQuestion(payload)}
                          onUpdate={(newData) => handleUpdateQuestion(i, newData)}
                        />
                      </li>
                    )
                  })}
                </ul>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
