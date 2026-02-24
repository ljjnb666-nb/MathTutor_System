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
    <div className="rounded-none border-0 bg-white p-5 min-h-full">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-600">出题配置</h3>

      {/* 知识点：年级 / 学期 + 已选标签 + 待选列表与搜索；锁定态显示只读考点 */}
      <div className="mb-5">
        <label className="mb-2 block text-xs font-medium text-gray-600">知识点</label>

        {disableKnowledgePoint ? (
          <div className="rounded-lg border border-gray-200 bg-gray-100 px-3 py-3 text-xs text-gray-600">
            <div className="flex items-center gap-2 text-gray-600">
              <Lock className="h-4 w-4 shrink-0" />
              <span className="font-medium">已锁定参考题考点</span>
            </div>
            <p className="mt-1.5 truncate text-gray-700" title={lockedKnowledgePointLabel || '系统自动分析考点'}>
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
            className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
              knowledgeInputMode === KNOWLEDGE_MODE.textbook
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 active:scale-[0.98]'
            }`}
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
            className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
              knowledgeInputMode === KNOWLEDGE_MODE.free
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 active:scale-[0.98]'
            }`}
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
            <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/80 p-3">
              <p className="mb-2 text-xs font-medium text-blue-800">已选知识点</p>
              <div className="flex flex-wrap gap-2">
                {selectedPoints.map((point, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-100 px-3 py-1.5 text-xs font-medium text-blue-800"
                  >
                    {point}
                    <button
                      type="button"
                      onClick={() => onRemovePoint?.(i)}
                      disabled={loading}
                      className="rounded-full p-0.5 hover:bg-blue-200 text-blue-700 transition-colors disabled:opacity-50"
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
              placeholder="手动输入知识点，回车添加"
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                const v = e.target.value?.trim()
                if (v) onAddPoint?.(v)
                e.target.value = ''
              }}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600/20 disabled:opacity-60"
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
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600/20"
          />
        )}
          </>
        )}
      </div>

      {/* 备课场景 */}
      <div className="mb-5">
        <label className="mb-2 block text-xs font-medium text-gray-600">备课场景</label>
        <div className="space-y-1.5 max-h-44 overflow-y-auto">
          {SCENARIOS.map((s) => {
            const IconComponent = SCENARIO_ICONS[s.icon] || BookOpen
            const selected = scenario === s.id
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => handleScenarioChange(s)}
                disabled={loading}
                className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
                  selected
                    ? 'border-blue-600 bg-blue-50 text-blue-800'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 active:scale-[0.99]'
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white border border-gray-200">
                  <IconComponent className="h-4 w-4 text-gray-600" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{s.title}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{s.desc}</p>
                </div>
              </button>
            )
          })}
        </div>
        {scenario === 'sync' && (
          <p className="mt-2 rounded-lg border border-blue-200 bg-blue-50/80 px-3 py-2 text-xs text-blue-800">
            同步辅导将生成：<strong>知识要点</strong> + <strong>1 道典型例题</strong> + <strong>{count} 道巩固练习</strong>，请先选择小节知识点后点击「生成练习题」。
          </p>
        )}
      </div>

      {/* 启用本地知识库 */}
      {onUseKnowledgeBaseChange != null && (
        <div className="mb-5">
          <label className="mb-2 block text-xs font-medium text-gray-600">本地知识库</label>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 transition-colors hover:bg-gray-50">
            <span className="text-sm text-gray-500">🔍</span>
            <span className="flex-1 text-sm font-medium text-gray-800">启用本地知识库</span>
            <button
              type="button"
              role="switch"
              aria-checked={useKnowledgeBase}
              onClick={() => onUseKnowledgeBaseChange(!useKnowledgeBase)}
              disabled={loading}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                useKnowledgeBase ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
                  useKnowledgeBase ? 'translate-x-5' : 'translate-x-0.5'
                }`}
                style={{ marginTop: 2 }}
              />
            </button>
          </label>
          <p className="mt-1 text-xs text-gray-500">基于上传的教案/资料检索后出题</p>
        </div>
      )}

      {/* 题目类型 - 按钮组，每行 3 个 */}
      <div className="mb-5">
        <label className="mb-2 block text-xs font-medium text-gray-600">题目类型</label>
        <div className="grid grid-cols-3 gap-2">
          {QUESTION_TYPES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleTypeChange(value)}
              disabled={loading}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                questionType === value
                  ? 'border-transparent bg-blue-600 text-white shadow-md'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 active:scale-[0.98]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 难度 - Range Slider；新生摸底时禁用并显示「全难度覆盖」 */}
      <div className="mb-5">
        <label className="mb-2 block text-xs font-medium text-gray-600">难度等级</label>
        {isAssessmentMode ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
            <p className="text-sm font-medium text-gray-800">全难度覆盖</p>
            <p className="mt-0.5 text-xs text-gray-500">摸底测试将自动包含 L1～L5 梯度，无需手动选择</p>
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
              className="range-thumb h-2 w-full cursor-pointer appearance-none rounded-full bg-gray-200"
              style={{
                background: `linear-gradient(to right, rgb(37 99 235) 0%, rgb(37 99 235) ${((difficulty - 1) / 4) * 100}%, rgb(229 231 235) ${((difficulty - 1) / 4) * 100}%, rgb(229 231 235) 100%)`,
              }}
            />
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-gray-800">{DIFFICULTY_LABELS[difficulty]}</p>
              <p className="text-xs text-gray-500">{DIFFICULTY_DESCRIPTIONS[difficulty]}</p>
            </div>
          </>
        )}
      </div>

      {/* 滑块 Thumb 样式：蓝色圆 + 白边（通过全局或内联） */}
      <style>{`
        .range-thumb::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: rgb(37 99 235);
          border: 3px solid white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          cursor: pointer;
        }
        .range-thumb::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: rgb(37 99 235);
          border: 3px solid white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          cursor: pointer;
        }
      `}</style>

      {/* 生成数量 - 方形按钮（选中深蓝）+ 自定义输入 */}
      <div className="mb-6">
        <label className="mb-2 block text-xs font-medium text-gray-600">生成数量</label>
        <div className="flex flex-wrap items-center gap-2">
          {COUNT_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleCountChange(value)}
              disabled={loading}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                !customCount && count === value
                  ? 'border-blue-800 bg-blue-800 text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 active:scale-[0.98]'
              }`}
            >
              {label}
            </button>
          ))}
          <input
            type="text"
            value={customCount}
            onChange={handleCustomCountChange}
            placeholder="自定义"
            maxLength={2}
            className="w-16 rounded-lg border border-gray-200 px-2 py-2 text-center text-sm text-gray-800 placeholder-gray-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            disabled={loading}
          />
        </div>
      </div>

      {/* 底部按钮 - 主按钮 50px 高 + 蓝/紫渐变 */}
      <div className="space-y-3 border-t border-gray-100 pt-5">
        {referenceQuestion && (
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            <p className="font-medium">已选参考题</p>
            <p className="mt-0.5 truncate text-gray-600" title={(referenceQuestion.content ?? referenceQuestion.body ?? '').trim() || '—'}>
              {(() => {
                const text = (referenceQuestion.content ?? referenceQuestion.body ?? '').trim() || '—'
                return text.length > REF_SUMMARY_LEN ? text.slice(0, REF_SUMMARY_LEN) + '…' : text
              })()}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={onOpenSelectModal}
                disabled={loading}
                className="text-blue-600 hover:underline"
              >
                点击更换
              </button>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                onClick={onClearReference}
                disabled={loading}
                className="text-gray-500 hover:underline"
              >
                清除
              </button>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="flex h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-sm font-semibold text-white shadow-md hover:from-blue-700 hover:to-blue-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 transition-all"
        >
          <RefreshCcw className={`h-4 w-4 shrink-0 ${loading ? 'animate-spin' : ''}`} />
          {loading ? '生成中…' : '生成练习题'}
        </button>
        <button
          type="button"
          onClick={() => onGenerateExam?.()}
          disabled={loading || isGeneratingExam}
          className="flex h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-sm font-semibold text-white shadow-md hover:from-indigo-700 hover:to-indigo-600 active:scale-[0.98] transition-all disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FileText className={`h-4 w-4 shrink-0 ${isGeneratingExam ? 'animate-pulse' : ''}`} />
          {isGeneratingExam ? '正在生成 28 道试题 (约30秒)...' : '生成完整试卷'}
        </button>
      </div>
    </div>
  )
}
