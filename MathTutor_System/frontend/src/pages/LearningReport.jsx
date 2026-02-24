import { useState, useCallback, useRef, useEffect } from 'react'
import { BarChart3, CheckCircle2, AlertCircle, Clock, Loader2, Plus, Trash2, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { parseLearningReportDraft } from '../services/api'

const defaultWeakPoint = () => ({ point: '', description: '' })

export default function LearningReport({ embedded = false }) {
  const [mode, setMode] = useState('manual') // 'manual' | 'ai'
  const [mastered, setMastered] = useState([''])
  const [weakPoints, setWeakPoints] = useState([defaultWeakPoint()])
  const [estimatedHours, setEstimatedHours] = useState(0)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState(null)
  const reportRef = useRef(null)

  const addMastered = useCallback(() => setMastered((prev) => [...prev, '']), [])
  const removeMastered = useCallback((index) => {
    setMastered((prev) => prev.filter((_, i) => i !== index))
  }, [])
  const setMasteredAt = useCallback((index, value) => {
    setMastered((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }, [])

  const addWeakPoint = useCallback(() => setWeakPoints((prev) => [...prev, defaultWeakPoint()]), [])
  const removeWeakPoint = useCallback((index) => {
    setWeakPoints((prev) => prev.filter((_, i) => i !== index))
  }, [])
  const setWeakPointAt = useCallback((index, field, value) => {
    setWeakPoints((prev) => {
      const next = prev.map((w, i) => (i === index ? { ...w, [field]: value } : w))
      return next
    })
  }, [])

  const buildReportFromManual = useCallback(() => {
    const m = mastered.map((s) => s.trim()).filter(Boolean)
    const w = weakPoints
      .map((p) => ({ point: (p.point || '').trim(), description: (p.description || '').trim() || undefined }))
      .filter((p) => p.point)
    const hours = Math.max(0, Math.min(99, Number(estimatedHours) || 0))
    if (m.length === 0 && w.length === 0 && hours === 0) {
      toast.error('请至少填写一项：今日掌握、待攻克或预计课时')
      return
    }
    setReport({ mastered: m, weak_points: w, estimated_hours: hours })
  }, [mastered, weakPoints, estimatedHours])

  const handleAiExtract = useCallback(async () => {
    const text = draft.trim()
    if (!text) {
      toast.error('请输入学情描述')
      return
    }
    setLoading(true)
    setReport(null)
    try {
      const data = await parseLearningReportDraft({ draft: text })
      setReport({
        mastered: data.mastered || [],
        weak_points: (data.weak_points || []).map((w) => ({
          point: w.point || '',
          description: w.description || undefined,
        })),
        estimated_hours: data.estimated_hours ?? 0,
      })
      toast.success('已解析，下方为可视化报告')
    } catch (err) {
      const msg = err.response?.data?.detail ?? err.message
      toast.error('解析失败：' + (typeof msg === 'string' ? msg : '请检查 API 配置'))
    } finally {
      setLoading(false)
    }
  }, [draft])

  useEffect(() => {
    if (report && reportRef.current) {
      reportRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [report])

  const content = (
    <main className={embedded ? 'mx-auto max-w-4xl pt-4' : 'mx-auto max-w-4xl px-4 sm:px-6 py-4 sm:py-6'}>
        {/* 输入方式切换 */}
        <div className="mb-4 sm:mb-6 flex gap-1 sm:gap-2 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`flex-1 rounded-lg py-2.5 text-xs sm:text-sm font-medium transition-colors touch-manipulation ${
              mode === 'manual' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            手动填写
          </button>
          <button
            type="button"
            onClick={() => setMode('ai')}
            className={`flex-1 rounded-lg py-2.5 text-xs sm:text-sm font-medium transition-colors touch-manipulation ${
              mode === 'ai' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            AI 提取
          </button>
        </div>

        {mode === 'manual' ? (
          <div className="rounded-xl sm:rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-gray-800">填写学情</h2>
            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-xs font-medium text-gray-600">今日已掌握</label>
                {mastered.map((value, index) => (
                  <div key={index} className="mb-2 flex gap-2">
                    <input
                      type="text"
                      value={value}
                      onChange={(e) => setMasteredAt(index, e.target.value)}
                      placeholder="如：一元二次方程解法"
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => removeMastered(index)}
                      className="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                      aria-label="删除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addMastered}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600"
                >
                  <Plus className="h-4 w-4" />
                  添加一项
                </button>
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium text-gray-600">待攻克 / 存在问题</label>
                {weakPoints.map((wp, index) => (
                  <div key={index} className="mb-3 rounded-lg border border-gray-200 p-3">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={wp.point}
                        onChange={(e) => setWeakPointAt(index, 'point', e.target.value)}
                        placeholder="知识点或能力点"
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                      <button
                        type="button"
                        onClick={() => removeWeakPoint(index)}
                        className="shrink-0 rounded-lg p-2 text-gray-400 hover:text-red-600"
                        aria-label="删除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={wp.description || ''}
                      onChange={(e) => setWeakPointAt(index, 'description', e.target.value)}
                      placeholder="问题描述（选填）如：逻辑偏差、计算易错"
                      className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addWeakPoint}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 hover:border-amber-400 hover:text-amber-600"
                >
                  <Plus className="h-4 w-4" />
                  添加一项
                </button>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">预计还需课时</label>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={estimatedHours === '' ? '' : (estimatedHours ?? 0)}
                  onChange={(e) => setEstimatedHours(e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0)}
                  placeholder="如：3"
                  className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-500">课时</span>
              </div>
              <button
                type="button"
                onClick={buildReportFromManual}
                className="w-full rounded-xl bg-blue-600 py-3 font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                生成报告
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl sm:rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm">
            <h2 className="mb-2 text-base font-semibold text-gray-800">输入学情描述</h2>
            <p className="mb-4 text-xs text-gray-500">
              写一段话，如：「今日掌握了知识点A，但在B点上出现了逻辑偏差，预计还需3课时攻克」
            </p>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="例如：今天学了二次函数配方法，掌握得不错；但在与几何结合的应用题上还有思路偏差，容易漏讨论情况，预计再 2～3 节课能巩固。"
              rows={5}
              className="mb-4 w-full resize-y rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={loading}
            />
            <button
              type="button"
              onClick={handleAiExtract}
              disabled={loading}
              className="w-full rounded-xl border-2 border-blue-600 bg-white py-3 font-medium text-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  解析中…
                </span>
              ) : (
                <span className="inline-flex items-center justify-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  AI 提取并生成报告
                </span>
              )}
            </button>
          </div>
        )}

        {/* 可视化报告 */}
        <div ref={reportRef} className="mt-4 sm:mt-6 scroll-mt-6">
          {report && (
            <div className="space-y-4 sm:space-y-6">
              <h2 className="text-base sm:text-lg font-semibold text-gray-800">学习报告</h2>
              <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2">
                <div className="rounded-xl sm:rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 sm:p-5">
                  <div className="mb-3 flex items-center gap-2 text-emerald-700">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-semibold">今日已掌握</span>
                  </div>
                  {report.mastered.length === 0 ? (
                    <p className="text-sm text-emerald-600/80">暂无</p>
                  ) : (
                    <ul className="space-y-2">
                      {report.mastered.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 rounded-lg bg-white/80 px-3 py-2 text-sm text-gray-800">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-xl sm:rounded-2xl border border-amber-200 bg-amber-50/80 p-4 sm:p-5">
                  <div className="mb-3 flex items-center gap-2 text-amber-800">
                    <AlertCircle className="h-5 w-5" />
                    <span className="font-semibold">待攻克</span>
                  </div>
                  {report.weak_points.length === 0 ? (
                    <p className="text-sm text-amber-700/80">暂无</p>
                  ) : (
                    <ul className="space-y-3">
                      {report.weak_points.map((wp, i) => (
                        <li key={i} className="rounded-lg bg-white/80 px-3 py-2">
                          <p className="text-sm font-medium text-gray-800">{wp.point}</p>
                          {wp.description && (
                            <p className="mt-0.5 text-xs text-gray-600">{wp.description}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              {report.estimated_hours > 0 && (
                <div className="flex items-center gap-3 rounded-xl sm:rounded-2xl border border-blue-200 bg-blue-50/80 px-4 sm:px-5 py-3 sm:py-4">
                  <Clock className="h-6 w-6 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-blue-800">预计还需</p>
                    <p className="text-2xl font-bold text-blue-700">{report.estimated_hours} 课时</p>
                    <p className="text-xs text-blue-600/90">可攻克上述弱项</p>
                  </div>
                </div>
              )}
            </div>
          )}
          {!report && (
            <div className="flex flex-col items-center justify-center rounded-xl sm:rounded-2xl border-2 border-dashed border-gray-200 bg-white py-10 sm:py-12 px-4 text-center">
              <BarChart3 className="mb-3 h-10 w-10 sm:h-12 sm:w-12 text-gray-300" />
              <p className="max-w-sm text-xs sm:text-sm text-gray-500">
                上方选择「手动填写」或「AI 提取」并提交后，学习报告将在此处以卡片形式展示。
              </p>
            </div>
          )}
        </div>
    </main>
  )

  if (embedded) return content
  return (
    <div className="min-h-screen bg-gray-50/60">
      <header className="border-b border-gray-200 bg-white px-6 py-5">
        <div className="mx-auto flex max-w-4xl items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">可视化学习报告</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              今日掌握、待攻克与预计课时，一目了然；支持手动填写或 AI 从描述中提取
            </p>
          </div>
        </div>
      </header>
      {content}
    </div>
  )
}
