import { useState } from 'react'
import Latex from 'react-latex-next'
import { ChevronDown, ChevronUp, Lightbulb } from 'lucide-react'
import { normalizeLatexForKaTeX } from '../utils/latex'
import 'katex/dist/katex.min.css'

/** 将字面量 \n 转为换行 */
function normalizeText(text) {
  if (!text || typeof text !== 'string') return ''
  return text.replace(/\\n/g, '\n')
}

/** 例题列表：可折叠的题干 + 解析（保姆级详解） */
export default function ExampleList({ data }) {
  const [expandedIndex, setExpandedIndex] = useState(null)
  const examples = Array.isArray(data) ? data : []

  if (examples.length === 0) return null

  return (
    <div
      className="rounded-xl shadow-sm overflow-hidden"
      style={{
        border: '1px solid rgba(59, 130, 246, 0.3)',
        backgroundColor: 'color-mix(in srgb, #3b82f6 10%, var(--color-bg-card))'
      }}
    >
      <div
        className="px-5 py-3"
        style={{ borderBottom: '1px solid rgba(59, 130, 246, 0.2)' }}
      >
        <h3 className="flex items-center gap-2 text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
          <Lightbulb className="h-4 w-4 shrink-0" style={{ color: '#2563eb' }} />
          典型例题
        </h3>
      </div>
      <ul style={{ borderTop: '1px solid rgba(59, 130, 246, 0.15)' }}>
        {examples.map((ex, i) => {
          const content = ex.content ?? ''
          const analysis = normalizeText(ex.analysis ?? '')
          const expanded = expandedIndex === i
          return (
            <li key={i} style={i > 0 ? { borderTop: '1px solid rgba(59, 130, 246, 0.15)' } : {}}>
              <div className="px-5 py-3">
                <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
                  <Latex>{normalizeLatexForKaTeX(content)}</Latex>
                </p>
                <button
                  type="button"
                  onClick={() => setExpandedIndex(expanded ? null : i)}
                  className="mt-2 flex items-center gap-1.5 text-sm font-medium"
                  style={{ color: '#2563eb' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#1d4ed8'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#2563eb'
                  }}
                >
                  {expanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                  {expanded ? '收起解析' : '查看详解'}
                </button>
              </div>
              {expanded && analysis && (
                <div
                  className="px-5 py-4"
                  style={{
                    borderTop: '1px solid rgba(59, 130, 246, 0.15)',
                    backgroundColor: 'color-mix(in srgb, var(--color-bg-card) 70%, transparent)'
                  }}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-secondary)' }}>解析</p>
                  <div className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--color-text-primary)' }}>
                    <Latex>{normalizeLatexForKaTeX(analysis)}</Latex>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
