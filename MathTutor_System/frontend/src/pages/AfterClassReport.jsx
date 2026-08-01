import { useCallback, useEffect, useState } from 'react'
import { Copy, FileText, Loader2, PenLine, Sparkles, Star, User } from 'lucide-react'
import toast from 'react-hot-toast'
import { generateAfterClassComment } from '../services/api'
import { useStudent } from '../contexts/StudentContext'
import { AFTER_CLASS_TEMPLATES } from '../constants/after-class-templates'
import { EmptyState, PageHeader, PageShell, SectionCard, StatusBadge } from '../components/UiV2'

const STAR_LABELS = ['待提升', '一般', '尚可', '较好', '很好']
const QUICK_KEYWORDS = ['粗心', '有进步', '计算', '书写', '专注', '积极', '需巩固', '配合度高']
const TEMPLATE_STORAGE_KEY = 'after_class_report_template'

function StarRating({ value, onChange, label, disabled }) {
  return (
    <div className="v2-star-row">
      <span>{label}</span>
      <div role="group" aria-label={`${label} 1-5 星`}>
        {[1, 2, 3, 4, 5].map((num) => (
          <button key={num} type="button" disabled={disabled} aria-label={`${num} 星`} aria-pressed={value >= num} className={value >= num ? 'active' : ''} onClick={() => onChange(num)}>
            <Star className="h-5 w-5 fill-current" />
          </button>
        ))}
      </div>
      <strong>{STAR_LABELS[value - 1]}</strong>
    </div>
  )
}

