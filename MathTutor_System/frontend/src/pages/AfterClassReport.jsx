import { useState, useCallback, useRef, useEffect } from 'react'
import { FileText, Loader2, Copy, Sparkles, Star, User, PenLine } from 'lucide-react'
import toast from 'react-hot-toast'
import { generateAfterClassComment } from '../services/api'
import { useStudent } from '../contexts/StudentContext'
import { AFTER_CLASS_TEMPLATES } from '../constants/after-class-templates'

const STAR_LABELS = ['待提升', '一般', '尚可', '较好', '很好']
const QUICK_KEYWORDS = ['粗心', '有进步', '计算', '书写', '专注', '积极', '需巩固', '配合度高']
const TEMPLATE_STORAGE_KEY = 'after_class_report_template'

function StarRating({ value, onChange, label, activeColor, disabled }) {
  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      <span className="w-12 sm:w-14 shrink-0 text-xs sm:text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <div className="flex gap-0.5" role="group" aria-label={`${label} 1-5 星`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            disabled={disabled}
            className={`rounded p-0.5 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 ${
              value >= n ? activeColor : ''
            }`}
            style={value >= n ? {} : { color: 'var(--color-border-strong)' }}
            onMouseEnter={(e) => {
              if (value < n) {
                e.currentTarget.style.color = 'var(--color-text-muted)'
              }
            }}
            onMouseLeave={(e) => {
              if (value < n) {
                e.currentTarget.style.color = 'var(--color-border-strong)'
              }
            }}
            aria-label={`${n} 星`}
            aria-pressed={value >= n}
          >
            <Star className="h-6 w-6 sm:h-7 sm:w-7 fill-current" strokeWidth={1.5} />
          </button>
        ))}
      </div>
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{STAR_LABELS[value - 1]}</span>
    </div>
  )
}

