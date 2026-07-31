import { useState, useCallback } from 'react'
import { FileUp, Loader2, FileText, BookOpen, Pencil, X, Check, Plus, Trash2, Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import Latex from 'react-latex-next'
import toast from 'react-hot-toast'
import { parseWordExam, saveQuestionsBatch, collectQuestion, generateAnalysisForQuestions } from '../services/api'
import { useStudent } from '../contexts/StudentContext'
import { normalizeLatexForKaTeX } from '../utils/latex'
import 'katex/dist/katex.min.css'

const QUESTION_TYPES = [
  { value: 'choice', label: '选择' },
  { value: 'fill', label: '填空' },
  { value: 'solution', label: '解答' },
]

/** 题型映射：将 AI/后端可能返回的各种表述统一为 choice | fill | solution（用于展示与提交） */
function normalizeType(type) {
  const t = String(type || '').trim().toLowerCase()
  const choiceKeys = ['choice', '选择', '选择题', '单选', '单选题', '判断', '判断题']
  const solutionKeys = ['solution', '解答', '解答题', '计算', '计算题', '应用', '应用题', '大题']
  if (choiceKeys.includes(t)) return 'choice'
  if (solutionKeys.includes(t)) return 'solution'
  return 'fill'
}

function typeToLabel(type) {
  const normalized = normalizeType(type)
  if (normalized === 'choice') return '选择'
  if (normalized === 'solution') return '解答'
  return '填空'
}

function typeToQuestionType(type) {
  const normalized = normalizeType(type)
  if (normalized === 'choice') return '选择'
  if (normalized === 'solution') return '解答'
  return '填空'
}

const OPTION_LABELS = ['A.', 'B.', 'C.', 'D.', 'E.', 'F.']

/** 去掉选项文字开头自带的 A. B. C. D. 等，避免与列表标签重复显示为 "A. A.xxx" */
function stripLeadingOptionLetter(opt, index) {
  const s = String(opt ?? '').trim()
  const letter = OPTION_LABELS[index]?.[0] ?? String.fromCharCode(65 + index)
  const re = new RegExp(`^\\s*${letter}[.．]\\s*`, 'i')
  return s.replace(re, '').trim() || s
}

/** 清洗一道题的选项：去掉每项开头的 A. B. C. D. 前缀（解析结果常带重复标签） */
function cleanQuestionOptions(q) {
  if (!q || !Array.isArray(q.options) || q.options.length === 0) return q
  return {
    ...q,
    options: q.options.map((opt, j) => stripLeadingOptionLetter(opt, j)),
  }
}

/** 解析文本中字面量 \\n 转为真实换行，避免界面显示为 \n */
function normalizeAnalysisNewlines(text) {
  return String(text ?? '').replace(/\\n/g, '\n')
}

/** 将简单分数（整条仅为分数）转为 LaTeX \\frac */
function plainFractionToLatex(s) {
  const t = String(s ?? '').trim()
  if (!t || t.includes('$') || t.includes('\\frac')) return t
  const m1 = t.match(/^\s*√\s*(\d+)\s*\/\s*(\d+)\s*$/) || t.match(/^\s*\\sqrt\{\s*(\d+)\s*\}\s*\/\s*(\d+)\s*$/)
  if (m1) return `$\\frac{\\sqrt{${m1[1]}}}{${m1[2]}}$`
  const m2 = t.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/)
  if (m2) return `$\\frac{${m2[1]}}{${m2[2]}}$`
  return null
}

/** 复杂选项中把 inline 分数（如 60/x、60/(2x)、2√2/3）都转成 \\frac，统一竖式显示 */
function inlineFractionsToLatex(s) {
  let t = String(s ?? '').trim()
  if (!t || t.includes('\\frac')) return t
  // 60/(2x)、60/(x+3)、60/(x-3)
  t = t.replace(/(\d+)\/\(([^)]+)\)/g, (_, num, den) => `\\frac{${num}}{${den}}`)
  // 2√2/3、3√2/4 等
  t = t.replace(/(\d+)√(\d+)\/(\d+)/g, (_, c, r, d) => `\\frac{${c}\\sqrt{${r}}}{${d}}`)
  // √2/4、√3/2
  t = t.replace(/√(\d+)\/(\d+)/g, (_, r, d) => `\\frac{\\sqrt{${r}}}{${d}}`)
  // 60/x、60/2x（分母为 x 或 数字+x）
  t = t.replace(/(\d+)\/(\d*[xX])/g, (_, num, den) => `\\frac{${num}}{${den || 'x'}}`)
  // 纯数字分数 1/4、2/3（避免把已转换的 \frac 再匹配，所以只匹配未转的）
  t = t.replace(/(\d+)\/(\d+)/g, (_, n, d) => `\\frac{${n}}{${d}}`)
  return t
}

