import { useState, useCallback, useEffect } from 'react'
import { RefreshCcw, FileText, Search, X, BookOpen, Target, GraduationCap, AlertTriangle, Lock } from 'lucide-react'
import { MATH_TOPICS } from '../constants/math-topics'
import TextbookSelector from './TextbookSelector'

const SCENARIO_ICONS = {
  BookOpen,
  Target,
  School: GraduationCap,
  Search,
  AlertTriangle,
}

const SCENARIOS = [
  { id: 'default', title: '不选择', desc: '不指定场景，通用生成', icon: 'BookOpen' },
  { id: 'specialized', title: '专项突破', desc: '针对薄弱知识点，生成同类型变式', icon: 'Target' },
  { id: 'sync', title: '同步辅导', desc: '跟随学校教学进度，巩固课堂知识', icon: 'School' },
  { id: 'assessment', title: '新生摸底', desc: '快速了解学生水平，生成诊断测试', icon: 'Search' },
  { id: 'error_analysis', title: '错题分析', desc: '针对易错点，生成陷阱题与解析', icon: 'AlertTriangle' },
]

const QUESTION_TYPES = [
  { value: '综合', label: '综合' },
  { value: '选择', label: '选择题' },
  { value: '填空', label: '填空题' },
  { value: '解答', label: '解答题' },
]

const DIFFICULTY_LABELS = {
  1: 'L1 基础',
  2: 'L2 简单',
  3: 'L3 综合',
  4: 'L4 较难',
  5: 'L5 竞赛',
}

const DIFFICULTY_DESCRIPTIONS = {
  1: 'L1: 基础概念，直接应用',
  2: 'L2: 简单运算，一步到位',
  3: 'L3: 综合应用，计算量中等',
  4: 'L4: 较难综合，多步推理',
  5: 'L5: 竞赛拓展，思维要求高',
}

const COUNT_OPTIONS = [
  { value: 1, label: '1题' },
  { value: 3, label: '3题' },
  { value: 5, label: '5题' },
  { value: 10, label: '10题' },
]

const GRADES = Object.keys(MATH_TOPICS)
const SEMESTERS = ['上册', '下册']

const REF_SUMMARY_LEN = 40

const KNOWLEDGE_MODE = {
  textbook: 'textbook',
  free: 'free',
}

