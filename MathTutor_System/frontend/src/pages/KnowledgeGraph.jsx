import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { Loader2, AlertCircle, BookOpen, Zap, ChevronRight, ChevronDown, RefreshCcw, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'
import { getStudentMastery, generateWeakPointQuestions } from '../services/api'
import { useStudent } from '../contexts/StudentContext'
import { useSmartGen } from '../contexts/SmartGenContext'
import { TEXTBOOK_DATA } from '../constants/textbooks'

const EXPANDED_KEYS_STORAGE = 'knowledge_graph_expanded'

/** 规范化字符串：去首尾空白、合并连续空白，便于匹配 */
function normalizeForMatch(s) {
  if (s == null || typeof s !== 'string') return ''
  return s.replace(/\s+/g, ' ').replace(/\u3000/g, ' ').trim()
}

/** 判断节点是否为弱项：精确或模糊匹配 weak_points（错题本 topic 与教材目录 label） */
function isWeakPoint(label, weakPoints) {
  if (!label || !Array.isArray(weakPoints) || weakPoints.length === 0) return false
  const a = normalizeForMatch(String(label))
  if (!a) return false
  return weakPoints.some((wp) => {
    const b = normalizeForMatch(String(wp))
    if (!b) return false
    return a === b || a.includes(b) || b.includes(a)
  })
}

/** 判断节点是否为已掌握：与 mastered_points 同规则匹配；若同时为弱项则视为弱项优先 */
function isMasteredPoint(label, masteredPoints) {
  if (!label || !Array.isArray(masteredPoints) || masteredPoints.length === 0) return false
  const a = normalizeForMatch(String(label))
  if (!a) return false
  return masteredPoints.some((mp) => {
    const b = normalizeForMatch(String(mp))
    if (!b) return false
    return a === b || a.includes(b) || b.includes(a)
  })
}

/** 在树中查找包含 targetLabel 的节点，返回从根到该节点的 key 路径（用于自动展开） */
function findPathToLabel(nodes, targetLabel, path = []) {
  if (!targetLabel || !Array.isArray(nodes)) return null
  const query = normalizeForMatch(String(targetLabel))
  if (!query) return null
  for (const n of nodes) {
    const key = n.value ?? n.label
    const label = (n.label ?? n.value ?? '').toString()
    const nextPath = [...path, key]
    const normLabel = normalizeForMatch(label)
    if (normLabel === query || normLabel.includes(query) || query.includes(normLabel)) return nextPath
    const inChild = findPathToLabel(n.children, targetLabel, nextPath)
    if (inChild) return inChild
  }
  return null
}

/** 收集需要展开的节点 key，使所有弱项节点可见（展开其所有祖先） */
function collectKeysToExpandForWeakPoints(nodes, weakPoints, ancestorKeys = new Set()) {
  if (!Array.isArray(nodes) || !Array.isArray(weakPoints) || weakPoints.length === 0) return new Set()
  const toExpand = new Set()
  for (const n of nodes) {
    const key = n.value ?? n.label
    const label = n.label ?? n.value ?? ''
    const nextAncestors = new Set(ancestorKeys)
    nextAncestors.add(key)
    if (isWeakPoint(label, weakPoints)) {
      ancestorKeys.forEach((k) => toExpand.add(k))
    }
    const fromChild = collectKeysToExpandForWeakPoints(n.children, weakPoints, nextAncestors)
    fromChild.forEach((k) => toExpand.add(k))
  }
  return toExpand
}

/** 收集树中所有节点的 label，用于判断弱项是否能在教材中匹配到 */
function collectAllLabels(nodes, out = new Set()) {
  if (!Array.isArray(nodes)) return out
  for (const n of nodes) {
    const label = (n.label ?? n.value ?? '').toString().trim()
    if (label) out.add(label)
    collectAllLabels(n.children, out)
  }
  return out
}

/** 返回在 weakPoints 中但未与任何教材节点匹配的项（用于展示「未映射弱项」） */
function getUnmappedWeakPoints(weakPoints, allLabels) {
  if (!Array.isArray(weakPoints) || weakPoints.length === 0) return []
  return weakPoints.filter((wp) => {
    const b = normalizeForMatch(String(wp))
    if (!b) return false
    return ![...allLabels].some((label) => {
      const a = normalizeForMatch(label)
      return a === b || a.includes(b) || b.includes(a)
    })
  })
}

function loadExpandedKeysFromStorage() {
  try {
    const raw = localStorage.getItem(EXPANDED_KEYS_STORAGE)
    if (!raw) return null
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? new Set(arr) : null
  } catch {
    return null
  }
}

function TreeNode({ node, depth, weakPoints, masteredPoints, selectedLabel, onSelect, expandedKeys, onToggleExpand }) {
  const label = node.label ?? node.value ?? ''
  const nodeKey = node.value ?? node.label ?? ''
  const children = node.children
  const isLeaf = !children || children.length === 0
  const isExpanded = expandedKeys.has(nodeKey)
  const weak = isWeakPoint(label, weakPoints)
  const mastered = !weak && isMasteredPoint(label, masteredPoints)
  const isSelected = selectedLabel === label

  const handleRowClick = () => {
    onSelect(label)
  }

  const handleChevronClick = (e) => {
    e.stopPropagation()
    onToggleExpand(nodeKey)
  }

  return (
    <div className="select-none">
      <div
        className={`flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
          isSelected
            ? 'bg-blue-100 text-blue-800'
            : weak
              ? 'text-red-700 hover:bg-red-50'
              : mastered
                ? 'text-green-700 hover:bg-green-50'
                : 'text-gray-700 hover:bg-gray-100'
        }`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden>
          {!isLeaf ? (
            <button
              type="button"
              onClick={handleChevronClick}
              className="flex items-center justify-center rounded p-0.5 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
              aria-label={isExpanded ? '折叠' : '展开'}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          ) : (
            <span className="inline-block w-5" aria-hidden />
          )}
        </span>
        <button
          type="button"
          onClick={handleRowClick}
          className="flex min-w-0 flex-1 items-center gap-2 rounded py-0.5 text-left"
        >
          <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden>
            {weak ? (
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" title="需加强" />
            ) : mastered ? (
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" title="已掌握" />
            ) : (
              <span className="h-2.5 w-2.5 rounded-full bg-gray-300" title="正常" />
            )}
          </span>
          <span className="truncate">{label}</span>
          {weak && (
            <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
              需加强
            </span>
          )}
          {mastered && (
            <span className="shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
              已掌握
            </span>
          )}
        </button>
      </div>
      {!isLeaf && isExpanded && Array.isArray(children) &&
        children.map((child) => (
          <TreeNode
            key={child.value ?? child.label}
            node={child}
            depth={depth + 1}
            weakPoints={weakPoints}
            masteredPoints={masteredPoints}
            selectedLabel={selectedLabel}
            onSelect={onSelect}
            expandedKeys={expandedKeys}
            onToggleExpand={onToggleExpand}
          />
        ))}
    </div>
  )
}

export default function KnowledgeGraph() {
  const { currentStudent } = useStudent()
  const { setQuestions, setParams, setSavedIndices, setBatchSaved, setLoading } = useSmartGen()
  const [weakPointGenerating, setWeakPointGenerating] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [weakPoints, setWeakPoints] = useState([])
  const [masteredPoints, setMasteredPoints] = useState([])
  const [loadingMastery, setLoadingMastery] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState(null)
  const fromGradingHandled = useRef(false)
  const urlKnowledgePointApplied = useRef(false)
  // 教材目录折叠：优先从 localStorage 恢复，否则默认展开第一层
  const [expandedKeys, setExpandedKeys] = useState(() => {
    const stored = loadExpandedKeysFromStorage()
    if (stored && stored.size > 0) return stored
    return new Set(TEXTBOOK_DATA.map((r) => r.value))
  })

  const onToggleExpand = useCallback((nodeKey) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(nodeKey)) next.delete(nodeKey)
      else next.add(nodeKey)
      return next
    })
  }, [])

  // 持久化折叠状态到 localStorage（包括全部折叠）
  useEffect(() => {
    try {
      localStorage.setItem(EXPANDED_KEYS_STORAGE, JSON.stringify([...expandedKeys]))
    } catch {
      // ignore
    }
  }, [expandedKeys])

  /** 收集树中所有有子节点的 key（用于全部展开） */
  const collectExpandableKeys = useCallback((nodes, acc = new Set()) => {
    if (!Array.isArray(nodes)) return acc
    for (const n of nodes) {
      const key = n.value ?? n.label
      if (key && n.children?.length) {
        acc.add(key)
        collectExpandableKeys(n.children, acc)
      }
    }
    return acc
  }, [])

  const expandAll = useCallback(() => {
    setExpandedKeys(collectExpandableKeys(TEXTBOOK_DATA))
  }, [collectExpandableKeys])

  const collapseAll = useCallback(() => {
    setExpandedKeys(new Set())
  }, [])

  const allTextbookLabels = useMemo(() => collectAllLabels(TEXTBOOK_DATA), [])
  const unmappedWeakPoints = useMemo(
    () => getUnmappedWeakPoints(weakPoints, allTextbookLabels),
    [weakPoints, allTextbookLabels]
  )

  const fetchMastery = useCallback(async () => {
    if (currentStudent?.id == null) {
      setWeakPoints([])
      setMasteredPoints([])
      return
    }
    setLoadingMastery(true)
    try {
      const res = await getStudentMastery(currentStudent.id)
      const weak = res.data?.weak_points ?? []
      const mastered = res.data?.mastered_points ?? []
      setWeakPoints(Array.isArray(weak) ? weak : [])
      setMasteredPoints(Array.isArray(mastered) ? mastered : [])
    } catch (e) {
      toast.error('加载学情失败：' + (e.response?.data?.detail ?? e.message))
      setWeakPoints([])
      setMasteredPoints([])
    } finally {
      setLoadingMastery(false)
    }
  }, [currentStudent?.id])

  useEffect(() => {
    fetchMastery()
  }, [fetchMastery])

  // 有弱项时自动展开包含弱项的节点路径，便于在树中直接看到标红的知识点
  useEffect(() => {
    if (!Array.isArray(weakPoints) || weakPoints.length === 0) return
    const keysToExpand = collectKeysToExpandForWeakPoints(TEXTBOOK_DATA, weakPoints)
    if (keysToExpand.size > 0) {
      setExpandedKeys((prev) => new Set([...prev, ...keysToExpand]))
    }
  }, [weakPoints])

  // 从批改页跳转过来：刷新学情数据并提示，让用户看到图谱颜色变化
  useEffect(() => {
    const fromGrading = location.state?.fromGrading === true
    if (!fromGrading || fromGradingHandled.current) return
    fromGradingHandled.current = true
    fetchMastery().then(() => {
      toast.success('学情已更新，请查看图谱变化')
    })
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.state?.fromGrading, location.pathname, navigate, fetchMastery])

  // URL 的 knowledge_point 变化时允许再次应用（例如从错题本带不同知识点返回）
  const urlKp = searchParams.get('knowledge_point')?.trim() ?? ''
  useEffect(() => {
    urlKnowledgePointApplied.current = false
  }, [urlKp])

  // URL 带 knowledge_point 时：学情加载完成后自动展开到该节点并选中
  useEffect(() => {
    const kp = searchParams.get('knowledge_point')?.trim()
    if (!kp || !currentStudent || loadingMastery || urlKnowledgePointApplied.current) return
    urlKnowledgePointApplied.current = true
    setSelectedLabel(kp)
    const path = findPathToLabel(TEXTBOOK_DATA, kp)
    if (path && path.length > 0) {
      setExpandedKeys((prev) => new Set([...prev, ...path]))
    }
  }, [currentStudent, loadingMastery, searchParams])

  const handleRefreshMastery = useCallback(() => {
    fetchMastery().then(() => toast.success('学情已刷新'))
  }, [fetchMastery])

  const handleNavigateMistake = useCallback(
    (label) => {
      if (!label) return
      navigate(`/mistake-book?knowledge_point=${encodeURIComponent(label)}`)
    },
    [navigate]
  )

  const handleGenerateFive = useCallback(() => {
    if (!currentStudent || !selectedLabel) {
      toast.error('请先选择学生和知识点')
      return
    }
    setParams((prev) => ({
      ...prev,
      knowledge_point: selectedLabel,
      count: 5,
      scenario: 'default',
      difficulty: 'L3',
      question_type: '综合',
    }))
    navigate('/smart-gen', {
      state: {
        autoGenerate: true,
        knowledge_point: selectedLabel,
        scenario: 'default',
        count: 5,
        question_type: '综合',
        difficulty: 'L3',
      },
    })
  }, [currentStudent, selectedLabel, setParams, navigate])

  /** 一键按弱项出题：根据该生错题本弱项生成巩固题，并跳转智能出题页（通过路由 state 传题，避免 context 更新滞后） */
  const handleWeakPointGenerate = useCallback(async () => {
    if (!currentStudent?.id) {
      toast.error('请先选择学生')
      return
    }
    setWeakPointGenerating(true)
    setLoading(true)
    try {
      const res = await generateWeakPointQuestions({ student_id: currentStudent.id, count: 5 })
      const list = Array.isArray(res?.data) ? res.data : []
      if (list.length === 0) {
        toast.error('未生成到题目，请重试')
        return
      }
      const nextParams = {
        knowledge_point: weakPoints.length > 0 ? weakPoints.join('、') : '弱项巩固',
        count: list.length,
        difficulty: 'L3',
        question_type: '综合',
        scenario: 'default',
      }
      setQuestions(list)
      setParams((prev) => ({ ...prev, ...nextParams }))
      setSavedIndices(new Set())
      setBatchSaved(false)
      toast.success(`已生成 ${list.length} 道弱项巩固题，可保存到题库`)
      navigate('/smart-gen', {
        state: { fromWeakPoint: true, weakPointQuestions: list, weakPointParams: nextParams },
      })
    } catch (err) {
      const detail = err.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : '按弱项出题失败，请检查设置与网络')
    } finally {
      setWeakPointGenerating(false)
      setLoading(false)
    }
  }, [currentStudent?.id, weakPoints, setQuestions, setParams, setSavedIndices, setBatchSaved, setLoading, navigate])

  if (!currentStudent) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-xl border border-amber-200 bg-amber-50/80 p-8 text-amber-800">
        <AlertCircle className="h-12 w-12 text-amber-600" />
        <p className="text-center font-medium">请先在左侧选择学生，再查看学情图谱。</p>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-2rem)] gap-4 overflow-hidden rounded-xl">
      {/* 左侧：教材目录树 */}
      <section className="flex w-80 shrink-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <header className="border-b border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-gray-900">教材目录</h2>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={expandAll}
                className="rounded px-2 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800"
              >
                全部展开
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="rounded px-2 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800"
              >
                全部折叠
              </button>
            </div>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            红色=需加强，绿色=已掌握；选中后在右侧可跳转错题本或生成强化题
            {(weakPoints.length > 0 || masteredPoints.length > 0) && (
              <span className="ml-1">
                {weakPoints.length > 0 && <span className="font-medium text-red-600">需加强 {weakPoints.length}</span>}
                {weakPoints.length > 0 && masteredPoints.length > 0 && ' · '}
                {masteredPoints.length > 0 && <span className="font-medium text-green-600">已掌握 {masteredPoints.length}</span>}
              </span>
            )}
          </p>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={handleRefreshMastery}
              disabled={loadingMastery}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${loadingMastery ? 'animate-spin' : ''}`} />
              刷新学情
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-2">
          {loadingMastery ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              <p className="mt-2 text-sm text-gray-500">加载学情中…</p>
            </div>
          ) : (
            <>
              {TEXTBOOK_DATA.map((root) => (
                <TreeNode
                  key={root.value ?? root.label}
                  node={root}
                  depth={0}
                  weakPoints={weakPoints}
                  masteredPoints={masteredPoints}
                  selectedLabel={selectedLabel}
                  onSelect={setSelectedLabel}
                  expandedKeys={expandedKeys}
                  onToggleExpand={onToggleExpand}
                />
              ))}
              {unmappedWeakPoints.length > 0 && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/80 p-3">
                  <p className="text-xs font-medium text-amber-800">未在教材目录中的弱项（来自错题本）</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {unmappedWeakPoints.map((wp) => (
                      <span
                        key={wp}
                        className="inline-flex items-center rounded bg-amber-200/90 px-2 py-0.5 text-xs font-medium text-amber-900"
                      >
                        {wp}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-amber-700">
                    这些知识点在错题本中有记录，但教材树中无对应章节，可继续在错题本中查看与出题
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* 右侧：该章节统计 / 操作面板 */}
      <section className="flex flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-gray-50 shadow-sm">
        <header className="border-b border-gray-200 bg-white px-4 py-3">
          <h2 className="text-lg font-semibold text-gray-900">章节详情</h2>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          {selectedLabel ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <p className="text-sm font-medium text-gray-500">当前选中</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{selectedLabel}</p>
              </div>
              {weakPoints.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-medium text-amber-800">备课包</p>
                  <button
                    type="button"
                    onClick={handleWeakPointGenerate}
                    disabled={weakPointGenerating}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-700 disabled:opacity-60"
                  >
                    {weakPointGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="h-4 w-4" />
                    )}
                    按弱项一键出题（共 {weakPoints.length} 个弱项）
                  </button>
                  <p className="mt-2 text-xs text-amber-700">
                    根据该生错题本待掌握知识点生成巩固题，直接跳转智能出题页
                  </p>
                </div>
              )}
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <p className="text-sm font-medium text-blue-800">快捷操作</p>
                <button
                  type="button"
                  onClick={handleGenerateFive}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
                >
                  <Zap className="h-4 w-4" />
                  针对该知识点生成 5 道强化题
                </button>
                <p className="mt-2 text-xs text-blue-700">
                  将跳转到智能出题页并自动填入知识点，点击「生成」即可出题
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
              >
                <TrendingUp className="h-4 w-4" />
                查看学情趋势（近 8 周）
              </button>
              {isWeakPoint(selectedLabel, weakPoints) && (
                <button
                  type="button"
                  onClick={() => handleNavigateMistake(selectedLabel)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
                >
                  <BookOpen className="h-4 w-4" />
                  查看该知识点错题
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <BookOpen className="h-12 w-12 text-gray-300" />
              <p className="mt-3 font-medium">点击左侧目录节点</p>
              <p className="mt-1 text-sm">查看章节详情并生成强化题</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
