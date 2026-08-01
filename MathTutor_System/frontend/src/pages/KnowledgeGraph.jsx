import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Layers3,
  Loader2,
  RefreshCcw,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { generateWeakPointQuestions, getStudentMastery } from '../services/api'
import { useStudent } from '../contexts/StudentContext'
import { useSmartGen } from '../contexts/SmartGenContext'
import { TEXTBOOK_DATA } from '../constants/textbooks'
import { EmptyState, ErrorState, LoadingState, MetricCard, PageHeader, PageShell, SectionCard, StatusBadge } from '../components/UiV2'

const EXPANDED_KEYS_STORAGE = 'knowledge_graph_expanded'

function normalizeForMatch(value) {
  if (value == null || typeof value !== 'string') return ''
  return value.replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim()
}

function matchesPoint(label, points) {
  if (!label || !Array.isArray(points) || points.length === 0) return false
  const source = normalizeForMatch(String(label))
  if (!source) return false
  return points.some((point) => {
    const target = normalizeForMatch(String(point))
    return target && (source === target || source.includes(target) || target.includes(source))
  })
}

function findPathToLabel(nodes, targetLabel, path = []) {
  if (!targetLabel || !Array.isArray(nodes)) return null
  const query = normalizeForMatch(String(targetLabel))
  if (!query) return null

  for (const node of nodes) {
    const key = node.value ?? node.label
    const label = String(node.label ?? node.value ?? '')
    const nextPath = [...path, key]
    const normalizedLabel = normalizeForMatch(label)
    if (normalizedLabel === query || normalizedLabel.includes(query) || query.includes(normalizedLabel)) return nextPath

    const childPath = findPathToLabel(node.children, targetLabel, nextPath)
    if (childPath) return childPath
  }

  return null
}

function collectExpandableKeys(nodes, acc = new Set()) {
  if (!Array.isArray(nodes)) return acc
  nodes.forEach((node) => {
    const key = node.value ?? node.label
    if (key && node.children?.length) {
      acc.add(key)
      collectExpandableKeys(node.children, acc)
    }
  })
  return acc
}

function collectKeysToExpandForWeakPoints(nodes, weakPoints, ancestorKeys = new Set()) {
  if (!Array.isArray(nodes) || !Array.isArray(weakPoints) || weakPoints.length === 0) return new Set()
  const keys = new Set()

  nodes.forEach((node) => {
    const key = node.value ?? node.label
    const label = node.label ?? node.value ?? ''
    const nextAncestors = new Set(ancestorKeys)
    nextAncestors.add(key)
    if (matchesPoint(label, weakPoints)) ancestorKeys.forEach((item) => keys.add(item))
    collectKeysToExpandForWeakPoints(node.children, weakPoints, nextAncestors).forEach((item) => keys.add(item))
  })

  return keys
}

function flattenTextbook(nodes, depth = 0, acc = []) {
  if (!Array.isArray(nodes)) return acc
  nodes.forEach((node) => {
    const label = String(node.label ?? node.value ?? '').trim()
    if (label) acc.push({ key: node.value ?? node.label, label, depth, hasChildren: Boolean(node.children?.length) })
    flattenTextbook(node.children, depth + 1, acc)
  })
  return acc
}

function collectAllLabels(nodes, out = new Set()) {
  if (!Array.isArray(nodes)) return out
  nodes.forEach((node) => {
    const label = String(node.label ?? node.value ?? '').trim()
    if (label) out.add(label)
    collectAllLabels(node.children, out)
  })
  return out
}

function getUnmappedWeakPoints(weakPoints, allLabels) {
  if (!Array.isArray(weakPoints) || weakPoints.length === 0) return []
  return weakPoints.filter((point) => {
    const target = normalizeForMatch(String(point))
    if (!target) return false
    return ![...allLabels].some((label) => {
      const source = normalizeForMatch(label)
      return source === target || source.includes(target) || target.includes(source)
    })
  })
}

function readExpandedKeys() {
  try {
    const raw = localStorage.getItem(EXPANDED_KEYS_STORAGE)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed) : null
  } catch {
    return null
  }
}

function unpackGeneratedQuestions(response) {
  if (Array.isArray(response?.data)) return response.data
  if (Array.isArray(response?.data?.questions)) return response.data.questions
  if (Array.isArray(response?.questions)) return response.questions
  if (Array.isArray(response)) return response
  return []
}

