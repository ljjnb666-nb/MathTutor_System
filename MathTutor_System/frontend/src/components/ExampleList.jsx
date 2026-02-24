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
    <div className="rounded-xl border border-blue-200/80 bg-blue-50/80 shadow-sm overflow-hidden">
      <div className="border-b border-blue-200/60 px-5 py-3">
        <h3 className="flex items-center gap-2 text-base font-bold text-gray-900">
          <Lightbulb className="h-4 w-4 text-blue-600 shrink-0" />
          典型例题
        </h3>
      </div>
      <ul className="divide-y divide-blue-100">
        {examples.map((ex, i) => {
          const content = ex.content ?? ''
          const analysis = normalizeText(ex.analysis ?? '')
          const expanded = expandedIndex === i
          return (
            <li key={i}>
              <div className="px-5 py-3">
                <p className="text-gray-800 text-sm leading-relaxed">
                  <Latex>{normalizeLatexForKaTeX(content)}</Latex>
                </p>
                <button
                  type="button"
                  onClick={() => setExpandedIndex(expanded ? null : i)}
                  className="mt-2 flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-800"
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
                <div className="border-t border-blue-100 bg-white/70 px-5 py-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">解析</p>
                  <div className="text-gray-700 text-sm leading-relaxed whitespace-pre-line">
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
