import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Latex from 'react-latex-next'
import {
  ChevronDown,
  ChevronUp,
  Star,
  Edit,
  RefreshCw,
  Loader2,
  BookOpen,
  BookMarked,
  Check,
  X,
  MessageCircle,
  ClipboardList,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { collectQuestion, createMistake, getExams, updateExam, saveExam } from '../services/api'
import { useStudent } from '../contexts/StudentContext'
import { normalizeLatexForKaTeX } from '../utils/latex'
import 'katex/dist/katex.min.css'

const DIFFICULTY_MAP = {
  L1: '基础',
  L2: '简单',
  L3: '综合',
  L4: '较难',
  L5: '竞赛',
}

/** 按【考点】【思路】【步骤】【结论】【难度等级】分段，用于结构化展示解析；不展示思考过程 */
const ANALYSIS_LABELS = ['【考点】', '【思路】', '【步骤】', '【结论】', '【难度等级】']

/** 将解析文本中的字面量 \n（反斜杠+n）转为实际换行，避免界面显示为 \n */
function normalizeAnalysisText(text) {
  if (!text || typeof text !== 'string') return ''
  return text.replace(/\\n/g, '\n')
}

/** 将【步骤】内容按 1) 2) 3) 拆成多段，便于每问换行显示。仅在行首的 1) 2) 3) 处切分，且不在 $...$ 内切分，避免公式内 30) 等被误切导致乱码 */
function splitSteps(content) {
  if (!content || typeof content !== 'string') return []
  let insideLatex = false
  const parts = []
  let start = 0
  // 匹配 $ 或“行首 + 数字+)”（避免把公式里的 30) 当成步骤号）
  const re = /\$|(?:^|[\r\n])\s*(\d+\))/g
  let m
  while ((m = re.exec(content)) !== null) {
    if (m[0] === '$') {
      insideLatex = !insideLatex
      continue
    }
    if (m[1] && !insideLatex) {
      const chunk = content.slice(start, m.index).trim()
      if (chunk) parts.push(chunk)
      start = m.index
    }
  }
  const tail = content.slice(start).trim()
  if (tail) parts.push(tail)
  return parts.length ? parts : [content.trim()].filter(Boolean)
}

function parseAnalysisSections(text) {
  if (!text || typeof text !== 'string') return null
  const trimmed = normalizeAnalysisText(text).trim()
  const first = ANALYSIS_LABELS.find((l) => trimmed.includes(l))
  if (!first) return null
  const sections = []
  for (let i = 0; i < ANALYSIS_LABELS.length; i++) {
    const label = ANALYSIS_LABELS[i]
    const nextLabel = ANALYSIS_LABELS[i + 1]
    const start = trimmed.indexOf(label)
    if (start === -1) continue
    const contentStart = start + label.length
    const contentEnd = nextLabel ? trimmed.indexOf(nextLabel, contentStart) : trimmed.length
    const content = (contentEnd === -1 ? trimmed.slice(contentStart) : trimmed.slice(contentStart, contentEnd)).trim()
    if (content) sections.push({ label: label.replace(/【|】/g, ''), content })
  }
  return sections.length ? sections : null
}

/** 将题目拼成一段文本，供「问 AI」带题对话使用 */
function buildQuestionTextForChat(data) {
  if (!data) return ''
  const content = (data.content ?? data.body ?? '').trim()
  const options = Array.isArray(data.options) ? data.options : []
  const optStr = options.length
    ? '\n选项：' + options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')
    : ''
  const answer = (data.answer ?? '').trim()
  return content + optStr + (answer ? '\n答案：' + answer : '')
}

/** 从 data 构建可编辑副本（content, options, answer, analysis 及其余字段） */
function cloneEditData(data) {
  if (!data) return null
  const opts = Array.isArray(data.options) ? [...data.options] : []
  while (opts.length < 4) opts.push('')
  return {
    content: (data.content ?? data.body ?? '').trim(),
    options: opts.slice(0, 4),
    answer: (data.answer ?? '').trim(),
    analysis: (data.analysis ?? '').trim(),
    question_type: data.question_type,
    difficulty: data.difficulty,
    knowledge_point: data.knowledge_point,
    source: data.source,
    student_id: data.student_id,
    tags: Array.isArray(data.tags) ? [...data.tags] : [],
  }
}