export default function AfterClassReport({ embedded = false, studentNameHint = '', reportPeriod = '4w' }) {
  const { currentStudent } = useStudent()
  const [focusLevel, setFocusLevel] = useState(3)
  const [masteryLevel, setMasteryLevel] = useState(3)
  const [keyword1, setKeyword1] = useState('')
  const [keyword2, setKeyword2] = useState('')
  const [studentName, setStudentName] = useState(studentNameHint || '')
  const [draft, setDraft] = useState('')
  const [template, setTemplate] = useState(() => {
    try { return localStorage.getItem(TEMPLATE_STORAGE_KEY) || '' } catch { return '' }
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [comment, setComment] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (studentNameHint && !studentName) setStudentName(studentNameHint)
  }, [studentName, studentNameHint])

  useEffect(() => {
    try { if (template) localStorage.setItem(TEMPLATE_STORAGE_KEY, template) } catch {}
  }, [template])

  const displayName = (studentName || currentStudent?.name || '').trim()
  const keywords = [keyword1.trim(), keyword2.trim()].filter(Boolean)
  const canGenerate = keywords.length >= 1 && !loading
  const canPolish = draft.trim().length > 0 && !loading

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) {
      setError('请至少输入一个关键词')
      return
    }
    setLoading(true)
    setError('')
    setComment('')
    try {
      const data = await generateAfterClassComment({ focus_level: focusLevel, mastery_level: masteryLevel, keywords, student_name: displayName || undefined })
      setComment(data.comment || '')
      toast.success('课后评语已生成')
    } catch (err) {
      const message = err?.response?.data?.detail || err?.message || '生成失败'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [canGenerate, displayName, focusLevel, keywords, masteryLevel])

  const handlePolish = useCallback(async () => {
    if (!canPolish) {
      setError('请先输入草稿')
      return
    }
    setLoading(true)
    setError('')
    setComment('')
    try {
      const data = await generateAfterClassComment({ draft: draft.trim(), template: template.trim() || undefined, student_name: displayName || undefined })
      setComment(data.comment || '')
      toast.success('草稿已修饰')
    } catch (err) {
      const message = err?.response?.data?.detail || err?.message || '修饰失败'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [canPolish, displayName, draft, template])

  const handleCopy = () => {
    if (!comment.trim()) return
    navigator.clipboard.writeText(comment).then(() => {
      setCopied(true)
      toast.success('已复制到剪贴板')
      setTimeout(() => setCopied(false), 1600)
    }, () => toast.error('复制失败'))
  }

  const content = (
    <section className="v2-report-workbench">
      <div className="v2-report-editor">
        <SectionCard title="课后总结" description="按课堂表现和关键词调用现有评语生成接口。">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="v2-field"><span>学生姓名</span><input value={studentName} onChange={(event) => setStudentName(event.target.value)} placeholder={currentStudent?.name || '可选'} /></label>
            <label className="v2-field"><span>报告周期</span><input value={reportPeriod === '1w' ? '近 1 周' : reportPeriod === '4w' ? '近 4 周' : '本学期'} readOnly /></label>
          </div>
          <div className="mt-4 grid gap-3">
            <StarRating label="专注度" value={focusLevel} onChange={setFocusLevel} disabled={loading} />
            <StarRating label="掌握度" value={masteryLevel} onChange={setMasteryLevel} disabled={loading} />
          </div>
          <div className="mt-4">
            <p className="mb-2 text-xs font-black text-slate-400">关键词</p>
            <div className="mb-3 flex flex-wrap gap-2">
              {QUICK_KEYWORDS.map((word) => (
                <button key={word} type="button" className="v2-chip" disabled={loading} onClick={() => (!keyword1 ? setKeyword1(word) : setKeyword2(word))}>{word}</button>
              ))}
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <input className="v2-report-input" value={keyword1} onChange={(event) => setKeyword1(event.target.value)} placeholder="关键词 1" />
              <input className="v2-report-input" value={keyword2} onChange={(event) => setKeyword2(event.target.value)} placeholder="关键词 2（可选）" />
            </div>
          </div>
          <button type="button" className="v2-btn-primary mt-4" disabled={loading || !canGenerate} onClick={handleGenerate}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            生成课后评语
          </button>
        </SectionCard>

        <SectionCard title="问题与建议" description="已有草稿时可按模板修饰，不伪造 AI 输出。">
          <div className="mb-3 flex flex-wrap gap-2">
            {AFTER_CLASS_TEMPLATES.slice(0, 6).map((item) => (
              <button key={item.id} type="button" className={`v2-chip ${template === item.content ? 'active' : ''}`} disabled={loading} onClick={() => setTemplate(item.content)}>{item.title}</button>
            ))}
          </div>
          <label className="v2-field"><span>模板</span><textarea rows={3} value={template} onChange={(event) => setTemplate(event.target.value)} placeholder="可选：粘贴自定义家长沟通模板" /></label>
          <label className="v2-field mt-3"><span>草稿</span><textarea rows={4} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="写一段课堂表现，再由 AI 修饰。" /></label>
          <button type="button" className="v2-btn-secondary mt-4" disabled={loading || !canPolish} onClick={handlePolish}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
            AI 修饰草稿
          </button>
        </SectionCard>
        {error && <p className="v2-inline-error" role="alert">{error}</p>}
      </div>

      <aside className="v2-report-preview">
        <h2>家长反馈预览</h2>
        {comment ? (
          <div className="space-y-3">
            <div className="v2-report-comment">{comment}</div>
            <button type="button" className="v2-btn-secondary" onClick={handleCopy}><Copy className="h-4 w-4" />{copied ? '已复制' : '复制评语'}</button>
          </div>
        ) : (
          <EmptyState icon={FileText} title="暂无报告内容" description="生成或修饰后，课后反馈会显示在这里。" />
        )}
        <div className="mt-4 grid gap-2">
          <div className="v2-report-mini"><User className="h-4 w-4 text-indigo-300" /><span>学生</span><strong>{displayName || '未指定'}</strong></div>
          <div className="v2-report-mini"><Star className="h-4 w-4 text-amber-300" /><span>课堂表现</span><strong>{STAR_LABELS[focusLevel - 1]}</strong></div>
        </div>
      </aside>
    </section>
  )

  if (embedded) return content
  return (
    <PageShell>
      <PageHeader title="课后报告" description="按课堂表现生成面向家长的课后反馈。" icon={FileText} meta={<StatusBadge tone="primary">独立入口</StatusBadge>} />
      {content}
    </PageShell>
  )
}
