import { useState } from 'react'
import Latex from 'react-latex-next'
import { ChevronDown, ChevronUp, BookOpen } from 'lucide-react'
import { normalizeLatexForKaTeX } from '../utils/latex'
import 'katex/dist/katex.min.css'

/** 书本/笔记风格的知识点卡片：标题、摘要、要点列表 */
export default function KnowledgeCard({ data }) {
  if (!data || typeof data !== 'object') return null

  const title = data.title ?? ''
  const summary = data.summary ?? ''
  const keyPoints = Array.isArray(data.key_points) ? data.key_points : []

  return (
    <div
      className="rounded-xl shadow-sm overflow-hidden print:bg-white print:border-gray-400 print:shadow-none print:rounded-lg"
      style={{
        border: '1px solid rgba(251, 191, 36, 0.3)',
        backgroundColor: 'color-mix(in srgb, #fbbf24 10%, var(--color-bg-card))'
      }}
    >
      <div
        className="px-5 py-4 print:border-gray-400"
        style={{ borderBottom: '1px solid rgba(251, 191, 36, 0.2)' }}
      >
        <h2 className="flex items-center gap-2 text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
          <BookOpen className="h-5 w-5 shrink-0 print:text-gray-700" style={{ color: '#d97706' }} />
          {title}
        </h2>
      </div>
      <div className="px-5 py-4 space-y-4">
        {summary && (
          <p className="leading-relaxed whitespace-pre-line" style={{ color: 'var(--color-text-primary)' }}>
            <Latex>{normalizeLatexForKaTeX(summary)}</Latex>
          </p>
        )}
        {keyPoints.length > 0 && (
          <div>
            <p className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>重点与易错点</p>
            <ul className="list-disc list-inside space-y-1.5 text-sm" style={{ color: 'var(--color-text-primary)' }}>
              {keyPoints.map((point, i) => (
                <li key={i}>
                  <Latex>{normalizeLatexForKaTeX(String(point))}</Latex>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
