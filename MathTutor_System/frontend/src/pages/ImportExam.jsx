import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  BookOpen,
  Check,
  FileImage,
  FileText,
  FileUp,
  Layers3,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { collectQuestion, generateAnalysisForQuestions, parseWordExam, saveQuestionsBatch } from '../services/api'
import { useStudent } from '../contexts/StudentContext'
import { EmptyState, ErrorState, PageHeader, PageShell, SectionCard, StatusBadge } from '../components/UiV2'

const MAX_UPLOAD_BYTES = 30 * 1024 * 1024
const ACCEPTED_EXTENSIONS = ['.docx', '.pdf']
const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F']

const QUESTION_TYPES = [
  { value: 'choice', label: '选择' },
  { value: 'fill', label: '填空' },
  { value: 'solution', label: '解答' },
]

const DIFFICULTIES = ['L1', 'L2', 'L3', 'L4', 'L5']

function defaultQuestion() {
  return {
    content: '',
    type: 'fill',
    options: [],
    answer: '',
    analysis: '',
    knowledge_point: '试卷导入',
    difficulty: 'L3',
    images: [],
  }
}

function normalizeType(type) {
  const value = String(type || '').trim().toLowerCase()
  if (['choice', '选择', '选择题', 'single', '单选', '单选题', '判断', '判断题'].includes(value)) return 'choice'
  if (['solution', '解答', '解答题', '计算', '计算题', '应用', '应用题', '大题'].includes(value)) return 'solution'
  return 'fill'
}

function typeToLabel(type) {
  return QUESTION_TYPES.find((item) => item.value === normalizeType(type))?.label || '填空'
}

function stripLeadingOptionLetter(option, index) {
  const text = String(option ?? '').trim()
  const letter = OPTION_LABELS[index] || String.fromCharCode(65 + index)
  return text.replace(new RegExp(`^\\s*${letter}[.、)）\\s]+`, 'i'), '').trim() || text
}

function normalizeQuestion(raw) {
  const q = raw && typeof raw === 'object' ? raw : { content: String(raw || '') }
  return {
    content: q.content ?? q.question ?? '',
    type: normalizeType(q.type ?? q.question_type),
    options: Array.isArray(q.options) ? q.options.map(stripLeadingOptionLetter) : [],
    answer: q.answer ?? '',
    analysis: q.analysis ?? '',
    knowledge_point: q.knowledge_point ?? q.topic ?? '试卷导入',
    difficulty: q.difficulty ?? 'L3',
    images: Array.isArray(q.images) ? q.images : [],
  }
}

function getFileExtension(file) {
  const name = String(file?.name || '').toLowerCase()
  return ACCEPTED_EXTENSIONS.find((ext) => name.endsWith(ext)) || ''
}