/** 选择题选项：数学式用 $ 包裹；分数统一转为 \\frac 竖式显示 */
function ensureOptionMath(opt) {
  const s = String(opt ?? '').trim()
  if (!s || s.includes('$')) return s
  const asFrac = plainFractionToLatex(s)
  if (asFrac) return asFrac
  const withFrac = inlineFractionsToLatex(s)
  const hasEq = /[=]/.test(withFrac)
  const hasSqrt = /[√\\sqrt]/.test(withFrac)
  const hasFrac = /\\frac|\/\s*\d|\d\s*\/\s*\d/.test(s)
  const shortWithMath = withFrac.length <= 120 && /\d/.test(withFrac) && /[/*^()]/.test(withFrac)
  if (hasEq || hasSqrt || hasFrac || shortWithMath) return `$${withFrac}$`
  return s
}

const defaultQuestion = () => ({
  content: '',
  type: 'fill',
  options: [],
  answer: '',
  analysis: '',
  knowledge_point: 'Word导入',
  difficulty: 'L3',
  images: [],
})

export default function ImportExam() {
  const { currentStudent } = useStudent()
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [questions, setQuestions] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const [editingIndex, setEditingIndex] = useState(null)
  const [editForm, setEditForm] = useState(defaultQuestion)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [batchKnowledgePoint, setBatchKnowledgePoint] = useState('')
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false)
  /** 录入结果：新录入 / 重复跳过的题号（1-based），用于查重反馈弹层 */
  const [collectResult, setCollectResult] = useState(null)
  const [generatingAnalysis, setGeneratingAnalysis] = useState(false)
  /** 解析展开的题目下标集合（预览态下点击「展开」显示完整解析） */
  const [expandedAnalysisIndices, setExpandedAnalysisIndices] = useState(new Set())

  const onFileChange = useCallback((selected) => {
    if (!selected) {
      setFile(null)
      setQuestions([])
      return
    }
    const name = (selected.name || '').toLowerCase()
    if (!name.endsWith('.docx') && !name.endsWith('.pdf')) {
      toast.error('请选择 .docx 或 .pdf 格式的试卷文件')
      return
    }
    setFile(selected)
    setQuestions([])
  }, [])

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault()
      setDragOver(false)
      const f = e.dataTransfer?.files?.[0]
      if (f) onFileChange(f)
    },
    [onFileChange]
  )

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  const handleParse = useCallback(async () => {
    if (!file) return
    setLoading(true)
    setQuestions([])
    try {
      const res = await parseWordExam(file)
      const rawList = Array.isArray(res?.questions)
        ? res.questions
        : Array.isArray(res?.data?.questions)
          ? res.data.questions
          : Array.isArray(res)
            ? res
            : []
      const list = rawList.map((q) => (q && typeof q === 'object' ? cleanQuestionOptions(q) : { content: String(q || ''), type: 'fill', options: [], answer: '', analysis: '', knowledge_point: 'Word导入', difficulty: 'L3', images: [] }))
      setQuestions(list)
      if (list.length === 0) toast('未解析到题目，请检查文档格式')
      else toast.success(`已解析 ${list.length} 道题目`)
    } catch (err) {
      const msg = err.response?.data?.detail ?? err.message
      toast.error('解析失败：' + msg)
      setQuestions([])
    } finally {
      setLoading(false)
    }
  }, [file])

  const handleSaveToBank = useCallback(async () => {
    if (questions.length === 0) return
    // 仅录入已勾选的题目；未勾选任何题时录入全部（兼容不勾选直接点录入）
    const indicesToSave =
      selectedIds.size > 0
        ? Array.from(selectedIds).sort((a, b) => a - b)
        : questions.map((_, i) => i)
    if (indicesToSave.length === 0) return
    setSaving(true)
    setCollectResult(null)
    try {
      const items = indicesToSave.map((i) => {
        const q = questions[i]
        return {
          content: q.content || '',
          options: Array.isArray(q.options) ? q.options : [],
          answer: q.answer || '（见解析）',
          analysis: q.analysis || '',
          knowledge_point: q.knowledge_point || 'Word导入',
          difficulty: q.difficulty || 'L3',
          question_type: typeToQuestionType(q.type),
          source: 'Word试卷导入',
          student_id: currentStudent?.id ?? null,
          images: Array.isArray(q.images) ? q.images : [],
        }
      })
      await saveQuestionsBatch({ questions: items })
      const createdIndices = []
      const skippedIndices = []
      for (let i = 0; i < items.length; i++) {
        const result = await collectQuestion(items[i])
        const oneBased = indicesToSave[i] + 1
        if (result.created) createdIndices.push(oneBased)
        else skippedIndices.push(oneBased)
      }
      if (skippedIndices.length > 0) {
        toast.success(`已录入 ${createdIndices.length} 道新题，${skippedIndices.length} 道与题库重复已跳过。可在「题库管理」中查看。`)
      } else {
        toast.success(`已录入 ${createdIndices.length} 道题，可在「题库管理」中查看`)
      }
      setCollectResult({ createdIndices, skippedIndices })
    } catch (err) {
      const msg = err.response?.data?.detail ?? err.message
      toast.error('录入题库失败：' + msg)
    } finally {
      setSaving(false)
    }
  }, [questions, selectedIds, currentStudent?.id])

  const handleGenerateAnalysis = useCallback(async () => {
    if (questions.length === 0) return
    const indicesToGen =
      selectedIds.size > 0
        ? Array.from(selectedIds).sort((a, b) => a - b)
        : questions.map((_, i) => i)
    if (indicesToGen.length === 0) return
    setGeneratingAnalysis(true)
    setCollectResult(null)
    try {
      const payload = {
        questions: indicesToGen.map((i) => ({
          content: questions[i].content || '',
          options: Array.isArray(questions[i].options) ? questions[i].options : [],
          answer: questions[i].answer || '',
        })),
      }
      const res = await generateAnalysisForQuestions(payload)
      const returned = Array.isArray(res?.questions) ? res.questions : []
      setQuestions((prev) => {
        const next = prev.map((q) => ({ ...q }))
        indicesToGen.forEach((idx, i) => {
          if (next[idx] && returned[i] && typeof returned[i].analysis === 'string') {
            next[idx].analysis = returned[i].analysis
          }
        })
        return next
      })
      setExpandedAnalysisIndices((prev) => {
        const next = new Set(prev)
        indicesToGen.forEach((idx) => next.add(idx))
        return next
      })
      toast.success(`已为 ${indicesToGen.length} 道题生成解析，已自动展开显示`)
    } catch (err) {
      const msg = err.response?.data?.detail ?? err.message
      toast.error('AI 生成解析失败：' + (typeof msg === 'string' ? msg : '未知错误'))
    } finally {
      setGeneratingAnalysis(false)
    }
  }, [questions, selectedIds])

  const startEdit = useCallback((index) => {
    const q = questions[index] || {}
    const type = normalizeType(q.type)
    const rawOpts = Array.isArray(q.options) ? q.options : []
    const options = rawOpts.map((opt, j) => stripLeadingOptionLetter(opt, j))
    setEditForm({
      content: q.content ?? '',
      type,
      options,
      answer: q.answer ?? '（见解析）',
      analysis: q.analysis ?? '',
      knowledge_point: q.knowledge_point ?? 'Word导入',
      difficulty: q.difficulty ?? 'L3',
      images: q.images ?? [],
    })
    setEditingIndex(index)
  }, [questions])

  const cancelEdit = useCallback(() => {
    setEditingIndex(null)
    setEditForm(defaultQuestion())
  }, [])

  const saveEdit = useCallback(() => {
    if (editingIndex == null) return
    setQuestions((prev) => {
      const next = [...prev]
      const q = { ...next[editingIndex], ...editForm }
      next[editingIndex] = q
      return next
    })
    setEditingIndex(null)
    setEditForm(defaultQuestion())
    toast.success('已保存修改')
  }, [editingIndex, editForm])

  const setEditFormOption = useCallback((index, value) => {
    setEditForm((prev) => {
      const opts = [...(prev.options || [])]
      opts[index] = value
      return { ...prev, options: opts }
    })
  }, [])

  const addOption = useCallback(() => {
    setEditForm((prev) => ({
      ...prev,
      options: [...(prev.options || []), ''],
    }))
  }, [])

  const removeOption = useCallback((index) => {
    setEditForm((prev) => {
      const opts = [...(prev.options || [])]
      opts.splice(index, 1)
      return { ...prev, options: opts }
    })
  }, [])

  const removeQuestion = useCallback((index) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(index)
      return next
    })
    if (editingIndex === index) cancelEdit()
    else if (editingIndex != null && editingIndex > index) setEditingIndex(editingIndex - 1)
  }, [editingIndex, cancelEdit])

  const toggleSelect = useCallback((index) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size >= questions.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(questions.map((_, i) => i)))
  }, [questions.length, selectedIds.size])

  const batchSetKnowledgePoint = useCallback(() => {
    const val = batchKnowledgePoint.trim()
    if (!val) return
    setQuestions((prev) =>
      prev.map((q, i) => (selectedIds.has(i) ? { ...q, knowledge_point: val } : q))
    )
    setBatchKnowledgePoint('')
    toast.success(`已批量设置 ${selectedIds.size} 题知识点`)
  }, [selectedIds, batchKnowledgePoint])

  const batchSetDifficulty = useCallback((d) => {
    setQuestions((prev) =>
      prev.map((q, i) => (selectedIds.has(i) ? { ...q, difficulty: d } : q))
    )
    toast.success(`已批量设置 ${selectedIds.size} 题难度为 ${d}`)
  }, [selectedIds])

  const batchRemove = useCallback(() => {
    setShowBatchDeleteConfirm(false)
    const indices = Array.from(selectedIds).sort((a, b) => b - a)
    setQuestions((prev) => prev.filter((_, i) => !selectedIds.has(i)))
    setSelectedIds(new Set())
    if (editingIndex != null && selectedIds.has(editingIndex)) cancelEdit()
    else if (editingIndex != null) {
      setEditingIndex(editingIndex - indices.filter((i) => i < editingIndex).length)
    }
    toast.success(`已删除 ${indices.length} 题`)
  }, [selectedIds, editingIndex, cancelEdit])

  return (
    <div className="mx-auto max-w-6xl space-y-6 md:space-y-8 animate-fade-in-up">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl p-6 sm:p-8 shadow-sm" style={{ border: '1px solid color-mix(in srgb, var(--color-border-primary) 90%, transparent)', backgroundColor: 'var(--color-bg-card)' }}>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 text-white shadow-lg shrink-0" style={{ boxShadow: '0 10px 15px -3px color-mix(in srgb, var(--color-primary-500) 25%, transparent)' }}>
            <FileUp className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--color-text-primary)' }}>智能试卷解析与导入中心</h1>
              <span className="rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)', color: 'var(--color-primary-600)' }}>
                OCR & Parser
              </span>
            </div>
            <p className="mt-1 text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              支持上传 Word (.docx) 与 PDF 格式文档，含图试卷将通过 AI 识图识别，文本试卷自动切分试题与选项
            </p>
          </div>
        </div>
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className="relative rounded-3xl border-2 border-dashed p-8 sm:p-10 text-center transition-all shadow-sm"
        style={
          dragOver
            ? { borderColor: 'var(--color-primary-500)', backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 10%, var(--color-bg-card))', transform: 'scale(0.99)' }
            : { borderColor: 'var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }
        }
        onMouseEnter={(e) => {
          if (!dragOver) {
            e.currentTarget.style.borderColor = 'var(--color-primary-400)'
            e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
          }
        }}
        onMouseLeave={(e) => {
          if (!dragOver) {
            e.currentTarget.style.borderColor = 'var(--color-border-primary)'
            e.currentTarget.style.backgroundColor = 'var(--color-bg-card)'
          }
        }}
      >
        <input
          type="file"
          accept=".docx,.pdf"
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(e) => onFileChange(e.target.files?.[0] || null)}
        />
        {file ? (
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 15%, var(--color-bg-card))', color: 'var(--color-primary-600)' }}>
              <FileText className="h-6 w-6" />
            </div>
            <span className="text-sm font-black" style={{ color: 'var(--color-text-primary)' }}>{file.name}</span>
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
              点击或拖拽可更换试卷文件
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: 'var(--color-bg-panel)', color: 'var(--color-text-muted)' }}>
              <FileUp className="h-6 w-6" />
            </div>
            <span className="text-xs font-black" style={{ color: 'var(--color-text-primary)' }}>点击或拖拽 .docx 或 .pdf 试卷到此处上传</span>
            <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>支持标准学校月考、期中期末试卷格式</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleParse}
          disabled={!file || loading}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundColor: 'var(--color-primary-600)' }}
          onMouseEnter={(e) => {
            if (file && !loading) {
              e.currentTarget.style.backgroundColor = 'var(--color-primary-700)'
            }
          }}
          onMouseLeave={(e) => {
            if (file && !loading) {
              e.currentTarget.style.backgroundColor = 'var(--color-primary-600)'
            }
          }}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              AI 正在解析…（请勿关闭页面）
            </>
          ) : (
            '开始解析'
          )}
        </button>
      </div>

      {questions.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>解析结果预览</h2>
            <div className="flex flex-wrap items-center gap-2">
              {selectedIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg px-4 py-2.5" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-panel)' }}>
                  <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>已选 {selectedIds.size} 题</span>
                  <span className="h-4 w-px" style={{ backgroundColor: 'var(--color-border-primary)' }} aria-hidden />
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>知识点</span>
                    <input
                      type="text"
                      value={batchKnowledgePoint}
                      onChange={(e) => setBatchKnowledgePoint(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && batchSetKnowledgePoint()}
                      placeholder="输入后点应用"
                      className="w-32 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1"
                      style={{ border: '1px solid var(--color-border-primary)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-bg-input)' }}
                    />
                    <button
                      type="button"
                      onClick={batchSetKnowledgePoint}
                      disabled={!batchKnowledgePoint.trim()}
                      className="rounded px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ backgroundColor: 'var(--color-primary-600)' }}
                      onMouseEnter={(e) => {
                        if (batchKnowledgePoint.trim()) {
                          e.currentTarget.style.backgroundColor = 'var(--color-primary-700)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (batchKnowledgePoint.trim()) {
                          e.currentTarget.style.backgroundColor = 'var(--color-primary-600)'
                        }
                      }}
                    >
                      应用
                    </button>
                  </div>
                  <span className="h-4 w-px" style={{ backgroundColor: 'var(--color-border-primary)' }} aria-hidden />
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>难度</span>
                    {['L1', 'L2', 'L3', 'L4', 'L5'].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => batchSetDifficulty(d)}
                        className="rounded px-2.5 py-1 text-xs font-medium transition-colors"
                        style={{ backgroundColor: 'var(--color-bg-panel)', color: 'var(--color-text-secondary)' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--color-primary-500) 15%, var(--color-bg-card))'
                          e.currentTarget.style.color = 'var(--color-primary-700)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--color-bg-panel)'
                          e.currentTarget.style.color = 'var(--color-text-secondary)'
                        }}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                  <span className="h-4 w-px" style={{ backgroundColor: 'var(--color-border-primary)' }} aria-hidden />
                  <button
                    type="button"
                    onClick={() => setShowBatchDeleteConfirm(true)}
                    className="rounded px-3 py-1.5 text-xs font-medium transition-colors"
                    style={{ backgroundColor: 'color-mix(in srgb, #ef4444 10%, var(--color-bg-card))', color: '#dc2626' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'color-mix(in srgb, #ef4444 20%, var(--color-bg-card))' }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'color-mix(in srgb, #ef4444 10%, var(--color-bg-card))' }}
                  >
                    批量删除
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="text-sm transition-colors"
                  style={{ color: 'var(--color-text-secondary)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--color-primary-600)'
                    e.currentTarget.style.textDecoration = 'underline'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--color-text-secondary)'
                    e.currentTarget.style.textDecoration = 'none'
                  }}
                >
                  {selectedIds.size >= questions.length ? '取消全选' : '全选'}
                </button>
                {questions.length > 0 && selectedIds.size === 0 && (
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>勾选题目后可批量设置知识点、难度或删除</span>
                )}
              </div>
              <button
                type="button"
                onClick={handleGenerateAnalysis}
                disabled={generatingAnalysis || questions.length === 0}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors disabled:opacity-60"
                style={{ backgroundColor: '#f59e0b' }}
                onMouseEnter={(e) => {
                  if (!generatingAnalysis && questions.length > 0) {
                    e.currentTarget.style.backgroundColor = '#d97706'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!generatingAnalysis && questions.length > 0) {
                    e.currentTarget.style.backgroundColor = '#f59e0b'
                  }
                }}
              >
                {generatingAnalysis ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    生成解析中…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    AI 生成解析
                  </>
                )}
              </button>
              <button
              type="button"
              onClick={handleSaveToBank}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors disabled:opacity-60"
              style={{ backgroundColor: 'var(--color-primary-600)' }}
              onMouseEnter={(e) => {
                if (!saving) {
                  e.currentTarget.style.backgroundColor = 'var(--color-primary-700)'
                }
              }}
              onMouseLeave={(e) => {
                if (!saving) {
                  e.currentTarget.style.backgroundColor = 'var(--color-primary-600)'
                }
              }}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  录入中…
                </>
              ) : (
                <>
                  <BookOpen className="h-4 w-4" />
                  录入题库
                </>
              )}
            </button>
            </div>
          </div>
          <ul className="space-y-3">
            {questions.map((q, i) => (
              <li
                key={i}
                className="rounded-lg shadow-sm"
                style={
                  selectedIds.has(i)
                    ? { border: '1px solid var(--color-primary-400)', backgroundColor: 'var(--color-bg-card)', boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-primary-500) 20%, transparent)' }
                    : { border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }
                }
              >
                <div className="p-4">{/* Question content will continue below */}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
                {editingIndex === i ? (
                  /* 编辑态 */
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                      <span className="text-sm font-medium text-gray-500">第 {i + 1} 题 · 编辑</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={saveEdit}
                          className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
                        >
                          <Check className="h-4 w-4" /> 保存
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <X className="h-4 w-4" /> 取消
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">题干</label>
                      <textarea
                        value={editForm.content}
                        onChange={(e) => setEditForm((p) => ({ ...p, content: e.target.value }))}
                        rows={3}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="题目内容"
                      />
                      {Array.isArray(editForm.images) && editForm.images.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {editForm.images.map((src, idx) => (
                            <img
                              key={idx}
                              src={src}
                              alt="题目附图"
                              loading="lazy"
                              className="max-w-full max-h-80 object-contain rounded border border-gray-200"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">题型</label>
                      <div className="flex flex-wrap gap-2">
                        {QUESTION_TYPES.map((qt) => (
                          <button
                            key={qt.value}
                            type="button"
                            onClick={() => setEditForm((p) => ({ ...p, type: qt.value }))}
                            className={`rounded-lg px-4 py-2 text-sm font-medium ${
                              editForm.type === qt.value
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            {qt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {editForm.type === 'choice' && (
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">选项</label>
                        <div className="space-y-2">
                          {(editForm.options || []).map((opt, j) => (
                            <div key={j} className="flex gap-2">
                              <input
                                type="text"
                                value={opt}
                                onChange={(e) => setEditFormOption(j, e.target.value)}
                                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder={`选项 ${String.fromCharCode(65 + j)}`}
                              />
                              <button
                                type="button"
                                onClick={() => removeOption(j)}
                                className="rounded-md p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                aria-label="删除选项"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={addOption}
                            className="inline-flex items-center gap-1 rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600"
                          >
                            <Plus className="h-4 w-4" /> 添加选项
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">答案</label>
                        <input
                          type="text"
                          value={editForm.answer}
                          onChange={(e) => setEditForm((p) => ({ ...p, answer: e.target.value }))}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="如 A 或 见解析"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">难度</label>
                        <div className="flex flex-wrap gap-1">
                          {['L1', 'L2', 'L3', 'L4', 'L5'].map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setEditForm((p) => ({ ...p, difficulty: d }))}
                              className={`rounded px-3 py-1.5 text-sm ${
                                editForm.difficulty === d
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              {d}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">知识点</label>
                      <input
                        type="text"
                        value={editForm.knowledge_point}
                        onChange={(e) => setEditForm((p) => ({ ...p, knowledge_point: e.target.value }))}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="如 一元二次方程"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">解析</label>
                      <textarea
                        value={editForm.analysis}
                        onChange={(e) => setEditForm((p) => ({ ...p, analysis: e.target.value }))}
                        rows={2}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="解题过程（选填）"
                      />
                    </div>
                  </div>
                ) : (
                  /* 预览态 */
                  <>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(i)}
                          onChange={() => toggleSelect(i)}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          aria-label={`选择第 ${i + 1} 题`}
                        />
                        <span className="rounded bg-blue-100 px-2 py-0.5 text-sm font-medium text-blue-700">
                          #{q.number ?? i + 1}
                        </span>
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-sm text-gray-600">
                          {typeToLabel(q.type)}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(i)}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-600 hover:bg-blue-50 hover:text-blue-700"
                        >
                          <Pencil className="h-3.5 w-3.5" /> 编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => removeQuestion(i)}
                          className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="删除此题"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="whitespace-pre-wrap text-gray-800">
                      <Latex>{normalizeLatexForKaTeX(q.content || '（无题干）')}</Latex>
                    </div>
                    {Array.isArray(q.images) && q.images.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {q.images.map((src, idx) => (
                          <img
                            key={idx}
                            src={src}
                            alt="题目附图"
                            loading="lazy"
                            className="max-w-full max-h-80 object-contain rounded border border-gray-200"
                          />
                        ))}
                      </div>
                    )}
                    {Array.isArray(q.options) && q.options.length > 0 && (
                      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-700">
                        {q.options.map((opt, j) => (
                          <span key={j} className="inline-flex items-baseline gap-1.5">
                            <span className="shrink-0 font-medium text-gray-500">
                              {OPTION_LABELS[j] ?? `${String.fromCharCode(65 + j)}.`}
                            </span>
                            <span className="text-gray-800">
                              <Latex>{normalizeLatexForKaTeX(ensureOptionMath(stripLeadingOptionLetter(opt, j)))}</Latex>
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                    {(q.answer || q.analysis || q.knowledge_point) && (
                      <div className="mt-2 space-y-2">
                        <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                          {q.answer && <span>答案：{q.answer}</span>}
                          {q.knowledge_point && <span>知识点：{q.knowledge_point}</span>}
                        </div>
                        {q.analysis && (
                          <div className="rounded-lg border border-gray-100 bg-gray-50/80">
                            <button
                              type="button"
                              onClick={() => setExpandedAnalysisIndices((prev) => {
                                const next = new Set(prev)
                                if (next.has(i)) next.delete(i)
                                else next.add(i)
                                return next
                              })}
                              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-blue-600 hover:bg-blue-50/50 rounded-lg transition-colors"
                            >
                              <span>
                                {expandedAnalysisIndices.has(i)
                                  ? '解析'
                                  : `解析：${normalizeAnalysisNewlines(q.analysis).slice(0, 60)}${normalizeAnalysisNewlines(q.analysis).length > 60 ? '…' : ''}`}
                              </span>
                              {expandedAnalysisIndices.has(i) ? (
                                <ChevronUp className="h-4 w-4 shrink-0" />
                              ) : (
                                <ChevronDown className="h-4 w-4 shrink-0" />
                              )}
                            </button>
                            {expandedAnalysisIndices.has(i) && (
                              <div className="border-t border-gray-100 px-3 py-2.5 text-sm text-gray-700 whitespace-pre-wrap">
                                <Latex>{normalizeLatexForKaTeX(normalizeAnalysisNewlines(q.analysis))}</Latex>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 批量删除确认弹层：替代原生 confirm */}
      {showBatchDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="batch-delete-title"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <h3 id="batch-delete-title" className="text-lg font-semibold text-gray-800">
              确定删除所选题目？
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              将删除已选 {selectedIds.size} 题，此操作不可恢复。
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowBatchDeleteConfirm(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100"
              >
                取消
              </button>
              <button
                type="button"
                onClick={batchRemove}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 active:bg-red-700"
              >
                确定删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 录入结果（查重反馈）弹层 */}
      {collectResult && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="collect-result-title"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <h3 id="collect-result-title" className="text-lg font-semibold text-gray-800">
              录入结果
            </h3>
            <div className="mt-3 space-y-2 text-sm">
              {collectResult.createdIndices.length > 0 && (
                <p className="text-gray-700">
                  <span className="font-medium text-green-600">新录入 {collectResult.createdIndices.length} 题：</span>
                  第 {collectResult.createdIndices.join('、')} 题
                </p>
              )}
              {collectResult.skippedIndices.length > 0 && (
                <p className="text-gray-700">
                  <span className="font-medium text-amber-600">与题库重复已跳过 {collectResult.skippedIndices.length} 题：</span>
                  第 {collectResult.skippedIndices.join('、')} 题
                </p>
              )}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setCollectResult(null)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
