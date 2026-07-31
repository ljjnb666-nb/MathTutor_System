import { CalendarPlus, Copy, Download, FileText, Loader2, Save, Sparkles, Upload } from 'lucide-react'
import FilterPanel from '../../components/FilterPanel'
import KnowledgeCard from '../../components/KnowledgeCard'
import ExampleList from '../../components/ExampleList'
import QuestionCard from '../../components/QuestionCard'
import QuestionSelectModal from '../../components/QuestionSelectModal'
import 'katex/dist/katex.min.css'

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
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden animate-fade-in-up space-y-4">
      <header className="shrink-0 flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--color-text-primary)' }}>智能 AI 出题中心</h1>
            <span className="rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)', color: 'var(--color-primary-600)' }}>DEEPSEEK-V3 GENERATOR</span>
          </div>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>选择知识点、题型与难度梯度，一键精准生成数学练习题或完整试卷</p>
        </div>
      </header>

      <div
        className="pro-glass-card flex flex-col md:flex-row min-h-0 min-w-0 flex-1 overflow-y-auto md:overflow-hidden rounded-3xl"
        onWheel={(e) => e.stopPropagation()}
      >
        <aside className="w-full md:w-80 shrink-0 max-h-none md:h-full md:min-h-0 overflow-visible md:overflow-y-auto overflow-x-hidden md:overscroll-contain border-b md:border-b-0 md:border-r rounded-t-xl md:rounded-t-none md:rounded-l-xl pb-6 md:pb-0" style={{ backgroundColor: 'color-mix(in srgb, var(--color-bg-panel) 80%, transparent)', borderColor: 'var(--color-border-primary)' }}>
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

        <main className="min-h-0 min-w-0 flex-none md:flex-1 overflow-visible md:overflow-y-auto overflow-x-hidden md:overscroll-contain rounded-b-xl md:rounded-b-none md:rounded-r-xl" style={{ backgroundColor: 'var(--color-bg-panel)' }}>
          <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col px-4 sm:px-6 py-4 sm:py-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 shadow-sm" style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)' }}>
              <div className="flex items-center gap-3 min-w-0">
                {currentStudent ? (
                  <span className="inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)', color: 'var(--color-primary-700)', border: '1px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)' }}>
                    正在为 <span className="font-semibold ml-1">{currentStudent.name}</span> 生成题目
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full px-3 py-1.5 text-sm" style={{ backgroundColor: 'color-mix(in srgb, #fbbf24 10%, var(--color-bg-card))', color: '#92400e', border: '1px solid rgba(251, 191, 36, 0.3)' }}>
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
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-sm active:scale-[0.98] disabled:opacity-50 transition-all"
                style={{
                  border: '1px solid var(--color-border-primary)',
                  backgroundColor: 'var(--color-bg-card)',
                  color: 'var(--color-text-primary)'
                }}
                onMouseEnter={(e) => {
                  if (!ragUploading) {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                    e.currentTarget.style.borderColor = 'var(--color-border-hover)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!ragUploading) {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-card)'
                    e.currentTarget.style.borderColor = 'var(--color-border-primary)'
                  }
                }}
              >
                {ragUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                上传资料
              </button>
            </div>

            {!loading && lastError && questions.length === 0 && (
              <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ border: '1px solid rgba(251, 191, 36, 0.3)', backgroundColor: 'color-mix(in srgb, #fbbf24 10%, var(--color-bg-card))', color: '#92400e' }}>
                <span className="font-medium">知识点：</span>
                <span>{params.knowledge_point || '—'}</span>
              </div>
            )}

            {loading && (
              <div className="flex flex-1 flex-col items-center justify-center py-24">
                <div className="relative">
                  <Loader2 className="h-14 w-14 animate-spin" style={{ color: 'var(--color-primary-600)' }} />
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-medium" style={{ color: 'color-mix(in srgb, var(--color-primary-600) 80%, transparent)' }}>AI</span>
                </div>
                <p className="mt-5 text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                  {params.count > 1 ? `正在生成 ${params.count} 道题…` : 'AI 正在思考中…'}
                </p>
                <p className="mt-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>生成完成后题目将显示在下方</p>
              </div>
            )}

            {!loading && questions.length === 0 && !syncResult?.knowledge_card && (
              <div className="flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed py-20 px-8 text-center" style={{ borderColor: 'var(--color-border-primary)', background: 'linear-gradient(to bottom, color-mix(in srgb, var(--color-primary-500) 5%, transparent), var(--color-bg-card))' }}>
                {lastError ? (
                  <>
                    <p className=”text-sm font-medium” style={{ color: '#92400e' }}>{lastError}</p>
                    <p className=”mt-3 text-xs max-w-sm” style={{ color: 'var(--color-text-secondary)' }}>
                      {lastError.includes('API Key') || lastError.includes('未配置')
                        ? '请打开左上角菜单，在侧栏底部点击”设置”并填写 API Key 后保存，再重新生成。'
                        : '请检查网络或后端服务后重试。'}
                    </p>
                    <button
                      type=”button”
                      onClick={() => handleGenerate()}
                      className=”mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors active:scale-[0.98]”
                      style={{
                        backgroundColor: 'color-mix(in srgb, #fbbf24 15%, var(--color-bg-card))',
                        color: '#92400e'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'color-mix(in srgb, #fbbf24 25%, var(--color-bg-card))'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'color-mix(in srgb, #fbbf24 15%, var(--color-bg-card))'
                      }}
                    >
                      重试
                    </button>
                  </>
                ) : (
                  <>
                    <div className=”flex h-14 w-14 items-center justify-center rounded-full mb-4” style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 15%, transparent)', color: 'var(--color-primary-600)' }}>
                      <Sparkles className=”h-7 w-7” />
                    </div>
                    <p className=”text-base font-medium” style={{ color: 'var(--color-text-primary)' }}>在上方设置题型、难度与数量</p>
                    <p className=”mt-1 text-sm” style={{ color: 'var(--color-text-secondary)' }}>点击”生成练习题”即可生成题目</p>
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

                {questions.length > 0 && (
                  <div className="mb-6 rounded-xl shadow-sm overflow-hidden" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }}>
                    <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                      <div>
                        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                          8年级上册 · {(questions.length > 0 && questions[0]?.knowledge_point) || params.knowledge_point || '—'}
                        </h2>
                        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                          难度 {difficultyLabel}
                          <span style={{ color: 'var(--color-border-primary)' }} className="mx-1.5">·</span>
                          {questions.length} 题
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setExpandedIndices(new Set(questions.map((_, i) => i)))}
                          className="rounded-md px-2.5 py-1.5 text-sm transition-colors"
                          style={{
                            border: '1px solid var(--color-border-primary)',
                            backgroundColor: 'var(--color-bg-card)',
                            color: 'var(--color-text-secondary)'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                            e.currentTarget.style.borderColor = 'var(--color-border-hover)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--color-bg-card)'
                            e.currentTarget.style.borderColor = 'var(--color-border-primary)'
                          }}
                        >
                          展开全部
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpandedIndices(new Set())}
                          className="rounded-md px-2.5 py-1.5 text-sm transition-colors"
                          style={{
                            border: '1px solid var(--color-border-primary)',
                            backgroundColor: 'var(--color-bg-card)',
                            color: 'var(--color-text-secondary)'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                            e.currentTarget.style.borderColor = 'var(--color-border-hover)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--color-bg-card)'
                            e.currentTarget.style.borderColor = 'var(--color-border-primary)'
                          }}
                        >
                          收起全部
                        </button>
                      </div>
                    </div>
                    <div className="px-5 py-3.5 flex flex-wrap items-center gap-2" style={{ backgroundColor: 'color-mix(in srgb, var(--color-bg-panel) 70%, transparent)' }}>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleAddToTodayHomework}
                          disabled={addingToToday}
                          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-sm active:scale-[0.98] transition-transform disabled:opacity-50"
                          style={{
                            border: '1px solid #86efac',
                            backgroundColor: 'color-mix(in srgb, #10b981 8%, var(--color-bg-card))',
                            color: '#047857'
                          }}
                        >
                          {addingToToday ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
                          加入今日作业
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveAsExam}
                          disabled={savingExam}
                          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white shadow-sm active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 transition-transform"
                          style={{ backgroundColor: 'var(--color-primary-600)' }}
                          onMouseEnter={(e) => {
                            if (!savingExam) {
                              e.currentTarget.style.backgroundColor = 'var(--color-primary-700)'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!savingExam) {
                              e.currentTarget.style.backgroundColor = 'var(--color-primary-600)'
                            }
                          }}
                        >
                          {savingExam ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          保存为试卷
                        </button>
                      </div>
                      <span className="w-px h-7 hidden sm:block" style={{ backgroundColor: 'var(--color-border-primary)' }} aria-hidden />
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-sm active:scale-[0.98] transition-transform"
                          style={{
                            border: '1px solid var(--color-border-primary)',
                            backgroundColor: 'var(--color-bg-card)',
                            color: 'var(--color-text-primary)'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                            e.currentTarget.style.borderColor = 'var(--color-border-hover)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--color-bg-card)'
                            e.currentTarget.style.borderColor = 'var(--color-border-primary)'
                          }}
                        >
                          <Copy className="h-4 w-4" />
                          复制文本
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-sm active:scale-[0.98] transition-transform"
                          style={{
                            border: '1px solid var(--color-border-primary)',
                            backgroundColor: 'var(--color-bg-card)',
                            color: 'var(--color-text-primary)'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                            e.currentTarget.style.borderColor = 'var(--color-border-hover)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--color-bg-card)'
                            e.currentTarget.style.borderColor = 'var(--color-border-primary)'
                          }}
                        >
                          <FileText className="h-4 w-4" />
                          导出 Word
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-sm active:scale-[0.98] transition-transform"
                          style={{
                            border: '1px solid var(--color-border-primary)',
                            backgroundColor: 'var(--color-bg-card)',
                            color: 'var(--color-text-primary)'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                            e.currentTarget.style.borderColor = 'var(--color-border-hover)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--color-bg-card)'
                            e.currentTarget.style.borderColor = 'var(--color-border-primary)'
                          }}
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
                      const showSectionHeader = questions.length === 28 && [0, 8, 16].includes(i)
                      const sectionTitles = { 0: '一、选择题', 8: '二、填空题', 16: '三、解答题' }
                      return (
                        <li key={i}>
                          {showSectionHeader && (
                            <div className="mb-4 mt-2 rounded-lg px-4 py-2.5 text-sm font-semibold" style={{ border: '1px solid rgba(168, 85, 247, 0.3)', backgroundColor: 'color-mix(in srgb, #a855f7 8%, var(--color-bg-card))', color: '#7e22ce' }}>
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