function formatBytes(bytes) {
  if (!bytes) return '0 MB'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function extractQuestions(response) {
  const raw = Array.isArray(response?.questions)
    ? response.questions
    : Array.isArray(response?.data?.questions)
      ? response.data.questions
      : Array.isArray(response)
        ? response
        : []
  return raw.map(normalizeQuestion)
}

function buildQuestionPayload(question, currentStudent) {
  return {
    content: question.content || '',
    options: Array.isArray(question.options) ? question.options : [],
    answer: question.answer || '（见解析）',
    analysis: question.analysis || '',
    knowledge_point: question.knowledge_point || '试卷导入',
    difficulty: question.difficulty || 'L3',
    question_type: typeToLabel(question.type),
    source: '试卷导入',
    student_id: currentStudent?.id ?? null,
    images: Array.isArray(question.images) ? question.images : [],
  }
}

function StepCard({ index, title, description, active, complete }) {
  return (
    <div className={`v2-import-step ${active ? 'active' : ''} ${complete ? 'complete' : ''}`}>
      <span>{complete ? <Check className="h-4 w-4" /> : index}</span>
      <div className="min-w-0">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>
  )
}

function FormatCard({ icon: Icon, title, description, enabled }) {
  return (
    <div className={`v2-import-format ${enabled ? 'enabled' : 'disabled'}`}>
      <Icon className="h-5 w-5" />
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>
  )
}

export default function ImportExam() {
  const navigate = useNavigate()
  const { currentStudent } = useStudent()
  const [file, setFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [questions, setQuestions] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [editingIndex, setEditingIndex] = useState(null)
  const [editForm, setEditForm] = useState(defaultQuestion())
  const [batchKnowledgePoint, setBatchKnowledgePoint] = useState('')
  const [saving, setSaving] = useState(false)
  const [generatingAnalysis, setGeneratingAnalysis] = useState(false)
  const [collectResult, setCollectResult] = useState(null)

  const selectedIndices = useMemo(() => Array.from(selectedIds).sort((a, b) => a - b), [selectedIds])
  const targetIndices = selectedIndices.length ? selectedIndices : questions.map((_, index) => index)
  const selectedQuestions = selectedIndices.length ? selectedIndices.length : questions.length
  const hasQuestions = questions.length > 0
  const fileExtension = getFileExtension(file)

  const recognitionStats = useMemo(() => {
    const choice = questions.filter((q) => normalizeType(q.type) === 'choice').length
    const fill = questions.filter((q) => normalizeType(q.type) === 'fill').length
    const solution = questions.filter((q) => normalizeType(q.type) === 'solution').length
    const knowledgePoints = new Set(questions.map((q) => q.knowledge_point).filter(Boolean))
    return { choice, fill, solution, knowledgePoints: knowledgePoints.size }
  }, [questions])

  const validateFile = useCallback((candidate) => {
    if (!candidate) return false
    const extension = getFileExtension(candidate)
    if (!extension) {
      const message = '当前仅支持 PDF 或 Word (.docx) 试卷文件'
      setParseError(message)
      toast.error(message)
      return false
    }
    if (candidate.size > MAX_UPLOAD_BYTES) {
      const message = `文件过大，请上传不超过 ${formatBytes(MAX_UPLOAD_BYTES)} 的试卷`
      setParseError(message)
      toast.error(message)
      return false
    }
    return true
  }, [])

  const onFileChange = useCallback((candidate) => {
    if (!candidate) {
      setFile(null)
      setQuestions([])
      setSelectedIds(new Set())
      setParseError('')
      return
    }
    if (!validateFile(candidate)) return
    setFile(candidate)
    setQuestions([])
    setSelectedIds(new Set())
    setCollectResult(null)
    setParseError('')
  }, [validateFile])

  const handleParse = useCallback(async () => {
    if (!file || !validateFile(file)) return
    setParsing(true)
    setParseError('')
    setQuestions([])
    setSelectedIds(new Set())
    setCollectResult(null)
    try {
      const response = await parseWordExam(file)
      const parsed = extractQuestions(response)
      setQuestions(parsed)
      if (!parsed.length) {
        const message = '未解析到题目，请检查试卷内容或手动校正'
        setParseError(message)
        toast(message)
      } else {
        toast.success(`已解析 ${parsed.length} 道题目`)
      }
    } catch (err) {
      const message = err?.response?.data?.detail ?? err?.message ?? '解析服务暂不可用'
      setParseError(String(message))
      toast.error(`解析失败：${message}`)
    } finally {
      setParsing(false)
    }
  }, [file, validateFile])

  const handleSaveToBank = useCallback(async () => {
    if (!questions.length) return
    setSaving(true)
    setCollectResult(null)
    try {
      const items = targetIndices.map((index) => buildQuestionPayload(questions[index], currentStudent))
      await saveQuestionsBatch({ questions: items })
      const createdIndices = []
      const skippedIndices = []
      for (let i = 0; i < items.length; i++) {
        const result = await collectQuestion(items[i])
        const oneBased = targetIndices[i] + 1
        if (result?.created === false) skippedIndices.push(oneBased)
        else createdIndices.push(oneBased)
      }
      setCollectResult({ createdIndices, skippedIndices })
      toast.success(`已保存 ${createdIndices.length} 道新题${skippedIndices.length ? `，跳过 ${skippedIndices.length} 道重复题` : ''}`)
    } catch (err) {
      const message = err?.response?.data?.detail ?? err?.message ?? '保存失败'
      toast.error(`录入题库失败：${message}`)
    } finally {
      setSaving(false)
    }
  }, [currentStudent, questions, targetIndices])

  const handleGenerateAnalysis = useCallback(async () => {
    if (!questions.length) return
    setGeneratingAnalysis(true)
    try {
      const response = await generateAnalysisForQuestions({
        questions: targetIndices.map((index) => buildQuestionPayload(questions[index], currentStudent)),
      })
      const returned = Array.isArray(response?.questions) ? response.questions : []
      setQuestions((prev) => {
        const next = prev.map((q) => ({ ...q }))
        targetIndices.forEach((index, offset) => {
          if (next[index] && typeof returned[offset]?.analysis === 'string') {
            next[index].analysis = returned[offset].analysis
          }
        })
        return next
      })
      toast.success(`已生成 ${targetIndices.length} 道题解析`)
    } catch (err) {
      const message = err?.response?.data?.detail ?? err?.message ?? '生成失败'
      toast.error(`AI 生成解析失败：${message}`)
    } finally {
      setGeneratingAnalysis(false)
    }
  }, [currentStudent, questions, targetIndices])

  const startEdit = useCallback((index) => {
    setEditingIndex(index)
    setEditForm({ ...defaultQuestion(), ...questions[index], type: normalizeType(questions[index]?.type) })
  }, [questions])

  const saveEdit = useCallback(() => {
    if (editingIndex == null) return
    setQuestions((prev) => prev.map((q, index) => (index === editingIndex ? { ...q, ...editForm, type: normalizeType(editForm.type) } : q)))
    setEditingIndex(null)
    setEditForm(defaultQuestion())
    toast.success('已保存题目修改')
  }, [editForm, editingIndex])

  const removeQuestion = useCallback((index) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index))
    setSelectedIds((prev) => {
      const next = new Set()
      prev.forEach((id) => {
        if (id < index) next.add(id)
        if (id > index) next.add(id - 1)
      })
      return next
    })
    if (editingIndex === index) setEditingIndex(null)
  }, [editingIndex])

  const toggleSelect = useCallback((index) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => (prev.size === questions.length ? new Set() : new Set(questions.map((_, index) => index))))
  }, [questions])

  const applyBatchKnowledgePoint = useCallback(() => {
    const value = batchKnowledgePoint.trim()
    if (!value || !selectedIds.size) return
    setQuestions((prev) => prev.map((q, index) => (selectedIds.has(index) ? { ...q, knowledge_point: value } : q)))
    setBatchKnowledgePoint('')
    toast.success(`已更新 ${selectedIds.size} 道题知识点`)
  }, [batchKnowledgePoint, selectedIds])

  const applyBatchDifficulty = useCallback((difficulty) => {
    if (!selectedIds.size) return
    setQuestions((prev) => prev.map((q, index) => (selectedIds.has(index) ? { ...q, difficulty } : q)))
    toast.success(`已更新 ${selectedIds.size} 道题难度`)
  }, [selectedIds])

  const addManualQuestion = useCallback(() => {
    setQuestions((prev) => [...prev, defaultQuestion()])
    setEditingIndex(questions.length)
    setEditForm(defaultQuestion())
  }, [questions.length])

  const onDrop = useCallback((event) => {
    event.preventDefault()
    setDragOver(false)
    onFileChange(event.dataTransfer?.files?.[0] || null)
  }, [onFileChange])

  return (
    <PageShell className="space-y-5">
      <PageHeader
        title="导入试卷"
        description="上传 PDF 或 Word 试卷，沿用当前解析接口完成结构化题目预览、校正与题库录入。"
        icon={FileUp}
        meta={<StatusBadge tone={hasQuestions ? 'success' : file ? 'warning' : 'neutral'}>{hasQuestions ? '已解析' : file ? '待解析' : '等待上传'}</StatusBadge>}
        actions={(
          <>
            <button type="button" className="v2-btn-secondary" onClick={() => navigate('/')}>返回首页</button>
            <button type="button" className="v2-btn-primary" disabled={!file || parsing} onClick={handleParse}>
              {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              开始解析
            </button>
          </>
        )}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StepCard index="1" title="上传文件" description={file ? file.name : '选择试卷'} complete={!!file} active={!file} />
        <StepCard index="2" title="OCR识别" description="图片试卷待后端支持" active={!!file && parsing} complete={hasQuestions} />
        <StepCard index="3" title="结构解析" description="题干/选项/答案" active={parsing} complete={hasQuestions} />
        <StepCard index="4" title="知识点标注" description={`${recognitionStats.knowledgePoints} 个知识点`} complete={hasQuestions && recognitionStats.knowledgePoints > 0} />
        <StepCard index="5" title="入库完成" description={collectResult ? `${collectResult.createdIndices.length} 道新题` : '保存后完成'} complete={!!collectResult} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.9fr]">
        <SectionCard title="上传试卷" description="当前后端支持 PDF / Word；图片 OCR 入口展示为禁用状态，不会触发未实现接口。">
          <div
            className={`v2-import-dropzone ${dragOver ? 'active' : ''}`}
            onDrop={onDrop}
            onDragOver={(event) => { event.preventDefault(); setDragOver(true) }}
            onDragLeave={(event) => { event.preventDefault(); setDragOver(false) }}
          >
            <input
              aria-label="上传试卷文件"
              type="file"
              accept=".docx,.pdf"
              onChange={(event) => onFileChange(event.target.files?.[0] || null)}
            />
            <FileUp className="h-9 w-9" />
            <strong>{file ? file.name : '拖拽或点击上传 PDF / DOCX 试卷'}</strong>
            <p>{file ? `${fileExtension.toUpperCase().replace('.', '')} / ${formatBytes(file.size)}` : `单文件上限 ${formatBytes(MAX_UPLOAD_BYTES)}，暂不接入图片 OCR`}</p>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <FormatCard icon={FileText} title="PDF" description="已接入解析接口" enabled />
            <FormatCard icon={BookOpen} title="Word" description=".docx 结构解析" enabled />
            <FormatCard icon={FileImage} title="图片" description="待后端 OCR 支持" enabled={false} />
          </div>

          {file && (
            <div className="mt-4 v2-import-file-row">
              <FileText className="h-5 w-5" />
              <div className="min-w-0 flex-1">
                <strong>{file.name}</strong>
                <p>{formatBytes(file.size)} · {hasQuestions ? '解析完成，可校正后保存' : '等待解析'}</p>
              </div>
              <button type="button" className="v2-icon-button" title="移除文件" onClick={() => onFileChange(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {parseError && !parsing && (
            <div className="mt-4">
              <ErrorState title="解析失败" description={parseError} onRetry={file ? handleParse : undefined} actionLabel="重试解析" />
            </div>
          )}
        </SectionCard>

        <SectionCard title="识别结果" description="只展示当前接口真实返回的题目结构。">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="v2-import-panel">
              <span>试卷信息</span>
              <strong>{file?.name || '未上传'}</strong>
              <p>{file ? `${formatBytes(file.size)} · ${fileExtension || '未知格式'}` : '选择文件后显示解析来源'}</p>
            </div>
            <div className="v2-import-panel">
              <span>结构识别</span>
              <strong>{questions.length} 道题</strong>
              <p>选择 {recognitionStats.choice} · 填空 {recognitionStats.fill} · 解答 {recognitionStats.solution}</p>
            </div>
            <div className="v2-import-panel">
              <span>知识点覆盖</span>
              <strong>{recognitionStats.knowledgePoints} 个</strong>
              <p>可在题目校正区批量调整</p>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title={`题目预览 (${questions.length})`}
        description="解析结果可人工校正；未勾选题目时，保存与生成解析默认作用于全部题目。"
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            {hasQuestions && (
              <button type="button" className="v2-btn-secondary" onClick={toggleSelectAll}>
                {selectedIds.size === questions.length ? '取消全选' : '全选'}
              </button>
            )}
            <button type="button" className="v2-btn-secondary" onClick={addManualQuestion}>
              <Plus className="h-4 w-4" />
              手动校正
            </button>
          </div>
        )}
      >
        {selectedIds.size > 0 && (
          <div className="mb-4 v2-import-batchbar">
            <span>已选 {selectedIds.size} 题</span>
            <input
              value={batchKnowledgePoint}
              onChange={(event) => setBatchKnowledgePoint(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') applyBatchKnowledgePoint() }}
              placeholder="批量知识点"
            />
            <button type="button" className="v2-btn-secondary" disabled={!batchKnowledgePoint.trim()} onClick={applyBatchKnowledgePoint}>应用</button>
            <div className="flex flex-wrap gap-1">
              {DIFFICULTIES.map((difficulty) => (
                <button key={difficulty} type="button" className="v2-chip" onClick={() => applyBatchDifficulty(difficulty)}>{difficulty}</button>
              ))}
            </div>
          </div>
        )}

        {parsing ? (
          <div className="v2-import-loading">
            <Loader2 className="h-9 w-9 animate-spin text-indigo-400" />
            <strong>正在解析试卷</strong>
            <p>请保持页面打开，解析完成后会自动展示题目结构。</p>
          </div>
        ) : questions.length === 0 ? (
          <EmptyState icon={Layers3} title="暂无解析结果" description="上传试卷并开始解析后，题目会出现在这里。" />
        ) : (
          <div className="space-y-3">
            {questions.map((question, index) => (
              <article key={`${question.content}-${index}`} className={`v2-import-question ${selectedIds.has(index) ? 'selected' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(index)}
                      onChange={() => toggleSelect(index)}
                      aria-label={`选择第 ${index + 1} 题`}
                      className="mt-1"
                    />
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <StatusBadge tone="primary">第 {index + 1} 题</StatusBadge>
                        <StatusBadge tone="neutral">{typeToLabel(question.type)}</StatusBadge>
                        <StatusBadge tone="warning">{question.difficulty}</StatusBadge>
                        <span className="text-xs font-bold text-slate-400">{question.knowledge_point || '未标注知识点'}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm font-bold leading-6 text-slate-100">{question.content || '未填写题干'}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button type="button" className="v2-icon-button" title="编辑" onClick={() => startEdit(index)}><Pencil className="h-4 w-4" /></button>
                    <button type="button" className="v2-icon-button danger" title="删除" onClick={() => removeQuestion(index)}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>

                {question.options?.length > 0 && (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {question.options.map((option, optionIndex) => (
                      <div key={`${option}-${optionIndex}`} className="v2-import-option">
                        <span>{OPTION_LABELS[optionIndex] || optionIndex + 1}</span>
                        <p>{option}</p>
                      </div>
                    ))}
                  </div>
                )}

                {(question.answer || question.analysis) && (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <div className="v2-import-note"><span>答案</span><p>{question.answer || '未识别'}</p></div>
                    <div className="v2-import-note"><span>解析</span><p>{question.analysis || '未生成'}</p></div>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </SectionCard>

      {editingIndex != null && (
        <div className="v2-modal-backdrop">
          <div className="v2-import-editor">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2>校正第 {editingIndex + 1} 题</h2>
                <p>修改内容仅在前端预览结果中生效，保存题库时一并提交。</p>
              </div>
              <button type="button" className="v2-icon-button" onClick={() => setEditingIndex(null)}><X className="h-4 w-4" /></button>
            </div>

            <label className="v2-field">
              <span>题干</span>
              <textarea value={editForm.content} onChange={(event) => setEditForm((prev) => ({ ...prev, content: event.target.value }))} rows={5} />
            </label>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="v2-field">
                <span>题型</span>
                <select value={normalizeType(editForm.type)} onChange={(event) => setEditForm((prev) => ({ ...prev, type: event.target.value }))}>
                  {QUESTION_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </label>
              <label className="v2-field">
                <span>难度</span>
                <select value={editForm.difficulty} onChange={(event) => setEditForm((prev) => ({ ...prev, difficulty: event.target.value }))}>
                  {DIFFICULTIES.map((difficulty) => <option key={difficulty} value={difficulty}>{difficulty}</option>)}
                </select>
              </label>
              <label className="v2-field">
                <span>知识点</span>
                <input value={editForm.knowledge_point} onChange={(event) => setEditForm((prev) => ({ ...prev, knowledge_point: event.target.value }))} />
              </label>
            </div>

            <label className="v2-field">
              <span>选项</span>
              <div className="space-y-2">
                {(editForm.options || []).map((option, optionIndex) => (
                  <div key={optionIndex} className="flex gap-2">
                    <input
                      value={option}
                      onChange={(event) => {
                        const next = [...(editForm.options || [])]
                        next[optionIndex] = event.target.value
                        setEditForm((prev) => ({ ...prev, options: next }))
                      }}
                    />
                    <button
                      type="button"
                      className="v2-icon-button danger"
                      onClick={() => setEditForm((prev) => ({ ...prev, options: prev.options.filter((_, i) => i !== optionIndex) }))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button type="button" className="v2-btn-secondary" onClick={() => setEditForm((prev) => ({ ...prev, options: [...(prev.options || []), ''] }))}>
                  <Plus className="h-4 w-4" />
                  添加选项
                </button>
              </div>
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="v2-field">
                <span>答案</span>
                <input value={editForm.answer} onChange={(event) => setEditForm((prev) => ({ ...prev, answer: event.target.value }))} />
              </label>
              <label className="v2-field">
                <span>解析</span>
                <textarea value={editForm.analysis} onChange={(event) => setEditForm((prev) => ({ ...prev, analysis: event.target.value }))} rows={3} />
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" className="v2-btn-secondary" onClick={() => setEditingIndex(null)}>取消</button>
              <button type="button" className="v2-btn-primary" onClick={saveEdit}><Save className="h-4 w-4" />保存修改</button>
            </div>
          </div>
        </div>
      )}

      {collectResult && (
        <div className="v2-import-result">
          <Check className="h-4 w-4" />
          <span>已保存 {collectResult.createdIndices.length} 道新题{collectResult.skippedIndices.length ? `，跳过重复题：${collectResult.skippedIndices.join('、')}` : ''}</span>
        </div>
      )}

      <div className="v2-import-actionbar">
        <div className="min-w-0">
          <strong>{file ? file.name : '尚未选择试卷'}</strong>
          <p>{hasQuestions ? `将处理 ${selectedQuestions} / ${questions.length} 道题` : '上传并解析后可生成解析或保存到题库'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="v2-btn-secondary" disabled={!file || parsing} onClick={handleParse}>
            {parseError ? <RefreshCw className="h-4 w-4" /> : <Wand2 className="h-4 w-4" />}
            {parseError ? '重试解析' : '开始解析'}
          </button>
          <button type="button" className="v2-btn-secondary" disabled={!hasQuestions || generatingAnalysis} onClick={handleGenerateAnalysis}>
            {generatingAnalysis ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            生成答案解析
          </button>
          <button type="button" className="v2-btn-primary" disabled={!hasQuestions || saving} onClick={handleSaveToBank}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存到题库
          </button>
        </div>
      </div>

      {!ACCEPTED_EXTENSIONS.includes('.png') && (
        <p className="sr-only"><AlertTriangle className="inline h-3 w-3" /> 图片识别未接入，不会调用未实现接口。</p>
      )}
    </PageShell>
  )
}
