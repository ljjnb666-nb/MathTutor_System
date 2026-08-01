import {
  BarChart3,
  BookOpen,
  CalendarPlus,
  FileText,
  Layers3,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  Upload,
} from 'lucide-react'
import FilterPanel from '../../components/FilterPanel'
import KnowledgeCard from '../../components/KnowledgeCard'
import ExampleList from '../../components/ExampleList'
import QuestionCard from '../../components/QuestionCard'
import QuestionSelectModal from '../../components/QuestionSelectModal'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  PageShell,
  SectionCard,
  StatusBadge,
} from '../../components/UiV2'
import 'katex/dist/katex.min.css'

const TYPE_TONES = {
  选择: 'accent',
  填空: 'info',
  解答: 'warning',
  应用: 'success',
  综合: 'neutral',
}

function getQuestionType(question, fallback) {
  const raw = question?.question_type ?? question?.type ?? fallback ?? '综合'
  if (String(raw).includes('选择')) return '选择'
  if (String(raw).includes('填空')) return '填空'
  if (String(raw).includes('解答')) return '解答'
  if (String(raw).includes('应用')) return '应用'
  return raw || '综合'
}

function getDifficulty(question, fallback) {
  return question?.difficulty ?? fallback ?? 'L3'
}

function countBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item)
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
}

function percent(value, total) {
  if (!total) return 0
  return Math.round((value / total) * 100)
}

