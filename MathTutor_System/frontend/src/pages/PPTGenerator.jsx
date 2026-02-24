import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Presentation, Loader2, Sparkles, Download, ChevronLeft, ChevronRight } from 'lucide-react'
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
      toast.success('已生成，可在下方预览')
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

  // 与后端一致：不单独展示分节页（「以下为本章内容」那种），只保留 title 与 content
  const allSlides = content?.slides ?? []
  const slides = allSlides.filter((s) => (s.layout || 'content').toString().toLowerCase() !== 'section')
  const safeIndex = slides.length > 0 ? Math.min(previewIndex, slides.length - 1) : 0
  const currentSlide = slides[safeIndex]
  const canPrev = previewIndex > 0
  const canNext = previewIndex < slides.length - 1

  useEffect(() => {
    if (slides.length > 0 && previewIndex >= slides.length) setPreviewIndex(slides.length - 1)
  }, [content, slides.length, previewIndex])

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Presentation className="h-8 w-8 text-indigo-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-800">Magic PPT 生成</h1>
          <p className="text-sm text-gray-500">
            输入数学主题与学段，AI 生成教学幻灯片并下载 .pptx
          </p>
        </div>
      </div>

      <div className="max-w-xl space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">主题</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="如：勾股定理、一元二次方程、二次函数"
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-800 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            disabled={loading}
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">学段</label>
          <div className="flex flex-wrap gap-2">
            {GRADES.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => setGrade(g.value)}
                disabled={loading}
                className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  grade === g.value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading || !topic.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed active:bg-indigo-800"
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              正在生成…
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5" />
              生成幻灯片
            </>
          )}
        </button>
      </div>

      {/* 网站内预览 */}
      {content && slides.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3 bg-gray-50">
            <h2 className="text-base font-semibold text-gray-800">幻灯片预览</h2>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 whitespace-nowrap">文件名</label>
                <input
                  type="text"
                  value={pptFilename}
                  onChange={(e) => setPptFilename(e.target.value)}
                  placeholder="默认为主题名"
                  className="w-40 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-400">.pptx</span>
              </div>
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
              >
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                下载 PPT
              </button>
            </div>
          </div>

          <div className="p-6 flex flex-col items-center gap-4">
            {/* 当前页大预览（与下载的 PPT 版式一致：背景、竖条、分节、页脚） */}
            <div className="w-full max-w-2xl aspect-video rounded-xl border border-slate-200 shadow-lg flex flex-col overflow-hidden bg-[#FAFCFE]">
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
                  ) : currentSlide.layout === 'section' ? (
                    <div className="flex-1 flex flex-col">
                      <div className="w-full py-5 px-6 rounded-b-xl bg-gradient-to-r from-[#1D4ED8] via-[#256EE0] to-[#0D948D]">
                        <h3 className="text-xl font-bold text-white drop-shadow-sm">
                          {currentSlide.title || '本节要点'}
                        </h3>
                      </div>
                      <div className="flex-1 flex items-center justify-center px-6">
                        <div className="rounded-xl bg-slate-100/90 px-6 py-3.5 border border-slate-200/80 shadow-inner">
                          <p className="text-sm text-slate-500 tracking-widest">—— 以下为本章内容 ——</p>
                        </div>
                      </div>
                      <div className="flex justify-between items-center px-6 py-2 border-t border-slate-200">
                        <span className="text-xs text-slate-400">初中数学</span>
                        <span className="text-sm font-bold text-[#3B82F6]">{(safeIndex + 1).toString().padStart(2, '0')} / {slides.length.toString().padStart(2, '0')}</span>
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
                          <div className="flex-1 rounded-xl bg-white border border-slate-200/90 px-4 py-3 min-h-0 overflow-auto shadow-md shadow-slate-200/80">
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

            {/* 上一页 / 下一页 */}
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}
                disabled={!canPrev}
                className="rounded-lg border border-gray-300 bg-white p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="上一页"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <span className="text-sm text-gray-500 min-w-[4rem] text-center">
                {slides.length ? `${safeIndex + 1} / ${slides.length}` : '0 / 0'}
              </span>
              <button
                type="button"
                onClick={() => setPreviewIndex((i) => Math.min(slides.length - 1, i + 1))}
                disabled={!canNext}
                className="rounded-lg border border-gray-300 bg-white p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="下一页"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </div>

            {/* 缩略图列表 */}
            <div className="flex flex-wrap justify-center gap-2">
              {slides.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPreviewIndex(i)}
                  className={`w-20 h-14 rounded border-2 text-xs truncate px-1 py-0.5 text-left transition-colors ${
                    safeIndex === i
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-800'
                      : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                  }`}
                  title={s.title || `第 ${i + 1} 页`}
                >
                  {s.title || `#${i + 1}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-500">
        使用前端「设置」中的 API（如 DeepSeek）生成内容；生成时间约 30 秒～2 分钟，请耐心等待。生成后可在页面内预览，再点击「下载 PPT」获取 .pptx 文件。
      </p>
    </div>
  )
}
