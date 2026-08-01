import { useCallback, useMemo, useState } from 'react'
import { AlertCircle, BarChart3, CheckCircle2, Clock, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { parseLearningReportDraft } from '../services/api'
import { EmptyState, PageHeader, PageShell, SectionCard, StatusBadge } from '../components/UiV2'

const defaultWeakPoint = () => ({ point: '', description: '' })

export default function LearningReport({ embedded = false, studentNameHint = '', reportPeriod = '4w' }) {
  const [mode, setMode] = useState('manual')
  const [mastered, setMastered] = useState([''])
  const [weakPoints, setWeakPoints] = useState([defaultWeakPoint()])
  const [estimatedHours, setEstimatedHours] = useState(0)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState(null)

  const masteredItems = useMemo(() => mastered.map((item) => item.trim()).filter(Boolean), [mastered])
  const weakItems = useMemo(
    () => weakPoints.map((item) => ({ point: item.point.trim(), description: item.description.trim() })).filter((item) => item.point),
    [weakPoints]
  )

  const updateMastered = (index, value) => setMastered((prev) => prev.map((item, i) => (i === index ? value : item)))
  const updateWeakPoint = (index, field, value) => setWeakPoints((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)))

  const buildReportFromManual = useCallback(() => {
    setError('')
    const hours = Math.max(0, Math.min(99, Number(estimatedHours) || 0))
    if (masteredItems.length === 0 && weakItems.length === 0 && hours === 0) {
      setError('请至少填写已掌握、待攻克或预计课时中的一项')
      return
    }
    setReport({ mastered: masteredItems, weak_points: weakItems, estimated_hours: hours })
  }, [estimatedHours, masteredItems, weakItems])

  const handleAiExtract = useCallback(async () => {
    const text = draft.trim()
    setError('')
    if (!text) {
      setError('请输入学情描述')
      return
    }
    setLoading(true)
    try {
      const data = await parseLearningReportDraft({ draft: text })
      setReport({
        mastered: Array.isArray(data.mastered) ? data.mastered : [],
        weak_points: Array.isArray(data.weak_points) ? data.weak_points.map((item) => ({ point: item.point || '', description: item.description || '' })) : [],
        estimated_hours: data.estimated_hours ?? 0,
      })
      toast.success('已解析学习报告')
    } catch (err) {
      const message = err?.response?.data?.detail || err?.message || '解析失败'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [draft])

  const content = (
    <div className="space-y-4">
      <section className="v2-report-workbench">
        <div className="v2-report-editor">
          <div className="v2-report-mode-tabs">
            <button type="button" className={mode === 'manual' ? 'active' : ''} onClick={() => setMode('manual')}>手动填写</button>
            <button type="button" className={mode === 'ai' ? 'active' : ''} onClick={() => setMode('ai')}>AI 提取</button>
          </div>

          {mode === 'manual' ? (
            <div className="grid gap-4">
              <SectionCard title="学习指标" description="仅使用教师手动填写的数据生成当前报告。">
                <div className="grid gap-3">
                  <label className="v2-field">
                    <span>学生</span>
                    <input value={studentNameHint || '未选择学生'} readOnly />
                  </label>
                  <label className="v2-field">
                    <span>时间范围</span>
                    <input value={reportPeriod === '1w' ? '近 1 周' : reportPeriod === '4w' ? '近 4 周' : '本学期'} readOnly />
                  </label>
                  <label className="v2-field">
                    <span>预计还需课时</span>
                    <input type="number" min="0" max="99" value={estimatedHours} onChange={(event) => setEstimatedHours(event.target.value)} />
                  </label>
                </div>
              </SectionCard>

              <SectionCard title="知识点表现" description="已掌握与待攻克内容分开填写，避免虚假趋势。">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between"><strong className="text-sm text-slate-200">已掌握</strong><button type="button" className="v2-icon-button" onClick={() => setMastered((prev) => [...prev, ''])}><Plus className="h-4 w-4" /></button></div>
                    {mastered.map((value, index) => (
                      <div key={index} className="flex gap-2">
                        <input className="v2-report-input" value={value} onChange={(event) => updateMastered(index, event.target.value)} placeholder="如：一元二次方程解法" />
                        <button type="button" className="v2-icon-button danger" onClick={() => setMastered((prev) => prev.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between"><strong className="text-sm text-slate-200">待攻克</strong><button type="button" className="v2-icon-button" onClick={() => setWeakPoints((prev) => [...prev, defaultWeakPoint()])}><Plus className="h-4 w-4" /></button></div>
                    {weakPoints.map((item, index) => (
                      <div key={index} className="v2-report-weak-row">
                        <input value={item.point} onChange={(event) => updateWeakPoint(index, 'point', event.target.value)} placeholder="知识点或能力点" />
                        <input value={item.description} onChange={(event) => updateWeakPoint(index, 'description', event.target.value)} placeholder="问题描述（可选）" />
                        <button type="button" className="v2-icon-button danger" onClick={() => setWeakPoints((prev) => prev.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              </SectionCard>
            </div>
          ) : (
            <SectionCard title="学情描述" description="调用现有学习报告解析接口，从自然语言中提取结构化结果。">
              <label className="v2-field">
                <span>描述文本</span>
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} disabled={loading} rows={8} placeholder="例如：今天学了二次函数配方法，掌握得不错；但在几何结合题上还有思路偏差，预计再 2 节课巩固。" />
              </label>
            </SectionCard>
          )}

          {error && <p className="v2-inline-error" role="alert">{error}</p>}
          <div className="flex flex-wrap gap-2">
            {mode === 'manual' ? (
              <button type="button" className="v2-btn-primary" onClick={buildReportFromManual}><BarChart3 className="h-4 w-4" />生成学习报告</button>
            ) : (
              <button type="button" className="v2-btn-primary" disabled={loading} onClick={handleAiExtract}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}AI 提取并生成</button>
            )}
          </div>
        </div>

        <aside className="v2-report-preview">
          <h2>学习报告预览</h2>
          {report ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="v2-report-mini"><CheckCircle2 className="h-4 w-4 text-emerald-300" /><span>已掌握</span><strong>{report.mastered.length}</strong></div>
                <div className="v2-report-mini"><AlertCircle className="h-4 w-4 text-amber-300" /><span>待攻克</span><strong>{report.weak_points.length}</strong></div>
                <div className="v2-report-mini"><Clock className="h-4 w-4 text-indigo-300" /><span>预计课时</span><strong>{report.estimated_hours || 0}</strong></div>
              </div>
              <ReportList title="已掌握" items={report.mastered} empty="暂无已掌握记录" />
              <ReportList title="待攻克" items={report.weak_points.map((item) => item.description ? `${item.point}：${item.description}` : item.point)} empty="暂无待攻克记录" />
            </div>
          ) : (
            <EmptyState icon={BarChart3} title="暂无学习报告" description="填写学习指标或使用 AI 提取后在此展示真实结果。" />
          )}
        </aside>
      </section>
    </div>
  )

  if (embedded) return content
  return (
    <PageShell>
      <PageHeader title="学习报告" description="按学生学习表现生成结构化报告。" icon={BarChart3} meta={<StatusBadge tone="primary">独立入口</StatusBadge>} />
      {content}
    </PageShell>
  )
}

function ReportList({ title, items, empty }) {
  return (
    <div className="v2-report-list-block">
      <h3>{title}</h3>
      {items.length === 0 ? <p>{empty}</p> : items.map((item, index) => <div key={`${item}-${index}`}>{item}</div>)}
    </div>
  )
}
