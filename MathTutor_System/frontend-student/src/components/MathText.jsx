import { useMemo } from 'react'
import katex from 'katex'
import { parseMathText } from '../utils/mathText'

export default function MathText({ children, text = children, className = '' }) {
  const nodes = useMemo(() => parseMathText(text).map((part, index) => {
    if (part.type === 'text') return <span key={index}>{part.value}</span>
    try {
      const html = katex.renderToString(part.value, {
        displayMode: part.type === 'display',
        throwOnError: true,
        trust: false,
        strict: 'ignore', // Unsupported Unicode must not log business text.
        output: 'htmlAndMathml',
      })
      return <span key={index} className={`math-text-${part.type}`} dangerouslySetInnerHTML={{ __html: html }} />
    } catch {
      return <span key={index} className={`math-text-${part.type}`}>{part.raw}</span>
    }
  }), [text])
  return <span className={`math-text ${className}`}>{nodes}</span>
}