export default function AfterClassReport({ embedded = false }) {
  const { currentStudent } = useStudent()
  const [focusLevel, setFocusLevel] = useState(3)
  const [masteryLevel, setMasteryLevel] = useState(3)
  const [keyword1, setKeyword1] = useState('')
  const [keyword2, setKeyword2] = useState('')
  const [studentName, setStudentName] = useState('')
  const [loading, setLoading] = useState(false)
  const [comment, setComment] = useState('')
  const [copied, setCopied] = useState(false)
  const resultRef = useRef(null)

  const [draft, setDraft] = useState('')
  const [template, setTemplate] = useState(() => {
    try {
      return typeof localStorage !== 'undefined' ? (localStorage.getItem(TEMPLATE_STORAGE_KEY) || '') : ''
    } catch {
      return ''
    }
  })
  const displayName = (studentName || currentStudent?.name || '').trim()
  const keywords = [keyword1.trim(), keyword2.trim()].filter(Boolean)
  const canGenerate = keywords.length >= 1 && !loading
  const canPolish = draft.trim().length > 0 && !loading

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return
    setLoading(true)
    setComment('')
    try {
      const data = await generateAfterClassComment({
        focus_level: focusLevel,
        mastery_level: masteryLevel,
        keywords,
        student_name: displayName || undefined,
      })
      setComment(data.comment || '')
      toast.success('评语已生成，可复制发送给家长')
    } catch (err) {
      const msg = err.response?.data?.detail ?? err.message
      toast.error('生成失败：' + (typeof msg === 'string' ? msg : '请检查设置中的 API Key 与网络'))
    } finally {
      setLoading(false)
    }
  }, [focusLevel, masteryLevel, keyword1, keyword2, displayName, canGenerate])

  const handlePolish = useCallback(async () => {
    if (!canPolish) return
    setLoading(true)
    setComment('')
    try {
      const data = await generateAfterClassComment({
        draft: draft.trim(),
        template: template.trim() || undefined,
        student_name: displayName || undefined,
      })
      setComment(data.comment || '')
      toast.success('已修饰完成，可复制发送给家长')
    } catch (err) {
      const msg = err.response?.data?.detail ?? err.message
      toast.error('修饰失败：' + (typeof msg === 'string' ? msg : '请检查设置中的 API Key 与网络'))
    } finally {
      setLoading(false)
    }
  }, [draft, template, displayName, canPolish])

  useEffect(() => {
    if (template && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(TEMPLATE_STORAGE_KEY, template)
      } catch (_) {}
    }
  }, [template])

  useEffect(() => {
    if (comment && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [comment])

  const handleCopy = useCallback(() => {
    if (!comment.trim()) return
    navigator.clipboard.writeText(comment).then(
      () => {
        setCopied(true)
        toast.success('已复制到剪贴板')
        setTimeout(() => setCopied(false), 2000)
      },
      () => toast.error('复制失败')
    )
  }, [comment])

  const addKeyword = useCallback((word) => {
    if (!keyword1.trim()) setKeyword1(word)
    else if (!keyword2.trim()) setKeyword2(word)
    else setKeyword2(word)
  }, [keyword1, keyword2])

  const useCurrentStudent = useCallback(() => {
    if (currentStudent?.name) setStudentName(currentStudent.name)
    else toast.error('请先在左侧选择学生')
  }, [currentStudent?.name])

  const content = (
    <main className={embedded ? 'mx-auto max-w-4xl pt-4' : 'mx-auto max-w-4xl px-4 sm:px-6 py-4 sm:py-6'}>
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
          {/* 方式一：按状态与关键词生成 */}
          <section className="rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-sm" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }}>
            <div className="mb-5 flex items-center gap-2 pb-4" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 15%, transparent)', color: 'var(--color-primary-600)' }}>
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>方式一：按状态生成</h2>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>选专注度、掌握度与关键词，一键生成评语</p>
              </div>
            </div>
            <div className="space-y-5">
              <div className="rounded-xl p-4" style={{ backgroundColor: 'color-mix(in srgb, var(--color-bg-panel) 80%, transparent)' }}>
                <span className="mb-3 block text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>今日状态</span>
                <div className="space-y-3">
                  <StarRating
                    label="专注度"
                    value={focusLevel}
                    onChange={setFocusLevel}
                    activeColor="text-blue-600"
                    disabled={loading}
                  />
                  <StarRating
                    label="掌握度"
                    value={masteryLevel}
                    onChange={setMasteryLevel}
                    activeColor="text-indigo-600"
                    disabled={loading}
                  />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>关键词（至少 1 个）</label>
                <div className="mb-2 flex flex-wrap gap-2">
                  {QUICK_KEYWORDS.map((word) => (
                    <button
                      key={word}
                      type="button"
                      onClick={() => addKeyword(word)}
                      disabled={loading}
                      className="rounded-full px-3 py-1.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50"
                      style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-elevated)', color: 'var(--color-text-secondary)' }}
                      onMouseEnter={(e) => {
                        if (!loading) {
                          e.currentTarget.style.borderColor = 'var(--color-primary-500)'
                          e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)'
                          e.currentTarget.style.color = 'var(--color-primary-700)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!loading) {
                          e.currentTarget.style.borderColor = 'var(--color-border-primary)'
                          e.currentTarget.style.backgroundColor = 'var(--color-bg-elevated)'
                          e.currentTarget.style.color = 'var(--color-text-secondary)'
                        }
                      }}
                    >
                      {word}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={keyword1}
                    onChange={(e) => setKeyword1(e.target.value)}
                    placeholder="关键词 1"
                    className="rounded-lg px-3 py-2 text-sm focus:outline-none disabled:opacity-60"
                    style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-primary-500)'
                      e.currentTarget.style.boxShadow = '0 0 0 1px var(--color-primary-500)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-border-primary)'
                      e.currentTarget.style.boxShadow = ''
                    }}
                    disabled={loading}
                  />
                  <input
                    type="text"
                    value={keyword2}
                    onChange={(e) => setKeyword2(e.target.value)}
                    placeholder="关键词 2（选填）"
                    className="rounded-lg px-3 py-2 text-sm focus:outline-none disabled:opacity-60"
                    style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-primary-500)'
                      e.currentTarget.style.boxShadow = '0 0 0 1px var(--color-primary-500)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-border-primary)'
                      e.currentTarget.style.boxShadow = ''
                    }}
                    disabled={loading}
                  />
                </div>
                {!canGenerate && keyword1.trim() === '' && (
                  <p className="mt-1.5 text-xs text-amber-600">请至少输入或点击一个关键词</p>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>学生姓名（选填）</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder={currentStudent?.name ? `当前：${currentStudent.name}` : '不填则用「孩子」'}
                    className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none disabled:opacity-60"
                    style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-primary-500)'
                      e.currentTarget.style.boxShadow = '0 0 0 1px var(--color-primary-500)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-border-primary)'
                      e.currentTarget.style.boxShadow = ''
                    }}
                    disabled={loading}
                  />
                  {currentStudent?.name && (
                    <button
                      type="button"
                      onClick={useCurrentStudent}
                      disabled={loading}
                      className="shrink-0 rounded-lg px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 disabled:opacity-50"
                      style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-elevated)', color: 'var(--color-text-secondary)' }}
                      onMouseEnter={(e) => {
                        if (!loading) {
                          e.currentTarget.style.backgroundColor = 'var(--color-bg-panel)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!loading) {
                          e.currentTarget.style.backgroundColor = 'var(--color-bg-elevated)'
                        }
                      }}
                      title="使用当前学生"
                    >
                      <User className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="w-full rounded-xl py-3 font-medium text-white shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-primary-600)' }}
                onMouseEnter={(e) => {
                  if (canGenerate) {
                    e.currentTarget.style.backgroundColor = 'var(--color-primary-700)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (canGenerate) {
                    e.currentTarget.style.backgroundColor = 'var(--color-primary-600)'
                  }
                }}
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    生成中…
                  </span>
                ) : (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    生成评语
                  </span>
                )}
              </button>
            </div>
          </section>

          {/* 方式二：按草稿修饰 */}
          <section className="rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-sm" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }}>
            <div className="mb-5 flex items-center gap-2 pb-4" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                <PenLine className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>方式二：草稿 + 模板修饰</h2>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>选模板、写草稿，AI 按风格输出评语</p>
              </div>
            </div>
            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>修饰模板（可选）</label>
                <div className="max-h-32 overflow-y-auto rounded-lg p-2" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'color-mix(in srgb, var(--color-bg-panel) 50%, transparent)' }}>
                  <div className="flex flex-wrap gap-1.5">
                    {AFTER_CLASS_TEMPLATES.map((t) => {
                      const isSelected = template.trim() === t.content
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setTemplate(t.content)
                            toast.success(`已应用：${t.title}`)
                          }}
                          disabled={loading}
                          className="rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50"
                          style={
                            isSelected
                              ? { backgroundColor: '#a78bfa', color: 'white' }
                              : { backgroundColor: 'var(--color-bg-elevated)', color: 'var(--color-text-secondary)', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)', border: '1px solid var(--color-border-primary)' }
                          }
                          onMouseEnter={(e) => {
                            if (!isSelected && !loading) {
                              e.currentTarget.style.backgroundColor = 'color-mix(in srgb, #a78bfa 10%, transparent)'
                              e.currentTarget.style.color = '#a78bfa'
                              e.currentTarget.style.borderColor = 'color-mix(in srgb, #a78bfa 50%, transparent)'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected && !loading) {
                              e.currentTarget.style.backgroundColor = 'var(--color-bg-elevated)'
                              e.currentTarget.style.color = 'var(--color-text-secondary)'
                              e.currentTarget.style.borderColor = 'var(--color-border-primary)'
                            }
                          }}
                        >
                          {t.title}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="mt-2 flex flex-col sm:flex-row gap-2">
                  <textarea
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                    placeholder="或粘贴自定义范文…"
                    rows={2}
                    className="min-h-0 min-w-0 flex-1 resize-y rounded-lg px-3 py-2 text-sm focus:outline-none disabled:opacity-60"
                    style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#a78bfa'
                      e.currentTarget.style.boxShadow = '0 0 0 1px #a78bfa'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-border-primary)'
                      e.currentTarget.style.boxShadow = ''
                    }}
                    disabled={loading}
                  />
                  {template.trim() && (
                    <button
                      type="button"
                      onClick={() => setTemplate('')}
                      disabled={loading}
                      className="shrink-0 self-start sm:self-start rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                      style={{ color: 'var(--color-text-muted)' }}
                      onMouseEnter={(e) => {
                        if (!loading) {
                          e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--color-bg-panel) 60%, transparent)'
                          e.currentTarget.style.color = '#dc2626'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!loading) {
                          e.currentTarget.style.backgroundColor = 'transparent'
                          e.currentTarget.style.color = 'var(--color-text-muted)'
                        }
                      }}
                    >
                      清空
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>草稿</label>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="写一段今日表现，如：今天讲了一元二次方程，他听得认真但做题有点粗心…"
                  rows={4}
                  className="w-full resize-y rounded-lg px-3 py-2.5 text-sm focus:outline-none disabled:opacity-60"
                  style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#a78bfa'
                    e.currentTarget.style.boxShadow = '0 0 0 1px #a78bfa'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border-primary)'
                    e.currentTarget.style.boxShadow = ''
                  }}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={handlePolish}
                  disabled={!canPolish}
                  className="mt-3 w-full rounded-xl py-2.5 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ border: '2px solid #a78bfa', backgroundColor: 'var(--color-bg-elevated)', color: '#a78bfa' }}
                  onMouseEnter={(e) => {
                    if (canPolish) {
                      e.currentTarget.style.backgroundColor = 'color-mix(in srgb, #a78bfa 10%, transparent)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (canPolish) {
                      e.currentTarget.style.backgroundColor = 'var(--color-bg-elevated)'
                    }
                  }}
                >
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      修饰中…
                    </span>
                  ) : (
                    <span className="inline-flex items-center justify-center gap-2">
                      <PenLine className="h-4 w-4" />
                      AI 修饰
                    </span>
                  )}
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* 结果区 */}
        <div ref={resultRef} className="mt-4 sm:mt-6 scroll-mt-6">
          {comment ? (
            <div className="rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-sm" style={{ border: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }}>
              <div className="mb-4 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-3">
                <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>生成的评语</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="rounded-full px-2.5 py-1 text-xs" style={{ backgroundColor: 'var(--color-bg-panel)', color: 'var(--color-text-muted)' }}>
                    {comment.length} 字
                  </span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    aria-label="复制评语"
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2"
                    style={
                      copied
                        ? { backgroundColor: 'color-mix(in srgb, #059669 15%, transparent)', color: '#047857' }
                        : { backgroundColor: 'var(--color-primary-600)', color: 'white' }
                    }
                    onMouseEnter={(e) => {
                      if (!copied) {
                        e.currentTarget.style.backgroundColor = 'var(--color-primary-700)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!copied) {
                        e.currentTarget.style.backgroundColor = 'var(--color-primary-600)'
                      }
                    }}
                  >
                    <Copy className="h-4 w-4" />
                    {copied ? '已复制' : '复制'}
                  </button>
                </div>
              </div>
              <div className="rounded-xl p-4" style={{ backgroundColor: 'color-mix(in srgb, var(--color-bg-panel) 80%, transparent)' }}>
                <p className="whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>{comment}</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl sm:rounded-2xl py-10 sm:py-12 px-4 text-center" style={{ border: '2px dashed var(--color-border-primary)', backgroundColor: 'var(--color-bg-card)' }}>
              <FileText className="mb-3 h-10 w-10 sm:h-12 sm:w-12" style={{ color: 'var(--color-border-strong)' }} />
              <p className="max-w-sm text-xs sm:text-sm" style={{ color: 'var(--color-text-muted)' }}>
                上方用「方式一」按状态与关键词生成，或用「方式二」写草稿后 AI 修饰，评语将显示在此处。
              </p>
            </div>
          )}
        </div>
    </main>
  )

  if (embedded) return content
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'color-mix(in srgb, var(--color-bg-panel) 60%, transparent)' }}>
      <header className="px-6 py-5" style={{ borderBottom: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-elevated)' }}>
        <div className="mx-auto flex max-w-4xl items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ backgroundColor: 'var(--color-primary-600)' }}>
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>课后报告生成器</h1>
            <p className="mt-0.5 text-sm" style={{ color: 'var(--color-text-muted)' }}>
              按状态与关键词生成，或输入草稿由 AI 按模板修饰，复制即可发给家长
            </p>
          </div>
        </div>
      </header>
      {content}
    </div>
  )
}