function DistributionBar({ label, value, total, tone = 'accent' }) {
  const width = percent(value, total)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-[var(--color-text-primary)]">{label}</span>
        <span className="text-[var(--color-text-secondary)]">{value}题 · {width}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--color-bg-panel-muted)]">
        <div className={`h-full rounded-full v2-tone-${tone}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

export default function SmartGenView({
  addingToToday,
  currentStudent,
  difficultyLabel,
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
  questions,
  ragFileInputRef,
  ragUploading,
  referenceQuestion,
  regeneratingIndex,
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
}) {
  const questionTotal = questions.length
  const hasResult = questionTotal > 0 || !!syncResult?.knowledge_card
  const typeCounts = countBy(questions, (q) => getQuestionType(q, params.question_type))
  const difficultyCounts = countBy(questions, (q) => getDifficulty(q, params.difficulty))
  const coverage = Array.from(
    new Set(
      questions
        .map((q) => (q.knowledge_point ?? '').trim())
        .filter(Boolean)
    )
  )
  const selectedKnowledge = selectedPoints.length
    ? selectedPoints.join(' + ')
    : (params.knowledge_point ?? '').trim()
  const canSave = questionTotal > 0 || !!syncResult

  return (
    <PageShell className="h-full min-h-0 overflow-y-auto overscroll-contain pr-1">
      <PageHeader
        title="智能出题"
        description="按学生、知识点、题型和难度生成练习题，结果区只展示真实生成内容。"
        icon={Sparkles}
        actions={(
          <>
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
              className="v2-button v2-button-secondary"
            >
              {ragUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              导入参考资料
            </button>
          </>
        )}
      />

      <QuestionSelectModal
        open={showQuestionModal}
        onClose={() => {
          setShowQuestionModal(false)
          setPendingRefConfig(null)
        }}
        onSelect={handleSelectReference}
      />

      <section className="v2-panel px-4 py-3 sm:px-5">
        <div className="grid gap-3 lg:grid-cols-[repeat(5,minmax(0,1fr))]">
          <div className="v2-mini-stat">
            <span>学生</span>
            <strong>{currentStudent?.name ?? '未选择'}</strong>
          </div>
          <div className="v2-mini-stat">
            <span>知识点</span>
            <strong title={selectedKnowledge || '未设置'}>{selectedKnowledge || '未设置'}</strong>
          </div>
          <div className="v2-mini-stat">
            <span>难度</span>
            <strong>{difficultyLabel}</strong>
          </div>
          <div className="v2-mini-stat">
            <span>题型</span>
            <strong>{params.question_type ?? '综合'}</strong>
          </div>
          <div className="v2-mini-stat">
            <span>数量</span>
            <strong>{params.count ?? 0}题</strong>
          </div>
        </div>
      </section>

      <div className="grid min-h-0 gap-4 xl:h-[calc(100vh-22rem)] xl:grid-cols-[20rem_minmax(0,1fr)_20rem]">
        <aside className="min-w-0 space-y-4 xl:min-h-0 xl:overflow-y-auto">
          <SectionCard title="出题条件设置" icon={Layers3} className="xl:min-h-full">
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
          </SectionCard>
        </aside>

        <main className="min-w-0 space-y-4 xl:min-h-0 xl:overflow-y-auto">
          <SectionCard
            title="AI生成题目预览"
            icon={FileText}
            actions={(
              <div className="flex items-center gap-2">
                {questionTotal > 0 && <StatusBadge tone="success">已生成 {questionTotal} 题</StatusBadge>}
                {loading && <StatusBadge tone="info">生成中</StatusBadge>}
              </div>
            )}
          >
            {loading && (
              <LoadingState
                title={`正在生成 ${params.count ?? ''} 道题`}
                description="生成完成后会在此处显示真实返回的题目、解析和知识卡片。"
              />
            )}

            {!loading && lastError && !hasResult && (
              <ErrorState
                title="生成失败"
                description={lastError}
                actionLabel="重试生成"
                onRetry={() => handleGenerate()}
              />
            )}

            {!loading && !lastError && !hasResult && (
              <EmptyState
                icon={Sparkles}
                title="尚未生成题目"
                description="先在左侧选择学生、知识点、题型和难度，再生成练习题或完整试卷。"
                actionLabel="开始生成"
                onAction={() => handleGenerateClick()}
              />
            )}

            {!loading && hasResult && (
              <div className="space-y-4">
                {syncResult?.knowledge_card && <KnowledgeCard data={syncResult.knowledge_card} />}
                {syncResult?.examples?.length > 0 && <ExampleList data={syncResult.examples} />}

                {questionTotal > 0 && (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] px-4 py-3">
                      <div>
                        <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
                          {(questions[0]?.knowledge_point ?? params.knowledge_point ?? '综合练习').trim() || '综合练习'}
                        </h3>
                        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                          {difficultyLabel} · {params.question_type ?? '综合'} · {questionTotal}题
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setExpandedIndices(new Set(questions.map((_, i) => i)))}
                          className="v2-icon-button w-auto px-3 text-xs"
                        >
                          展开解析
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpandedIndices(new Set())}
                          className="v2-icon-button w-auto px-3 text-xs"
                        >
                          收起解析
                        </button>
                      </div>
                    </div>

                    <ul className="space-y-4">
                      {questions.map((q, i) => {
                        const expanded = expandedIndices.has(i)
                        return (
                          <li key={i}>
                            <QuestionCard
                              data={{
                                ...q,
                                knowledge_point: (q.knowledge_point ?? '').trim() || '未标注',
                                difficulty: q.difficulty ?? params.difficulty,
                                question_type: getQuestionType(q, params.question_type),
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
                  </>
                )}
              </div>
            )}
          </SectionCard>
        </main>

        <aside className="min-w-0 space-y-4 xl:min-h-0 xl:overflow-y-auto">
          <SectionCard title="推荐题型分布" icon={BarChart3}>
            {questionTotal > 0 ? (
              <div className="space-y-4">
                {Object.entries(typeCounts).map(([label, value]) => (
                  <DistributionBar
                    key={label}
                    label={label}
                    value={value}
                    total={questionTotal}
                    tone={TYPE_TONES[label] ?? 'accent'}
                  />
                ))}
              </div>
            ) : (
              <EmptyState title="暂无分布" description="生成题目后按真实题型统计。" />
            )}
          </SectionCard>

          <SectionCard title="知识点覆盖" icon={BookOpen}>
            {questionTotal > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] px-3 py-2">
                  <span className="text-xs font-semibold text-[var(--color-text-secondary)]">覆盖知识点</span>
                  <strong className="text-sm text-[var(--color-text-primary)]">{coverage.length || 1} 个</strong>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(coverage.length ? coverage : [params.knowledge_point || '综合']).map((point) => (
                    <StatusBadge key={point} tone="accent">{point}</StatusBadge>
                  ))}
                </div>
                <div className="space-y-3">
                  {Object.entries(difficultyCounts).map(([label, value]) => (
                    <DistributionBar key={label} label={label} value={value} total={questionTotal} tone="info" />
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState title="暂无覆盖数据" description="这里不会伪造覆盖率；生成后按返回题目统计。" />
            )}
          </SectionCard>

          <SectionCard title="生成状态" icon={RefreshCw}>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--color-text-secondary)]">知识库</span>
                <StatusBadge tone={useKnowledgeBase ? 'success' : 'neutral'}>{useKnowledgeBase ? '已启用' : '未启用'}</StatusBadge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--color-text-secondary)]">参考题</span>
                <StatusBadge tone={referenceQuestion ? 'info' : 'neutral'}>{referenceQuestion ? '已选择' : '未选择'}</StatusBadge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--color-text-secondary)]">结果</span>
                <StatusBadge tone={questionTotal > 0 ? 'success' : 'neutral'}>{questionTotal > 0 ? `${questionTotal}题` : '暂无'}</StatusBadge>
              </div>
            </div>
          </SectionCard>
        </aside>
      </div>

      <section className="v2-panel flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-[var(--color-text-secondary)]">
          当前操作只使用已有生成、保存试卷和加入今日作业能力。
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleGenerate()}
            disabled={loading || !currentStudent}
            className="v2-button v2-button-secondary"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            重新生成
          </button>
          <button
            type="button"
            onClick={handleSaveAsExam}
            disabled={!canSave || savingExam}
            className="v2-button v2-button-primary"
          >
            {savingExam ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存为试卷
          </button>
          <button
            type="button"
            onClick={handleAddToTodayHomework}
            disabled={questionTotal === 0 || addingToToday}
            className="v2-button v2-button-secondary"
          >
            {addingToToday ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
            加入今日作业
          </button>
        </div>
      </section>
    </PageShell>
  )
}
