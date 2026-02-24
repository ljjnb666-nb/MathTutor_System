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
    <div className="rounded-xl border border-amber-200/80 bg-amber-50/90 shadow-sm overflow-hidden print:bg-white print:border-gray-400 print:shadow-none print:rounded-lg">
      <div className="border-b border-amber-200/60 px-5 py-4 print:border-gray-400">
        <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <BookOpen className="h-5 w-5 text-amber-600 shrink-0 print:text-gray-700" />
          {title}
        </h2>
      </div>
      <div className="px-5 py-4 space-y-4">
        {summary && (
          <p className="text-gray-700 leading-relaxed whitespace-pre-line">
            <Latex>{normalizeLatexForKaTeX(summary)}</Latex>
          </p>
        )}
        {keyPoints.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-gray-800 mb-2">重点与易错点</p>
            <ul className="list-disc list-inside space-y-1.5 text-gray-700 text-sm">
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
