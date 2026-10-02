import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import MathText from './MathText'
import { parseMathText } from '../utils/mathText'
import fixture from '../../../test-fixtures/math-rendering-cases.json'

afterEach(cleanup)

describe('shared MathText contract', () => {
  for (const test of fixture.cases) it(test.name, () => {
    const parts = parseMathText(test.input)
    expect(parts.map(p => p.type)).toEqual(test.types)
    if (test.math !== undefined) expect(parts.find(p => p.type !== 'text').value).toBe(test.math)
    const { container } = render(<MathText text={test.input} />)
    if (test.text !== undefined) expect(container.textContent).toBe(test.text)
    if (test.fallback) {
      expect(container.textContent).toBe(test.input)
      expect(container.querySelector('.katex')).toBeNull()
    } else if (test.types.includes('inline') || test.types.includes('display')) {
      expect(container.querySelectorAll('.katex')).toHaveLength(parts.filter(p => p.type !== 'text').length)
      expect(container.querySelector('math')).not.toBeNull()
      if (test.types.includes('display')) expect(container.querySelector('.math-text-display .katex-display')).not.toBeNull()
    }
    expect(container.querySelector('script, a[href], [onclick]')).toBeNull()
  })

  it('empty inputs and a failed segment do not hide adjacent formulas', () => {
    expect(parseMathText(null)).toEqual([])
    expect(parseMathText(undefined)).toEqual([])
    const { container } = render(<MathText>{'$x$ then $\\frac{1$ then $y$'}</MathText>)
    expect(container.querySelectorAll('.katex')).toHaveLength(2)
    expect(container.textContent).toContain('$\\frac{1$')
  })

  it('keeps both parser and rendering authorities identical', () => {
    for (const path of ['utils/mathText.js', 'components/MathText.jsx']) {
      expect(readFileSync(`src/${path}`, 'utf8').replace(/\r\n/g, '\n')).toBe(readFileSync(`../frontend/src/${path}`, 'utf8').replace(/\r\n/g, '\n'))
    }
  })
})