export default function FilterPanel({
  onFilterChange,
  onGenerate,
  loading = false,
  onGenerateExam,
  isGeneratingExam = false,
  referenceQuestion = null,
  onClearReference,
  onOpenSelectModal,
  disableKnowledgePoint = false,
  lockedKnowledgePointLabel = '',
  useKnowledgeBase = false,
  onUseKnowledgeBaseChange,
  knowledgePointFromParent = '',
  selectedPoints = [],
  onAddPoint,
  onRemovePoint,
}) {
  const [grade, setGrade] = useState('八年级')
  const [semester, setSemester] = useState('上册')
  const [selectedTopics, setSelectedTopics] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [scenario, setScenario] = useState('default')
  const [questionType, setQuestionType] = useState('综合')
  const [difficulty, setDifficulty] = useState(3)
  const [count, setCount] = useState(3)
  const [customCount, setCustomCount] = useState('')
  const [knowledgeInputMode, setKnowledgeInputMode] = useState(() =>
    scenario === 'sync' ? KNOWLEDGE_MODE.textbook : scenario === 'specialized' ? KNOWLEDGE_MODE.free : KNOWLEDGE_MODE.textbook
  )
  const [freeInputValue, setFreeInputValue] = useState('')

  const knowledgePoint = selectedTopics.join(' ')
  const currentKnowledgePoint =
    knowledgeInputMode === KNOWLEDGE_MODE.free ? freeInputValue.trim() : (knowledgePointFromParent ?? '')

  useEffect(() => {
    if (knowledgeInputMode === KNOWLEDGE_MODE.free) {
      onFilterChange?.({ knowledge_point: freeInputValue.trim() })
    }
  }, [knowledgeInputMode, freeInputValue, onFilterChange])


  const emitFilter = useCallback(
    (overrides = {}) => {
      const cfg = {
        knowledge_point: (overrides.knowledge_point ?? currentKnowledgePoint).trim(),
        scenario: overrides.scenario ?? scenario,
        question_type: overrides.question_type ?? questionType,
        difficulty: overrides.difficulty ?? difficulty,
        count: overrides.count ?? count,
        customCount: overrides.customCount ?? customCount,
      }
      onFilterChange?.(cfg)
    },
    [currentKnowledgePoint, scenario, questionType, difficulty, count, customCount, onFilterChange]
  )

  const topicList = MATH_TOPICS[grade]?.[semester] ?? []
  const filteredTopics = searchTerm.trim()
    ? topicList.filter((t) => t.includes(searchTerm.trim()))
    : topicList

  const toggleTopic = useCallback((topic) => {
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((x) => x !== topic) : [...prev, topic]
    )
  }, [])

  const clearSelected = useCallback(() => setSelectedTopics([]), [])

  const isAssessmentMode = scenario === 'assessment'

  const handleScenarioChange = useCallback(
    (s) => {
      setScenario(s.id)
      if (s.id === 'sync') setKnowledgeInputMode(KNOWLEDGE_MODE.textbook)
      if (s.id === 'specialized') {
        setKnowledgeInputMode(KNOWLEDGE_MODE.free)
        setFreeInputValue((prev) => prev || knowledgePointFromParent || '')
      }
      if (s.id === 'assessment') {
        setCount(10)
        setCustomCount('')
        onFilterChange?.({
          knowledge_point: currentKnowledgePoint.trim(),
          scenario: s.id,
          question_type: questionType,
          difficulty,
          count: 10,
        })
      } else {
        onFilterChange?.({ scenario: s.id })
      }
    },
    [currentKnowledgePoint, questionType, difficulty, onFilterChange, knowledgePointFromParent]
  )

  const handleTypeChange = useCallback(
    (value) => {
      setQuestionType(value)
      onFilterChange?.({ knowledge_point: currentKnowledgePoint.trim(), question_type: value, difficulty, count })
    },
    [currentKnowledgePoint, difficulty, count, onFilterChange]
  )

  const handleDifficultyChange = useCallback(
    (e) => {
      const v = Number(e.target.value)
      setDifficulty(v)
      onFilterChange?.({ knowledge_point: currentKnowledgePoint.trim(), question_type: questionType, difficulty: v, count })
    },
    [currentKnowledgePoint, questionType, count, onFilterChange]
  )

  const handleCountChange = useCallback(
    (value) => {
      setCount(value)
      setCustomCount('')
      onFilterChange?.({ knowledge_point: currentKnowledgePoint.trim(), question_type: questionType, difficulty, count: value })
    },
    [currentKnowledgePoint, questionType, difficulty, onFilterChange]
  )

  const handleCustomCountChange = useCallback(
    (e) => {
      const v = e.target.value.replace(/\D/g, '')
      setCustomCount(v)
      const num = parseInt(v, 10)
      if (!Number.isNaN(num) && num >= 1 && num <= 20) {
        onFilterChange?.({ knowledge_point: currentKnowledgePoint.trim(), question_type: questionType, difficulty, count: num })
      }
    },
    [currentKnowledgePoint, questionType, difficulty, onFilterChange]
  )

  const handleGenerate = useCallback(() => {
    const num = customCount ? parseInt(customCount, 10) : count
    const finalCount = Number.isNaN(num) || num < 1 ? count : Math.min(20, Math.max(1, num))
    onGenerate?.({
      knowledge_point: currentKnowledgePoint.trim(),
      scenario,
      question_type: questionType,
      difficulty: `L${difficulty}`,
      count: finalCount,
    })
  }, [currentKnowledgePoint, scenario, questionType, difficulty, count, customCount, onGenerate])

  return (
    <div
      className="backdrop-blur-xl p-5 min-h-full"
      style={{
        background: 'color-mix(in srgb, var(--color-bg-card) 95%, transparent)',
        borderRight: '1px solid var(--color-border-primary)'
      }}
    >
      <h3 className="mb-4 text-xs font-black uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>智能出题引擎参数</h3>

      {/* 知识点：年级 / 学期 + 已选标签 + 待选列表与搜索；锁定态显示只读考点 */}
      <div className="mb-5">
        <label className="mb-2 block text-xs font-bold" style={{ color: 'var(--color-text-primary)' }}>考点与知识点</label>

        {disableKnowledgePoint ? (
          <div
            className="rounded-2xl p-3.5 text-xs"
            style={{
              border: '1px solid var(--color-border-primary)',
              backgroundColor: 'var(--color-bg-panel-muted)',
              color: 'var(--color-text-secondary)'
            }}
          >
            <div className="flex items-center gap-2 font-bold" style={{ color: 'var(--color-primary-500)' }}>
              <Lock className="h-4 w-4 shrink-0" />
              <span>已锁定参考题考点</span>
            </div>
            <p className="mt-1.5 truncate font-medium" style={{ color: 'var(--color-text-primary)' }} title={lockedKnowledgePointLabel || '系统自动分析考点'}>
              {lockedKnowledgePointLabel || '系统自动分析考点'}
            </p>
          </div>
        ) : (
          <>
        {/* 切换模式：教材同步（Selector）| 自由输入（年级+标签） */}
        <div className="mb-3 flex gap-1.5">
          <button
            type="button"
            onClick={() => setKnowledgeInputMode(KNOWLEDGE_MODE.textbook)}
            disabled={loading}
            className="flex-1 rounded-xl px-3 py-2 text-xs font-bold transition-all"
            style={
              knowledgeInputMode === KNOWLEDGE_MODE.textbook
                ? {
                    border: '1px solid var(--color-primary-600)',
                    backgroundColor: 'var(--color-primary-600)',
                    color: 'white',
                    boxShadow: '0 4px 14px 0 rgba(79, 70, 229, 0.2)'
                  }
                : {
                    border: '1px solid var(--color-border-primary)',
                    backgroundColor: 'var(--color-bg-card)',
                    color: 'var(--color-text-secondary)'
                  }
            }
          >
            教材同步
          </button>
          <button
            type="button"
            onClick={() => {
              setKnowledgeInputMode(KNOWLEDGE_MODE.free)
              setFreeInputValue((prev) => prev || knowledgePointFromParent || '')
            }}
            disabled={loading}
            className="flex-1 rounded-xl px-3 py-2 text-xs font-bold transition-all"
            style={
              knowledgeInputMode === KNOWLEDGE_MODE.free
                ? {
                    border: '1px solid var(--color-primary-600)',
                    backgroundColor: 'var(--color-primary-600)',
                    color: 'white',
                    boxShadow: '0 4px 14px 0 rgba(79, 70, 229, 0.2)'
                  }
                : {
                    border: '1px solid var(--color-border-primary)',
                    backgroundColor: 'var(--color-bg-card)',
                    color: 'var(--color-text-secondary)'
                  }
            }
          >
            自由输入
          </button>
        </div>

        {knowledgeInputMode === KNOWLEDGE_MODE.textbook ? (
          <>
          <TextbookSelector
            onChange={(sectionLabel) => onFilterChange?.({ knowledge_point: sectionLabel })}
            onAdd={onAddPoint}
            disabled={loading}
          />
          {/* 已选知识点：多选标签 + 手动输入 */}
          {selectedPoints.length > 0 && (
            <div
              className="mt-3 rounded-2xl p-3"
              style={{
                border: '1px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)',
                backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)'
              }}
            >
              <p className="mb-2 text-xs font-bold" style={{ color: 'var(--color-primary-700)' }}>已选知识点标签</p>
              <div className="flex flex-wrap gap-2">
                {selectedPoints.map((point, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold"
                    style={{
                      border: '1px solid color-mix(in srgb, var(--color-primary-500) 30%, transparent)',
                      backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 20%, transparent)',
                      color: 'var(--color-primary-700)'
                    }}
                  >
                    {point}
                    <button
                      type="button"
                      onClick={() => onRemovePoint?.(i)}
                      disabled={loading}
                      className="rounded-full p-0.5 transition-colors disabled:opacity-50"
                      style={{ color: 'var(--color-primary-700)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--color-primary-500) 30%, transparent)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                      aria-label={`移除${point}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="mt-2">
            <input
              type="text"
              placeholder="手动输入知识点，按回车添加"
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                const v = e.target.value?.trim()
                if (v) onAddPoint?.(v)
                e.target.value = ''
              }}
              className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 disabled:opacity-60"
              style={{
                border: '1px solid var(--color-border-primary)',
                backgroundColor: 'var(--color-bg-card)',
                color: 'var(--color-text-primary)'
              }}
            />
          </div>
          </>
        ) : (
          <input
            type="text"
            value={freeInputValue}
            onChange={(e) => {
              const v = e.target.value
              setFreeInputValue(v)
              onFilterChange?.({ knowledge_point: v.trim() })
            }}
            placeholder="如：期末复习、二次函数综合"
            disabled={loading}
            className="w-full rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2"
            style={{
              border: '1px solid var(--color-border-primary)',
              backgroundColor: 'var(--color-bg-card)',
              color: 'var(--color-text-primary)'
            }}
          />
        )}
          </>
        )}
      </div>

      {/* 备课场景 */}
      <div className="mb-5">
        <label className="mb-2 block text-xs font-bold" style={{ color: 'var(--color-text-primary)' }}>备课模式与场景</label>
        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {SCENARIOS.map((s) => {
            const IconComponent = SCENARIO_ICONS[s.icon] || BookOpen
            const selected = scenario === s.id
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => handleScenarioChange(s)}
                disabled={loading}
                className="flex w-full items-start gap-3 rounded-2xl px-3.5 py-2.5 text-left transition-all"
                style={
                  selected
                    ? {
                        border: '1px solid color-mix(in srgb, var(--color-primary-500) 80%, transparent)',
                        backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)',
                        color: 'var(--color-text-primary)',
                        fontWeight: 'bold',
                        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                      }
                    : {
                        border: '1px solid var(--color-border-primary)',
                        backgroundColor: 'var(--color-bg-card)',
                        color: 'var(--color-text-primary)'
                      }
                }
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                  style={
                    selected
                      ? {
                          backgroundColor: 'var(--color-primary-600)',
                          border: '1px solid var(--color-primary-600)',
                          color: 'white'
                        }
                      : {
                          backgroundColor: 'var(--color-bg-panel)',
                          border: '1px solid var(--color-border-primary)',
                          color: 'var(--color-text-secondary)'
                        }
                  }
                >
                  <IconComponent className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-extrabold">{s.title}</p>
                  <p className="mt-0.5 text-[11px] leading-tight" style={{ color: 'var(--color-text-secondary)' }}>{s.desc}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* 题目类型 */}
      <div className="mb-5">
        <label className="mb-2 block text-xs font-bold" style={{ color: 'var(--color-text-primary)' }}>题目类型</label>
        <div className="grid grid-cols-2 gap-2">
          {QUESTION_TYPES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleTypeChange(value)}
              disabled={loading}
              className="rounded-xl px-3 py-2 text-xs font-bold transition-all"
              style={
                questionType === value
                  ? {
                      border: '1px solid transparent',
                      backgroundColor: 'var(--color-primary-600)',
                      color: 'white',
                      boxShadow: '0 4px 14px 0 rgba(79, 70, 229, 0.2)'
                    }
                  : {
                      border: '1px solid var(--color-border-primary)',
                      backgroundColor: 'var(--color-bg-card)',
                      color: 'var(--color-text-secondary)'
                    }
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 难度 */}
      <div className="mb-5">
        <label className="mb-2 block text-xs font-bold" style={{ color: 'var(--color-text-primary)' }}>难度等级梯度</label>
        {isAssessmentMode ? (
          <div
            className="rounded-2xl p-3.5"
            style={{
              border: '1px solid var(--color-border-primary)',
              backgroundColor: 'var(--color-bg-panel)'
            }}
          >
            <p className="text-xs font-bold" style={{ color: 'var(--color-text-primary)' }}>全难度覆盖</p>
            <p className="mt-0.5 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>摸底测试将自动包含 L1～L5 梯度</p>
          </div>
        ) : (
          <>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={difficulty}
              onChange={handleDifficultyChange}
              disabled={loading}
              className="range-thumb h-2 w-full cursor-pointer appearance-none rounded-full"
              style={{
                background: `linear-gradient(to right, var(--color-primary-500) 0%, var(--color-primary-500) ${((difficulty - 1) / 4) * 100}%, var(--color-bg-panel-muted) ${((difficulty - 1) / 4) * 100}%, var(--color-bg-panel-muted) 100%)`,
              }}
            />
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <p className="text-xs font-black" style={{ color: 'var(--color-primary-600)' }}>{DIFFICULTY_LABELS[difficulty]}</p>
              <p className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>{DIFFICULTY_DESCRIPTIONS[difficulty]}</p>
            </div>
          </>
        )}
      </div>

      {/* 数量 */}
      <div className="mb-6">
        <label className="mb-2 block text-xs font-bold" style={{ color: 'var(--color-text-primary)' }}>题目数量</label>
        <div className="flex flex-wrap items-center gap-2">
          {COUNT_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleCountChange(value)}
              disabled={loading}
              className="rounded-xl px-3 py-2 text-xs font-bold transition-all"
              style={
                !customCount && count === value
                  ? {
                      border: '1px solid var(--color-primary-600)',
                      backgroundColor: 'var(--color-primary-600)',
                      color: 'white',
                      boxShadow: '0 4px 14px 0 rgba(79, 70, 229, 0.2)'
                    }
                  : {
                      border: '1px solid var(--color-border-primary)',
                      backgroundColor: 'var(--color-bg-card)',
                      color: 'var(--color-text-secondary)'
                    }
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 底部按键 */}
      <div className="space-y-3 pt-5" style={{ borderTop: '1px solid var(--color-border-primary)' }}>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="btn-gradient-pro flex h-[48px] w-full items-center justify-center gap-2 rounded-2xl text-xs font-black tracking-wide uppercase"
        >
          <RefreshCcw className={`h-4 w-4 shrink-0 ${loading ? 'animate-spin' : ''}`} />
          {loading ? '生成中…' : '一键生成练习题'}
        </button>
        <button
          type="button"
          onClick={() => onGenerateExam?.()}
          disabled={loading || isGeneratingExam}
          className="flex h-[48px] w-full items-center justify-center gap-2 rounded-2xl text-xs font-extrabold transition-all active:scale-[0.98] disabled:opacity-60"
          style={{
            border: '1px solid color-mix(in srgb, var(--color-primary-500) 30%, transparent)',
            backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)',
            color: 'var(--color-primary-700)'
          }}
          onMouseEnter={(e) => {
            if (!loading && !isGeneratingExam) {
              e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--color-primary-500) 20%, transparent)'
            }
          }}
          onMouseLeave={(e) => {
            if (!loading && !isGeneratingExam) {
              e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)'
            }
          }}
        >
          <FileText className={`h-4 w-4 shrink-0 ${isGeneratingExam ? 'animate-pulse' : ''}`} />
          {isGeneratingExam ? '正在生成整卷 (约30秒)...' : '生成完整试卷 (28题)'}
        </button>
      </div>
    </div>
  )
}