/**
 * 试卷题目卡片：Header（序号 + 题型/难度 pill + 工具栏）、题干、选项网格、解析折叠；支持内联编辑。
 * Props: data, index, actions, expanded, onToggle, onRegenerate, regenerating, onVerify, verifying, collected, onUpdate(updatedQuestionData), mistakeSourceLabel(来源标签，如 智能出题/收藏题库)
 */
export default function QuestionCard({
  data,
  index,
  actions,
  expanded: controlledExpanded,
  onToggle,
  onRegenerate,
  regenerating,
  onVerify,
  verifying,
  collected: controlledCollected,
  onUpdate,
  mistakeSourceLabel = '智能出题',
}) {
  const { currentStudent } = useStudent()
  const navigate = useNavigate()
  const [internalExpanded, setInternalExpanded] = useState(false)
  const [internalCollected, setInternalCollected] = useState(false)
  const [collecting, setCollecting] = useState(false)
  const [addingToMistake, setAddingToMistake] = useState(false)
  const [addingToHomework, setAddingToHomework] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const verifyingActive = verifying ?? isVerifying
  const isControlled = controlledExpanded !== undefined && onToggle != null
  const showAnalysis = isControlled ? controlledExpanded : internalExpanded
  const setShowAnalysis = isControlled ? onToggle : setInternalExpanded
  const collected = controlledCollected ?? internalCollected

  useEffect(() => {
    if (isEditing && data) setEditData(cloneEditData(data))
  }, [isEditing, data])

  if (!data) return null

  const content = (isEditing ? editData?.content : data.content ?? data.body ?? '') ?? ''
  const options = (isEditing ? editData?.options : data.options ?? []) ?? []
  const analysis = isEditing ? (editData?.analysis ?? '') : normalizeAnalysisText(data.analysis ?? '')
  const answer = isEditing ? (editData?.answer ?? '') : (data.answer ?? '')
  const isChoice = options.length > 0
  const difficultyLabel =
    data.difficulty != null ? DIFFICULTY_MAP[data.difficulty] ?? data.difficulty : '综合'
  const questionTypeLabel =
    (data.question_type === '选择' || data.question_type === '填空' || data.question_type === '解答')
      ? ({ 选择: '选择题', 填空: '填空题', 解答: '解答题' }[data.question_type])
      : (data.question_type ?? (isChoice ? '选择题' : '解答题'))
  const knowledgePointLabel = (data.knowledge_point ?? '').trim() || '未标注'

  const getOptionText = (opt) => {
    if (typeof opt !== 'string') return String(opt ?? '')
    const s = opt.trim()
    const m = s.match(/^[A-Za-z]\.\s*/)
    return m ? s.slice(m[0].length).trim() || s : s
  }

  const iconBtnClass =
    'p-1.5 rounded-md text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors'

  const handleStartEdit = () => {
    setEditData(cloneEditData(data))
    setIsEditing(true)
  }

  const handleSaveEdit = () => {
    if (!editData) return
    const payload = {
      ...editData,
      options: isChoice ? editData.options.filter((o) => String(o).trim() !== '') : [],
    }
    onUpdate?.(payload)
    setIsEditing(false)
  }

  const handleCancelEdit = () => {
    setEditData(cloneEditData(data))
    setIsEditing(false)
  }

  const handleVerify = async () => {
    if (!onVerify || verifyingActive) return
    if (onUpdate == null) {
      toast.error('当前页面不支持校对')
      return
    }
    setIsVerifying(true)
    try {
      const payload = {
        content: (data.content ?? data.body ?? '').trim() || '（无题干）',
        options: Array.isArray(data.options) ? data.options : [],
        answer: (data.answer ?? '').trim() || '',
        analysis: (data.analysis ?? '').trim() || '',
        difficulty: data.difficulty ?? 'L3',
        question_type: data.question_type ?? (Array.isArray(data.options) && data.options.length > 0 ? '选择' : '解答'),
      }
      const result = await onVerify(payload)
      if (result && typeof result === 'object') {
        const normalized = {
          ...result,
          question_type: result.question_type ?? result.type ?? payload.question_type,
        }
        onUpdate(normalized)
        toast.success('✅ 校对完成，已优化解析')
      }
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.message || '校对失败'
      toast.error(typeof msg === 'string' ? msg : '校对失败，请重试')
    } finally {
      setIsVerifying(false)
    }
  }

  const handleCollect = async () => {
    if (collected || collecting) return
    const opts = Array.isArray(options) ? options : []
    const payload = {
      content: (content || '').trim() || '（无题干）',
      options: opts,
      answer: (data.answer ?? '').trim() || '',
      analysis: (data.analysis ?? '').trim() || '',
      question_type: data.question_type ?? (opts.length > 0 ? '选择' : '解答'),
      difficulty: data.difficulty ?? 'L3',
      knowledge_point: (data.knowledge_point ?? '').trim() || '综合',
      source: (data.source ?? 'AI生成').trim() || 'AI生成',
      student_id: currentStudent?.id ?? data.student_id ?? null,
      tags: Array.isArray(data.tags) ? data.tags : [],
    }
    setCollecting(true)
    try {
      await collectQuestion(payload)
      toast.success('已加入本地题库')
      setInternalCollected(true)
    } catch (err) {
      const msg = err.response?.data?.detail ?? err.message
      toast.error(typeof msg === 'string' ? msg : '收藏失败，请重试')
    } finally {
      setCollecting(false)
    }
  }

  const handleAddToMistake = async () => {
    if (addingToMistake) return
    if (!currentStudent?.id) {
      toast.error('请先选择学生后再加入错题本')
      return
    }
    const content = (data.content ?? data.body ?? '').trim() || '（无题干）'
    const topic = (data.knowledge_point ?? '').trim() || '综合'
    const source = (data.source ?? mistakeSourceLabel).trim() || mistakeSourceLabel
    const solution = (data.analysis ?? data.answer ?? '').trim() || undefined
    const options = Array.isArray(data.options) && data.options.length > 0 ? data.options : undefined
    setAddingToMistake(true)
    try {
      await createMistake({
        student_id: currentStudent.id,
        topic,
        source,
        content,
        options,
        solution,
      })
      toast.success('已加入错题本')
    } catch (err) {
      const msg = err.response?.data?.detail ?? err.message
      toast.error(typeof msg === 'string' ? msg : '加入错题本失败')
    } finally {
      setAddingToMistake(false)
    }
  }

  /** 将当前题目转为试卷题目格式 */
  const dataToQuestionSnapshot = () => ({
    content: (data.content ?? data.body ?? '').trim() || '（无题干）',
    options: Array.isArray(data.options) ? data.options : [],
    answer: (data.answer ?? '').trim() || '',
    analysis: (data.analysis ?? '').trim() || '',
    knowledge_point: (data.knowledge_point ?? '').trim() || '综合',
    question_type: data.question_type ?? (Array.isArray(data.options) && data.options.length > 0 ? '选择' : '解答'),
    difficulty: (data.difficulty ?? 'L3').toString().startsWith('L') ? data.difficulty : 'L3',
  })

  const handleAddToTodayHomework = async () => {
    if (addingToHomework) return
    setAddingToHomework(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const res = await getExams({ assignment_date: today })
      const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : [])
      const draft = list.find((e) => e.student_id == null)
      const flat = draft?.questions
        ? Array.isArray(draft.questions)
          ? draft.questions
          : (draft.questions?.questions || [])
        : []
      const newQuestion = dataToQuestionSnapshot()
      if (draft?.id) {
        await updateExam(draft.id, { questions: [...flat, newQuestion] })
      } else {
        await saveExam({
          title: `${today} 作业`,
          student_id: null,
          questions: [newQuestion],
          assignment_date: today,
        })
      }
      toast.success('已加入今日作业')
    } catch (err) {
      const msg = err.response?.data?.detail ?? err.message
      toast.error(typeof msg === 'string' ? msg : '加入今日作业失败')
    } finally {
      setAddingToHomework(false)
    }
  }

  const getRankBadgeClass = (diff) => {
    switch (diff) {
      case 'L1': return 'rank-badge-l1'
      case 'L2': return 'rank-badge-l2'
      case 'L3': return 'rank-badge-l3'
      case 'L4': return 'rank-badge-l4'
      case 'L5': return 'rank-badge-l5'
      default: return 'rank-badge-l3'
    }
  }

  return (
    <article className="pro-glass-card rounded-3xl overflow-hidden transition-all duration-300">
      {/* Header: 序号 + 游戏化 Rank 勋章 + 工具栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-violet-600 text-xs font-black text-white shadow-md shadow-indigo-500/25">
            {index ?? 1}
          </span>
          <span className="rounded-full bg-slate-100 border border-slate-200/80 px-3 py-0.5 text-xs font-extrabold text-slate-700">
            {questionTypeLabel}
          </span>
          <span className={`rounded-full px-3 py-0.5 text-xs font-black uppercase tracking-wider ${getRankBadgeClass(difficulty)}`}>
            {difficulty} {difficultyLabel}
          </span>
          <span className="rounded-full bg-indigo-50 border border-indigo-200/70 px-3 py-0.5 text-xs font-bold text-indigo-700" title="知识点">
            知识点：{knowledgePointLabel}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0 bg-white/90 border border-slate-200/80 rounded-2xl p-1 shadow-2xs">
          <button
            type="button"
            onClick={handleAddToMistake}
            disabled={addingToMistake}
            className="p-1.5 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all active:scale-95"
            title="加入错题本"
            aria-label="加入错题本"
          >
            {addingToMistake ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BookMarked className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={handleAddToTodayHomework}
            disabled={addingToHomework}
            className="p-1.5 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all active:scale-95"
            title="加入今日作业"
            aria-label="加入今日作业"
          >
            {addingToHomework ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ClipboardList className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={handleCollect}
            disabled={collecting}
            className={collected ? 'p-1.5 rounded-xl text-amber-500 hover:text-amber-600 hover:bg-amber-50 transition-all' : 'p-1.5 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all active:scale-95'}
            title={collected ? '已收藏' : '收藏'}
            aria-label={collected ? '已收藏' : '收藏'}
          >
            {collecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Star className={`h-4 w-4 ${collected ? 'fill-amber-400' : ''}`} />
            )}
          </button>
          <button
            type="button"
            onClick={handleStartEdit}
            className="p-1.5 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all active:scale-95"
            title="编辑"
            aria-label="编辑"
          >
            <Edit className="h-4 w-4" />
          </button>
          {isEditing && (
            <>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="p-1.5 rounded-xl text-emerald-600 hover:bg-emerald-50 transition-all"
                title="保存"
                aria-label="保存"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="p-1.5 rounded-xl text-rose-600 hover:bg-rose-50 transition-all"
                title="取消"
                aria-label="取消"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          )}
          <button
            type="button"
            className="p-1.5 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all active:scale-95"
            title="重新生成"
            aria-label="重新生成"
            onClick={onRegenerate}
            disabled={regenerating || !onRegenerate}
          >
            {regenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            className="p-1.5 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all active:scale-95"
            title={verifyingActive ? '验算中...' : '校对'}
            aria-label={verifyingActive ? '验算中' : '校对'}
            onClick={handleVerify}
            disabled={verifyingActive || !onVerify || !onUpdate}
          >
            {verifyingActive ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BookOpen className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            className="p-1.5 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all active:scale-95"
            title="问 AI"
            aria-label="问 AI"
            onClick={() =>
              navigate('/chat', { state: { contextQuestion: buildQuestionTextForChat(data) } })
            }
          >
            <MessageCircle className="h-4 w-4" />
          </button>
          {actions && <div className="ml-1 pl-1 border-l border-slate-200">{actions}</div>}
        </div>
      </div>

      {/* 题干容器：电光蓝左加重线 */}
      <div className="mx-5 my-4 rounded-r-2xl border-l-4 border-indigo-500 bg-slate-50/60 p-4 text-slate-800 leading-relaxed font-semibold">
        {isEditing ? (
          <textarea
            value={editData?.content ?? ''}
            onChange={(e) => setEditData((d) => (d ? { ...d, content: e.target.value } : d))}
            rows={6}
            className="w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            placeholder="题目内容（支持 LaTeX，如 $x^2$）"
          />
        ) : (
          <Latex>{normalizeLatexForKaTeX(content || '（题目内容）')}</Latex>
        )}
      </div>

      {/* 题目附图 */}
      {Array.isArray(data.images) && data.images.length > 0 && (
        <div className="px-5 pb-4 flex flex-wrap gap-2">
          {data.images.map((src, idx) => (
            <img
              key={idx}
              src={src}
              alt="题目附图"
              loading="lazy"
              className="max-w-full max-h-80 object-contain rounded-2xl border border-slate-200 shadow-sm"
            />
          ))}
        </div>
      )}

      {/* 选项：查看为 Grid */}
      {isChoice && (
        <div className="px-5 pb-4">
          {isEditing ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-700">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <input
                    type="text"
                    value={editData?.options?.[i] ?? ''}
                    onChange={(e) => {
                      const next = [...(editData?.options ?? ['', '', '', ''])]
                      next[i] = e.target.value
                      setEditData((d) => (d ? { ...d, options: next } : d))
                    }}
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    placeholder={`选项 ${String.fromCharCode(65 + i)}`}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {options.map((opt, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 hover:border-indigo-300 hover:bg-indigo-50/40 transition-all"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white border border-slate-200 text-xs font-black text-slate-700 shadow-xs">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="min-w-0 text-slate-800 text-sm leading-relaxed font-medium">
                    <Latex>{normalizeLatexForKaTeX(getOptionText(opt))}</Latex>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 答案：编辑模式 */}
      {isEditing && (
        <div className="px-5 pb-4">
          <label className="mb-1.5 block text-xs font-bold text-slate-500">答案</label>
          <input
            type="text"
            value={editData?.answer ?? ''}
            onChange={(e) => setEditData((d) => (d ? { ...d, answer: e.target.value } : d))}
            className="w-full max-w-md rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            placeholder="答案（选择题可填 A/B/C/D，支持 LaTeX）"
          />
        </div>
      )}

      {/* Footer: 查看解析 */}
      <div className="border-t border-slate-100">
        <button
          type="button"
          onClick={() => (isControlled ? onToggle(!showAnalysis) : setInternalExpanded((v) => !v))}
          className="flex w-full items-center justify-between gap-2 px-5 py-3 text-left text-xs font-extrabold text-indigo-600 hover:bg-indigo-50/60 transition-colors cursor-pointer"
        >
          <span>{isEditing ? '解析内容' : '查看详细解析'}</span>
          {showAnalysis || isEditing ? (
            <ChevronUp className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0" />
          )}
        </button>
        {(showAnalysis || isEditing) && (
          <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-4 space-y-3">
            <p className="text-xs font-black text-slate-500 tracking-wide">详细解析与解题步骤</p>
            {isEditing ? (
              <textarea
                value={editData?.analysis ?? ''}
                onChange={(e) => setEditData((d) => (d ? { ...d, analysis: e.target.value } : d))}
                rows={8}
                className="w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                placeholder="解析内容（支持 LaTeX）"
              />
            ) : analysis ? (
                (() => {
                  const sections = parseAnalysisSections(analysis)
                  if (sections && sections.length > 0) {
                    return sections.map(({ label, content }) => {
                      const isSteps = label === '步骤'
                      const steps = isSteps ? splitSteps(content) : []
                      return (
                        <div key={label} className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
                          <span className="inline-block rounded-lg bg-indigo-600 px-2.5 py-0.5 text-xs font-bold text-white mb-2">{label}</span>
                          {isSteps && steps.length > 0 ? (
                            <div className="space-y-2 overflow-visible">
                              {steps.map((step, i) => (
                                <div key={i} className="text-slate-800 text-sm leading-relaxed min-h-[1.5em] overflow-visible">
                                  <Latex>{normalizeLatexForKaTeX(step)}</Latex>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-slate-800 text-sm leading-relaxed">
                              <Latex>{normalizeLatexForKaTeX(content)}</Latex>
                            </div>
                          )}
                        </div>
                      )
                    })
                  }
                  return <Latex>{normalizeLatexForKaTeX(analysis)}</Latex>
                })()
              ) : (
                <span className="text-slate-400 text-xs font-semibold">暂无详细解析</span>
              )}
          </div>
        )}
      </div>
    </article>
  )
}

