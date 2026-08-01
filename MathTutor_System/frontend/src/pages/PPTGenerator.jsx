import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Download, FileText, Loader2, Presentation, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { buildPPTFile, generatePPT } from '../services/api'
import { EmptyState, PageHeader, PageShell, SectionCard, StatusBadge } from '../components/UiV2'

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
  const [error, setError] = useState('')

  const allSlides = content?.slides ?? []
  const slides = useMemo(() => allSlides.filter((slide) => (slide.layout || 'layout').toString().toLowerCase() !== 'section'), [allSlides])
  const safeIndex = slides.length > 0 ? Math.min(previewIndex, slides.length - 1) : 0
  const currentSlide = slides[safeIndex]
  const canPrev = previewIndex > 0
  const canNext = previewIndex < slides.length - 1
  const selectedGrade = GRADES.find((item) => item.value === grade)?.label || grade

  useEffect(() => {
    if (slides.length > 0 && previewIndex >= slides.length) setPreviewIndex(slides.length - 1)
  }, [previewIndex, slides.length])

  const handleGenerate = useCallback(async () => {
    const trimmedTopic = topic.trim()
    setError('')
    if (!trimmedTopic) {
      setError('请填写主题')
      toast.error('请填写主题')
      return
    }
    setLoading(true)
    setContent(null)
    try {
      const data = await generatePPT({ topic: trimmedTopic, grade })
      setContent(data)
      setPptFilename(trimmedTopic)
      setPreviewIndex(0)
      toast.success('已成功生成 Magic PPT，可在下方预览')
    } catch (err) {
      if (err.upgradeRequired) {
        toast.error(err.upgradeMessage || '该功能需升级至专业版套餐')
        navigate('/pricing')
        return
      }
      const message = err.response?.data?.detail ?? err.message ?? '生成失败'
      setError(message)
      toast.error('生成失败：' + message)
    } finally {
      setLoading(false)
    }
  }, [grade, navigate, topic])

  const handleDownload = useCallback(async () => {
    if (!content || !content.slides?.length) return
    setDownloading(true)
    setError('')
    try {
      const payload = { ...content, filename: pptFilename.trim() || topic.trim() || 'Lesson' }
      const { blob, filename } = await buildPPTFile(payload)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast.success('PPT 已开始下载')
    } catch (err) {
      if (err.upgradeRequired) {
        toast.error(err.upgradeMessage || '该功能需升级至专业版套餐')
        navigate('/pricing')
        return
      }
      const message = err.response?.data?.detail ?? err.message ?? '下载失败'
      setError(message)
      toast.error('下载失败：' + message)
    } finally {
      setDownloading(false)
    }
  }, [content, navigate, pptFilename, topic])

  return (
    <PageShell className="space-y-5">
      <PageHeader
        title="Magic PPT"
        description="基于现有主题与学段生成接口构建教学幻灯片，不展示不存在的模板市场或素材库。"
        icon={Presentation}
        meta={<StatusBadge tone="primary">{content ? '已生成预览' : '创作工作台'}</StatusBadge>}
      />

      <section className="v2-ppt-workbench">
        <aside className="v2-ppt-config">
          <SectionCard title="参数设置" description="当前接口支持主题和学段。">
            <div className="grid gap-4">
              <label className="v2-field">
                <span>教学主题 / 知识点</span>
                <input value={topic} onChange={(event) => setTopic(event.target.value)} disabled={loading} placeholder="例如：勾股定理、一元二次方程" />
              </label>
              <div>
                <p className="mb-2 text-xs font-black text-slate-400">学段分类</p>
                <div className="v2-ppt-grade-tabs">
                  {GRADES.map((item) => (
                    <button key={item.value} type="button" className={grade === item.value ? 'active' : ''} disabled={loading} onClick={() => setGrade(item.value)}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              {error && <p className="v2-inline-error" role="alert">{error}</p>}
              <button type="button" className="v2-btn-primary" onClick={handleGenerate} disabled={loading || !topic.trim()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                生成教学幻灯片
              </button>
            </div>
          </SectionCard>

          <SectionCard title="当前配置" description="仅汇总真实可提交参数。">
            <div className="v2-ppt-config-summary">
              <div><span>主题</span><strong>{topic.trim() || '未填写'}</strong></div>
              <div><span>学段</span><strong>{selectedGrade}</strong></div>
              <div><span>输出</span><strong>{slides.length ? `${slides.length} 页` : '等待生成'}</strong></div>
            </div>
          </SectionCard>

          <SectionCard title="模板与场景" description="当前没有模板列表 API。">
            <EmptyState icon={FileText} title="暂无真实模板数据" description="不会用固定假模板填充页面。" />
          </SectionCard>
        </aside>

        <main className="v2-ppt-preview-zone">
          <SectionCard
            title="幻灯片预览"
            description={content ? `文件主题：${content.title || topic}` : '生成成功后展示真实返回的 slide 内容。'}
            actions={content && slides.length > 0 ? (
              <button type="button" className="v2-btn-secondary" disabled={downloading} onClick={handleDownload}>
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                下载 .pptx
              </button>
            ) : null}
          >
            {loading ? (
              <div className="v2-ppt-loading"><Loader2 className="h-8 w-8 animate-spin" /><strong>正在生成幻灯片</strong><p>等待现有 Magic PPT 接口返回。</p></div>
            ) : currentSlide ? (
              <div className="v2-ppt-stage">
                <div className="v2-ppt-slide">
                  <div className="v2-ppt-slide-ribbon">{selectedGrade}数学</div>
                  <h2>{currentSlide.title || content?.title || topic}</h2>
                  {currentSlide.subtitle && <p>{currentSlide.subtitle}</p>}
                  <ul>
                    {(currentSlide.bullets || []).length > 0 ? currentSlide.bullets.map((item, index) => <li key={`${item}-${index}`}>{item}</li>) : <li>此页暂无要点，下载后可继续编辑。</li>}
                  </ul>
                  <span>{String(safeIndex + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}</span>
                </div>
                <div className="v2-ppt-controls">
                  <button type="button" className="v2-icon-button" onClick={() => setPreviewIndex((index) => Math.max(0, index - 1))} disabled={!canPrev} aria-label="上一页"><ChevronLeft className="h-4 w-4" /></button>
                  <strong>{safeIndex + 1} / {slides.length}</strong>
                  <button type="button" className="v2-icon-button" onClick={() => setPreviewIndex((index) => Math.min(slides.length - 1, index + 1))} disabled={!canNext} aria-label="下一页"><ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>
            ) : (
              <EmptyState icon={Presentation} title="暂无生成结果" description="填写主题后调用生成接口，预览区不会伪造幻灯片。" />
            )}
          </SectionCard>
        </main>

        <aside className="v2-ppt-outline">
          <SectionCard title="生成结果" description="展示真实返回的页面结构。">
            {slides.length > 0 ? (
              <div className="v2-ppt-thumbs">
                {slides.map((slide, index) => (
                  <button key={`${slide.title}-${index}`} type="button" className={safeIndex === index ? 'active' : ''} onClick={() => setPreviewIndex(index)}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{slide.title || `第 ${index + 1} 页`}</strong>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState icon={AlertCircle} title="结果为空" description="接口返回 slides 后会在这里列出。" />
            )}
          </SectionCard>
          {content && slides.length > 0 && (
            <SectionCard title="文件名" description="下载时传给现有 build-pptx 接口。">
              <label className="v2-field">
                <span>文件名</span>
                <input value={pptFilename} onChange={(event) => setPptFilename(event.target.value)} placeholder="默认为主题名" />
              </label>
              <div className="mt-3 flex items-center gap-2 text-xs font-bold text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                <span>可下载为 .pptx</span>
              </div>
            </SectionCard>
          )}
        </aside>
      </section>
    </PageShell>
  )
}
