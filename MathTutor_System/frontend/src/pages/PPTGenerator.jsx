import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Presentation, Loader2, Sparkles, Download, ChevronLeft, ChevronRight, FileText, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { generatePPT, buildPPTFile } from '../services/api'

const GRADES = [
  { value: 'Primary', label: '小学' },
  { value: 'Middle', label: '初中' },
  { value: 'High School', label: '高中' },
]

export default function PPTGenerator() {
  const navigate = useNavigate()
  const [topic, setTopic] = useState('')
  const [grade, setGrade] = useState('Middle')
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [content, setContent] = useState(null)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [pptFilename, setPptFilename] = useState('')

  const handleGenerate = useCallback(async () => {
    const t = topic.trim()
    if (!t) {
      toast.error('请填写主题')
      return
    }
    setLoading(true)
    setContent(null)
    try {
      const data = await generatePPT({ topic: t, grade })
      setContent(data)
      setPptFilename(t)
      setPreviewIndex(0)
      toast.success('已成功生成 Magic PPT，可在下方预览')
    } catch (err) {
      if (err.upgradeRequired) {
        toast.error(err.upgradeMessage || '该功能需升级至专业版套餐')
        navigate('/pricing')
        return
      }
      const msg = err.response?.data?.detail ?? err.message
      toast.error('生成失败：' + msg)
    } finally {
      setLoading(false)
    }
  }, [topic, grade, navigate])

  const handleDownload = useCallback(async () => {
    if (!content || !content.slides?.length) return
    setDownloading(true)
    try {
      const payload = { ...content, filename: pptFilename.trim() || topic.trim() || 'Lesson' }
      const { blob, filename } = await buildPPTFile(payload)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('PPT 已开始下载')
    } catch (err) {
      if (err.upgradeRequired) {
        toast.error(err.upgradeMessage || '该功能需升级至专业版套餐')
        navigate('/pricing')
        return
      }
      const msg = err.response?.data?.detail ?? err.message
      toast.error('下载失败：' + msg)
    } finally {
      setDownloading(false)
    }
  }, [content, pptFilename, topic, navigate])

  const allSlides = content?.slides ?? []
  const slides = allSlides.filter((s) => (s.layout || 'layout').toString().toLowerCase() !== 'section')
  const safeIndex = slides.length > 0 ? Math.min(previewIndex, slides.length - 1) : 0
  const currentSlide = slides[safeIndex]
  const canPrev = previewIndex > 0
  const canNext = previewIndex < slides.length - 1

  useEffect(() => {
    if (slides.length > 0 && previewIndex >= slides.length) setPreviewIndex(slides.length - 1)
  }, [content, slides.length, previewIndex])

  return (
    <div className="mx-auto max-w-5xl space-y-6 md:space-y-8 animate-fade-in-up">

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl p-6 sm:p-8 shadow-sm" style={{ border: '1px solid color-mix(in srgb, var(--color-border-primary) 90%, transparent)', backgroundColor: 'var(--color-bg-card)' }}>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white shadow-lg shrink-0" style={{ boxShadow: '0 10px 15px -3px color-mix(in srgb, var(--color-primary-500) 25%, transparent)' }}>
            <Presentation className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--color-text-primary)' }}>Magic PPT 智能幻灯片生成</h1>
              <span className="rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)', color: 'var(--color-primary-600)' }}>
                AI Studio
              </span>
            </div>
            <p className="mt-1 text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              输入教学主题与目标学段，AI 自动生成分层排版的完整教学幻灯片并提供原原生 .pptx 下载
            </p>
          </div>
        </div>
      </div>

      {/* Main Generator Form Card */}
      <div className="rounded-3xl p-6 sm:p-8 shadow-sm space-y-6" style={{ border: '1px solid color-mix(in srgb, var(--color-border-primary) 90%, transparent)', backgroundColor: 'var(--color-bg-card)' }}>
        <div>
          <label className="mb-2 block text-xs font-black uppercase tracking-wider" style={{ color: 'var(--color-text-primary)' }}>
            教学主题 / 知识点名称
          </label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="例如：勾股定理、一元二次方程根的判别式、二次函数图像与性质"
            className="w-full rounded-2xl px-4 py-3.5 text-sm font-bold placeholder:font-normal focus:outline-none focus:ring-4 transition-all"
            style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-primary-500)'
              e.currentTarget.style.backgroundColor = 'var(--color-bg-card)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border-primary)'
              e.currentTarget.style.backgroundColor = 'var(--color-bg-input)'
            }}
            disabled={loading}
          />
        </div>

        <div>
          <label className="mb-2 block text-xs font-black uppercase tracking-wider" style={{ color: 'var(--color-text-primary)' }}>
            学段分类
          </label>
          <div className="flex flex-wrap gap-2.5">
            {GRADES.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => setGrade(g.value)}
                disabled={loading}
                className="rounded-xl px-5 py-2.5 text-xs font-extrabold transition-all duration-200"
                style={
                  grade === g.value
                    ? { background: 'linear-gradient(to right, var(--color-primary-600), var(--color-primary-700))', color: 'white', boxShadow: '0 4px 6px -1px color-mix(in srgb, var(--color-primary-500) 25%, transparent)' }
                    : { backgroundColor: 'var(--color-bg-panel)', color: 'var(--color-text-secondary)' }
                }
                onMouseEnter={(e) => {
                  if (grade !== g.value) {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (grade !== g.value) {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-panel)'
                  }
                }}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || !topic.trim()}
            className="btn-gradient-pro w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-3.5 text-xs font-extrabold tracking-wide uppercase transition-transform active:scale-95 disabled:opacity-60"
            style={{ boxShadow: '0 10px 15px -3px color-mix(in srgb, var(--color-primary-500) 25%, transparent)' }}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>AI 正在生成幻灯片内容…</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>一键生成教学幻灯片</span>
              </>
            )}
          </button>

          <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
            💡 生成时间约 30 秒～1 分钟，生成后可直接下载 .pptx 文件
          </p>
        </div>
      </div>

      {/* PPT Interactive Preview Card */}
      {content && slides.length > 0 && (
        <div className="rounded-3xl shadow-sm overflow-hidden animate-fade-in-up" style={{ border: '1px solid color-mix(in srgb, var(--color-border-primary) 90%, transparent)', backgroundColor: 'var(--color-bg-card)' }}>
          <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-4" style={{ borderBottom: '1px solid var(--color-border-subtle)', backgroundColor: 'var(--color-bg-panel)' }}>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" style={{ color: '#10b981' }} />
              <h2 className="text-sm font-black" style={{ color: 'var(--color-text-primary)' }}>幻灯片在线预览</h2>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold" style={{ color: 'var(--color-text-secondary)' }}>文件名</label>
                <input
                  type="text"
                  value={pptFilename}
                  onChange={(e) => setPptFilename(e.target.value)}
                  placeholder="默认为主题名"
                  className="w-44 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none"
                  style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)' }}
                />
                <span className="text-xs font-bold" style={{ color: 'var(--color-text-muted)' }}>.pptx</span>
              </div>
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-md transition-all disabled:opacity-60"
                style={{ backgroundColor: '#10b981' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#059669' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#10b981' }}
              >
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                下载 .pptx 文件
              </button>
            </div>
          </div>

          <div className="p-6 sm:p-8 flex flex-col items-center gap-6">
            {/* Canvas Slide */}
            <div className="w-full max-w-3xl aspect-video rounded-2xl shadow-xl flex flex-col overflow-hidden" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: '#FAFCFE' }}>
              {currentSlide && (
                <>
                  {currentSlide.layout === 'title' ? (
                    <div className="flex-1 flex flex-col items-center justify-center px-8 py-5 relative">
                      <div className="absolute top-3 right-4 rounded-md bg-[#0D948D] px-2.5 py-1 text-xs font-bold text-white">初中数学</div>
                      <div className="w-[88%] h-2 rounded-full bg-gradient-to-r from-[#1D4ED8] to-[#0D948D] mb-6" aria-hidden />
                      <h3 className="text-2xl font-bold text-[#0C1224] text-center leading-tight">
                        {currentSlide.title || content.title}
                      </h3>
                      {currentSlide.subtitle && (
                        <p className="mt-4 text-base text-[#475A69] text-center">{currentSlide.subtitle}</p>
                      )}
                      <div className="mt-6 flex flex-col items-center gap-1">
                        <div className="w-24 h-1 rounded-full bg-[#1D4ED8]" aria-hidden />
                        <div className="w-14 h-0.5 rounded-full bg-[#0D948D]" aria-hidden />
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 flex justify-between items-center px-6 py-2 border-t border-slate-200">
                        <span className="text-xs text-slate-400">初中数学</span>
                        <span className="text-sm font-bold text-[#3B82F6]">01 / {slides.length.toString().padStart(2, '0')}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="flex flex-1 min-h-0">
                        <div className="w-[6%] min-w-[10px] shrink-0 bg-gradient-to-b from-[#1D4ED8] to-[#0D948D]" aria-hidden />
                        <div className="flex-1 flex flex-col pl-4 pr-5 py-3 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-1 h-5 rounded-full bg-[#0D948D] shrink-0" aria-hidden />
                            <h3 className="text-base font-bold text-[#3B82F6]">
                              {currentSlide.title || ' '}
                            </h3>
                          </div>
                          <div className="flex-1 rounded-xl bg-white border border-slate-200/90 px-4 py-3 min-h-0 overflow-auto shadow-sm">
                            <ul className="space-y-3 text-[#334354] text-sm leading-relaxed">
                              {(currentSlide.bullets || []).length > 0 ? (
                                (currentSlide.bullets || []).map((b, i) => (
                                  <li key={i} className="flex gap-2">
                                    <span className="text-[#1D4ED8] shrink-0">•</span>
                                    <span>{b}</span>
                                  </li>
                                ))
                              ) : (
                                <li className="flex gap-2 text-slate-400 italic">
                                  <span className="text-[#1D4ED8] shrink-0">•</span>
                                  <span>（此处为题目或要点，可在下载的 PPT 中编辑补充）</span>
                                </li>
                              )}
                            </ul>
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-between items-center px-4 pb-1.5 pt-0.5 border-t border-slate-200">
                        <span className="text-xs text-slate-400">初中数学</span>
                        <span className="text-sm font-bold text-[#3B82F6]">{(safeIndex + 1).toString().padStart(2, '0')} / {slides.length.toString().padStart(2, '0')}</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}
                disabled={!canPrev}
                className="rounded-xl p-2 shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-secondary)' }}
                onMouseEnter={(e) => {
                  if (canPrev) {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (canPrev) {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-card)'
                  }
                }}
                aria-label="上一页"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-xs font-bold min-w-[5rem] text-center px-3 py-1.5 rounded-full" style={{ backgroundColor: 'var(--color-bg-panel)', color: 'var(--color-text-secondary)' }}>
                {slides.length ? `${safeIndex + 1} / ${slides.length}` : '0 / 0'}
              </span>
              <button
                type="button"
                onClick={() => setPreviewIndex((i) => Math.min(slides.length - 1, i + 1))}
                disabled={!canNext}
                className="rounded-xl p-2 shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-secondary)' }}
                onMouseEnter={(e) => {
                  if (canNext) {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-card-hover)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (canNext) {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-card)'
                  }
                }}
                aria-label="下一页"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            {/* Thumbnail list */}
            <div className="flex flex-wrap justify-center gap-2 max-w-2xl">
              {slides.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPreviewIndex(i)}
                  className="w-20 h-14 rounded-xl text-xs truncate px-2 py-1 text-left transition-all"
                  style={
                    safeIndex === i
                      ? { border: '2px solid var(--color-primary-600)', backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 10%, var(--color-bg-card))', color: 'var(--color-primary-700)', fontWeight: 'bold', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }
                      : { border: '2px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-panel)', color: 'var(--color-text-secondary)' }
                  }
                  onMouseEnter={(e) => {
                    if (safeIndex !== i) {
                      e.currentTarget.style.borderColor = 'var(--color-border-secondary)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (safeIndex !== i) {
                      e.currentTarget.style.borderColor = 'var(--color-border-primary)'
                    }
                  }}
                  title={s.title || `第 ${i + 1} 页`}
                >
                  {s.title || `#${i + 1}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
