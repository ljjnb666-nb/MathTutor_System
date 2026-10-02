// Display-only parsing: never rewrite stored text or infer math without delimiters.
function escaped(text, index) {
  let slashes = 0
  while (index > 0 && text[--index] === '\\') slashes++
  return slashes % 2 === 1
}

export function normalizeMathSource(source) {
  const circled = '①②③④⑤⑥⑦⑧⑨⑩'
  let result = ''
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    if (circled.includes(c)) {
      result += `(${circled.indexOf(c) + 1})`
    } else if (c === '√') {
      const start = i + 1
      const open = source[start]
      if (open === '(' || open === '{') {
        const stack = [open]
        let end = start + 1
        for (; end < source.length && stack.length; end++) {
          if (escaped(source, end)) continue
          const next = source[end]
          if (next === '(' || next === '{') stack.push(next)
          if (next === ')' || next === '}') {
            if (stack.at(-1) !== (next === ')' ? '(' : '{')) break
            stack.pop()
          }
        }
        if (stack.length === 0) {
          result += `\\sqrt{${normalizeMathSource(source.slice(start + 1, end - 1))}}`
          i = end - 1
        } else result += c
      } else {
        const atom = source.slice(start).match(/^(?:\d+(?:\.\d+)?|[a-zA-Z])/)
        if (atom) {
          result += `\\sqrt{${atom[0]}}`
          i += atom[0].length
        } else result += c
      }
    } else result += c
  }
  return result
}

export function parseMathText(text) {
  if (typeof text !== 'string' || !text) return []
  const parts = []
  let plain = ''
  let rawPlain = ''
  const flush = () => {
    if (plain) parts.push({ type: 'text', value: plain, raw: rawPlain })
    plain = ''
    rawPlain = ''
  }
  for (let i = 0; i < text.length;) {
    if (text[i] === '\\' && text[i + 1] === '$' && !escaped(text, i)) {
      plain += '$'
      rawPlain += text.slice(i, i + 2)
      i += 2
      continue
    }
    let open, close, type
    if (!escaped(text, i)) {
      if (text.startsWith('$$', i)) [open, close, type] = ['$$', '$$', 'display']
      else if (text[i] === '$') [open, close, type] = ['$', '$', 'inline']
      else if (text.startsWith('\\(', i)) [open, close, type] = ['\\(', '\\)', 'inline']
      else if (text.startsWith('\\[', i)) [open, close, type] = ['\\[', '\\]', 'display']
    }
    if (open) {
      let end = i + open.length
      while (end < text.length) {
        if (!escaped(text, end) && text.startsWith(close, end)) {
          // A display dollar run is never an inline closing delimiter.
          if (close !== '$' || (text[end - 1] !== '$' && text[end + 1] !== '$')) break
        }
        end++
      }
      if (end < text.length) {
        flush()
        const source = text.slice(i + open.length, end)
        parts.push({ type, value: normalizeMathSource(source), raw: text.slice(i, end + close.length) })
        i = end + close.length
        continue
      }
      // Keep the entire unmatched opener; do not reinterpret its second dollar.
      plain += open
      rawPlain += open
      i += open.length
    } else {
      plain += text[i]
      rawPlain += text[i++]
    }
  }
  flush()
  return parts
}