function TreeNode({ node, depth, weakPoints, masteredPoints, selectedLabel, expandedKeys, onSelect, onToggleExpand }) {
  const label = node.label ?? node.value ?? ''
  const nodeKey = node.value ?? node.label ?? ''
  const children = node.children
  const hasChildren = Array.isArray(children) && children.length > 0
  const expanded = expandedKeys.has(nodeKey)
  const weak = matchesPoint(label, weakPoints)
  const mastered = !weak && matchesPoint(label, masteredPoints)
  const selected = selectedLabel === label

  return (
    <div className="v2-graph-tree-branch">
      <div className={`v2-graph-tree-node ${selected ? 'selected' : ''} ${weak ? 'weak' : ''} ${mastered ? 'mastered' : ''}`} style={{ '--depth': depth }}>
        <button
          type="button"
          className="v2-graph-expander"
          aria-label={expanded ? '折叠' : '展开'}
          disabled={!hasChildren}
          onClick={(event) => {
            event.stopPropagation()
            if (hasChildren) onToggleExpand(nodeKey)
          }}
        >
          {hasChildren ? (expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : null}
        </button>
        <button type="button" className="v2-graph-node-label" onClick={() => onSelect(label)}>
          <span className="v2-graph-node-dot" />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {weak && <StatusBadge tone="danger">需加强</StatusBadge>}
          {mastered && <StatusBadge tone="success">已掌握</StatusBadge>}
        </button>
      </div>
      {hasChildren && expanded && children.map((child) => (
        <TreeNode
          key={child.value ?? child.label}
          node={child}
          depth={depth + 1}
          weakPoints={weakPoints}
          masteredPoints={masteredPoints}
          selectedLabel={selectedLabel}
          expandedKeys={expandedKeys}
          onSelect={onSelect}
          onToggleExpand={onToggleExpand}
        />
      ))}
    </div>
  )
}

export default function KnowledgeGraph() {
  const { currentStudent } = useStudent()
  const { setQuestions, setParams, setSavedIndices, setBatchSaved, setLoading } = useSmartGen()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const [weakPoints, setWeakPoints] = useState([])
  const [masteredPoints, setMasteredPoints] = useState([])
  const [selectedLabel, setSelectedLabel] = useState('')
  const [loadingMastery, setLoadingMastery] = useState(false)
  const [error, setError] = useState('')
  const [weakPointGenerating, setWeakPointGenerating] = useState(false)
  const fromGradingHandled = useRef(false)
  const urlKnowledgePointApplied = useRef(false)
  const [expandedKeys, setExpandedKeys] = useState(() => {
    const stored = readExpandedKeys()
    if (stored && stored.size > 0) return stored
    return new Set(TEXTBOOK_DATA.map((root) => root.value))
  })

  const textbookLabels = useMemo(() => collectAllLabels(TEXTBOOK_DATA), [])
  const flatTextbook = useMemo(() => flattenTextbook(TEXTBOOK_DATA), [])
  const unmappedWeakPoints = useMemo(() => getUnmappedWeakPoints(weakPoints, textbookLabels), [textbookLabels, weakPoints])
  const visibleWeakPoints = useMemo(() => weakPoints.filter((point) => !unmappedWeakPoints.includes(point)), [unmappedWeakPoints, weakPoints])
  const selectedState = matchesPoint(selectedLabel, weakPoints) ? 'weak' : matchesPoint(selectedLabel, masteredPoints) ? 'mastered' : 'normal'
  const coveragePercent = Math.round((masteredPoints.length / Math.max(1, masteredPoints.length + weakPoints.length)) * 100)

  const fetchMastery = useCallback(async () => {
    if (currentStudent?.id == null) {
      setWeakPoints([])
      setMasteredPoints([])
      setLoadingMastery(false)
      setError('')
      return
    }

    setLoadingMastery(true)
    setError('')
    try {
      const response = await getStudentMastery(currentStudent.id)
      const weak = response?.data?.weak_points ?? response?.weak_points ?? []
      const mastered = response?.data?.mastered_points ?? response?.mastered_points ?? []
      setWeakPoints(Array.isArray(weak) ? weak : [])
      setMasteredPoints(Array.isArray(mastered) ? mastered : [])
    } catch (err) {
      const message = err?.response?.data?.detail || err?.message || '加载学情失败'
      setError(message)
      setWeakPoints([])
      setMasteredPoints([])
      toast.error(message)
    } finally {
      setLoadingMastery(false)
    }
  }, [currentStudent?.id])

  useEffect(() => {
    fetchMastery()
  }, [fetchMastery])

  useEffect(() => {
    try {
      localStorage.setItem(EXPANDED_KEYS_STORAGE, JSON.stringify([...expandedKeys]))
    } catch {
      // localStorage may be unavailable in test or private contexts.
    }
  }, [expandedKeys])

  useEffect(() => {
    if (weakPoints.length === 0) return
    const keys = collectKeysToExpandForWeakPoints(TEXTBOOK_DATA, weakPoints)
    if (keys.size > 0) setExpandedKeys((prev) => new Set([...prev, ...keys]))
  }, [weakPoints])

  useEffect(() => {
    const fromGrading = location.state?.fromGrading === true
    if (!fromGrading || fromGradingHandled.current) return
    fromGradingHandled.current = true
    fetchMastery().then(() => toast.success('学情已更新，请查看图谱变化'))
    navigate(location.pathname, { replace: true, state: {} })
  }, [fetchMastery, location.pathname, location.state?.fromGrading, navigate])

  const urlKnowledgePoint = searchParams.get('knowledge_point')?.trim() ?? ''
  useEffect(() => {
    urlKnowledgePointApplied.current = false
  }, [urlKnowledgePoint])

  useEffect(() => {
    if (!urlKnowledgePoint || !currentStudent || loadingMastery || urlKnowledgePointApplied.current) return
    urlKnowledgePointApplied.current = true
    setSelectedLabel(urlKnowledgePoint)
    const path = findPathToLabel(TEXTBOOK_DATA, urlKnowledgePoint)
    if (path?.length) setExpandedKeys((prev) => new Set([...prev, ...path]))
  }, [currentStudent, loadingMastery, urlKnowledgePoint])

  const onToggleExpand = (nodeKey) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(nodeKey)) next.delete(nodeKey)
      else next.add(nodeKey)
      return next
    })
  }

  const handleRefreshMastery = () => {
    fetchMastery().then(() => toast.success('学情已刷新'))
  }

  const handleGenerateFive = () => {
    if (!currentStudent || !selectedLabel) {
      toast.error('请先选择学生和知识点')
      return
    }
    const nextParams = {
      knowledge_point: selectedLabel,
      count: 5,
      scenario: 'default',
      difficulty: 'L3',
      question_type: '综合',
    }
    setParams((prev) => ({ ...prev, ...nextParams }))
    navigate('/smart-gen', { state: { autoGenerate: true, ...nextParams } })
  }

  const handleWeakPointGenerate = async () => {
    if (!currentStudent?.id) {
      toast.error('请先选择学生')
      return
    }
    setWeakPointGenerating(true)
    setLoading?.(true)
    try {
      const response = await generateWeakPointQuestions({ student_id: currentStudent.id, count: 5 })
      const list = unpackGeneratedQuestions(response)
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
      setQuestions?.(list)
      setParams?.((prev) => ({ ...prev, ...nextParams }))
      setSavedIndices?.(new Set())
      setBatchSaved?.(false)
      toast.success(`已生成 ${list.length} 道弱项巩固题，可保存到题库`)
      navigate('/smart-gen', { state: { fromWeakPoint: true, weakPointQuestions: list, weakPointParams: nextParams } })
    } catch (err) {
      const detail = err?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : '按弱项出题失败，请检查设置与网络')
    } finally {
      setWeakPointGenerating(false)
      setLoading?.(false)
    }
  }

  if (!currentStudent) {
    return (
      <PageShell>
        <EmptyState
          icon={AlertCircle}
          title="请先选择学生"
          description="选择左侧学生档案后，即可查看教材目录中的弱项、掌握点和强化入口。"
        />
      </PageShell>
    )
  }

  return (
    <PageShell className="space-y-5" fit>
      <PageHeader
        title="学情图谱"
        description="把学生错题弱项映射到教材目录，快速定位薄弱章节并生成强化题。"
        icon={GitBranch}
        meta={<StatusBadge tone="primary">{currentStudent.name}</StatusBadge>}
        actions={(
          <>
            <button type="button" className="v2-btn-secondary" onClick={() => setExpandedKeys(collectExpandableKeys(TEXTBOOK_DATA))}>
              <Layers3 className="h-4 w-4" />
              展开全部
            </button>
            <button type="button" className="v2-btn-secondary" onClick={() => setExpandedKeys(new Set(TEXTBOOK_DATA.map((root) => root.value)))}>
              <ChevronDown className="h-4 w-4" />
              收起章节
            </button>
            <button type="button" className="v2-btn-primary" disabled={loadingMastery} onClick={handleRefreshMastery}>
              <RefreshCcw className={`h-4 w-4 ${loadingMastery ? 'animate-spin' : ''}`} />
              刷新学情
            </button>
          </>
        )}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="需加强" value={weakPoints.length} hint="由错题本聚合" icon={Target} tone="danger" loading={loadingMastery} />
        <MetricCard label="已掌握" value={masteredPoints.length} hint="批改和复习闭环" icon={CheckCircle2} tone="success" loading={loadingMastery} />
        <MetricCard label="教材映射" value={visibleWeakPoints.length} hint={`${unmappedWeakPoints.length} 个未映射`} icon={GitBranch} tone="primary" loading={loadingMastery} />
        <MetricCard label="掌握占比" value={`${coveragePercent}%`} hint="仅按当前图谱数据估算" icon={TrendingUp} tone="warning" loading={loadingMastery} />
      </div>

      <div className="v2-graph-layout">
        <SectionCard
          title="教材目录"
          description="红色节点为需加强，绿色节点为已掌握。"
          className="v2-graph-tree-panel"
          actions={loadingMastery && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        >
          {error ? (
            <ErrorState title="加载学情失败" description={error} onRetry={fetchMastery} />
          ) : loadingMastery ? (
            <LoadingState title="正在加载学情图谱" description="同步当前学生的弱项和掌握点。" />
          ) : (
            <div className="v2-graph-tree">
              {TEXTBOOK_DATA.map((root) => (
                <TreeNode
                  key={root.value ?? root.label}
                  node={root}
                  depth={0}
                  weakPoints={weakPoints}
                  masteredPoints={masteredPoints}
                  selectedLabel={selectedLabel}
                  expandedKeys={expandedKeys}
                  onSelect={setSelectedLabel}
                  onToggleExpand={onToggleExpand}
                />
              ))}
            </div>
          )}
        </SectionCard>

        <div className="v2-graph-side">
          <section className={`v2-graph-focus v2-graph-focus-${selectedState}`}>
            <div>
              <p className="text-xs font-black uppercase text-slate-400">当前定位</p>
              <h2>{selectedLabel || '未选择知识点'}</h2>
              <p>{selectedLabel ? '可直接跳转错题本查看真实错题，或进入智能出题生成强化练习。' : '从左侧教材树选择一个章节或知识点，右侧会显示状态和操作入口。'}</p>
            </div>
            <div className="v2-graph-ring" style={{ '--score': coveragePercent }}>
              <strong>{coveragePercent}%</strong>
              <span>掌握占比</span>
            </div>
          </section>

          {selectedLabel ? (
            <SectionCard title="教学动作" description="仅串联现有错题本、智能出题和趋势入口。">
              <div className="grid gap-2">
                <button type="button" className="v2-btn-primary justify-center" onClick={handleGenerateFive}>
                  <Zap className="h-4 w-4" />
                  针对该知识点生成 5 道强化题
                </button>
                <button type="button" className="v2-btn-secondary justify-center" onClick={() => navigate(`/mistake-book?knowledge_point=${encodeURIComponent(selectedLabel)}`)}>
                  <BookOpen className="h-4 w-4" />
                  查看该知识点错题
                </button>
                <button type="button" className="v2-btn-secondary justify-center" onClick={() => navigate('/')}>
                  <TrendingUp className="h-4 w-4" />
                  查看学情趋势
                </button>
              </div>
            </SectionCard>
          ) : (
            <SectionCard>
              <EmptyState icon={BookOpen} title="等待选择节点" description="选中教材节点后，会显示强化题和错题入口。" />
            </SectionCard>
          )}

          <SectionCard
            title="弱项备课包"
            description="按当前学生所有待加强知识点生成巩固题。"
            actions={<StatusBadge tone={weakPoints.length ? 'danger' : 'neutral'}>{weakPoints.length} 个弱项</StatusBadge>}
          >
            {weakPoints.length > 0 ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {weakPoints.slice(0, 8).map((point) => (
                    <button key={point} type="button" className="v2-chip active" onClick={() => setSelectedLabel(point)}>
                      {point}
                    </button>
                  ))}
                </div>
                <button type="button" className="v2-btn-secondary w-full justify-center" disabled={weakPointGenerating} onClick={handleWeakPointGenerate}>
                  {weakPointGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  按弱项一键出题
                </button>
              </div>
            ) : (
              <EmptyState icon={CheckCircle2} title="暂无弱项" description="当前学生没有待加强知识点记录。" />
            )}
          </SectionCard>

          {unmappedWeakPoints.length > 0 && (
            <SectionCard title="未映射弱项" description="这些错题知识点暂未匹配到教材目录。">
              <div className="flex flex-wrap gap-2">
                {unmappedWeakPoints.map((point) => <StatusBadge key={point} tone="warning">{point}</StatusBadge>)}
              </div>
            </SectionCard>
          )}

          <SectionCard title="目录概览" description={`${flatTextbook.length} 个教材节点，支持章节折叠和状态标记。`}>
            <div className="v2-graph-outline">
              {flatTextbook.slice(0, 8).map((node) => (
                <button key={node.key} type="button" onClick={() => setSelectedLabel(node.label)} style={{ '--depth': Math.min(node.depth, 3) }}>
                  <span>{node.hasChildren ? '章节' : '知识点'}</span>
                  <strong>{node.label}</strong>
                </button>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </PageShell>
  )
}
