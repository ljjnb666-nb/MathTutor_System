import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

function splitLatex(str) {
  if (!str || typeof str !== 'string') return []
  const parts = []
  const re = /\$\$([\s\S]*?)\$\$|\$([^$]*?)\$/g
  let last = 0
  let m
  while ((m = re.exec(str)) !== null) {
    if (m.index > last) parts.push({ type: 'text', value: str.slice(last, m.index) })
    if (m[1] !== undefined) parts.push({ type: 'display', value: m[1].trim() })
    else if (m[2] !== undefined) parts.push({ type: 'inline', value: m[2].trim() })
    last = re.lastIndex
  }
  if (last < str.length) parts.push({ type: 'text', value: str.slice(last) })
  return parts
}

export default function Latex({ children }) {
  const text = typeof children === 'string' ? children : (children ?? '')
  const parts = useMemo(() => splitLatex(text), [text])
  const rendered = useMemo(() => {
    return parts.map((p, i) => {
      if (p.type === 'text') return <span key={i}>{p.value}</span>
      try {
        const html = katex.renderToString(p.value, {
          throwOnError: false,
          displayMode: p.type === 'display',
        })
        return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />
      } catch {
        return <span key={i}>{p.value}</span>
      }
    })
  }, [parts])
  return <span>{rendered}</span>
}
