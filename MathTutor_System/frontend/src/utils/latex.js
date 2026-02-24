/**
 * 对即将传入 <Latex> 的文本做预处理，仅修改 $...$ 内的内容，避免 KaTeX 报 unknownSymbol。
 * - 去掉公式内换行（防止拆行导致乱码）
 * - Unicode √ → \\sqrt{...}（如 √2 → \\sqrt{2}）
 * - 带圈数字 ①②…⑩ → (1)(2)…(10)
 */
export function normalizeLatexForKaTeX(text) {
  if (!text || typeof text !== 'string') return ''
  return text.replace(/\$([^$]*?)\$/g, (_, inner) => {
    let cleaned = inner.replace(/\r?\n/g, (match, offset, str) => {
      const prev = str[offset - 1]
      const next = str[offset + match.length]
      if (/\d/.test(prev) && /\d/.test(next)) return ''
      return ' '
    })
    cleaned = cleaned
      .replace(/√(\d+)/g, '\\sqrt{$1}')
      .replace(/√([a-zA-Z])/g, '\\sqrt{$1}')
      .replace(/√\s*\{/g, '\\sqrt{')
      .replace(/√/g, '\\sqrt{}')
    const circled = { '①': '(1)', '②': '(2)', '③': '(3)', '④': '(4)', '⑤': '(5)', '⑥': '(6)', '⑦': '(7)', '⑧': '(8)', '⑨': '(9)', '⑩': '(10)' }
    Object.keys(circled).forEach((c) => {
      cleaned = cleaned.split(c).join(circled[c])
    })
    return '$' + cleaned + '$'
  })
}
