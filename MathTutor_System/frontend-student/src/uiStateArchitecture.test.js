import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/**
 * 学生端架构静态扫描：production JSX 不得把 machine status / role 作为可见文本渲染。
 */
const here = path.dirname(fileURLToPath(import.meta.url))
const srcRoot = path.resolve(here, '.')

function listSourceFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (name === 'test' || name === '__tests__') continue
      out.push(...listSourceFiles(full))
    } else if (/\.(jsx|js)$/.test(name) && !name.includes('.test.') && name !== 'setup.js') {
      out.push(full)
    }
  }
  return out
}

const productionFiles = listSourceFiles(srcRoot)
  .filter((file) => !file.includes(`${path.sep}utils${path.sep}uiPresentation`))
  .filter((file) => !file.endsWith('uiStateArchitecture.test.js'))

const RAW_STATUS_ROLE_PATTERN = /(?<!\$)\{[\w$]+(?:\?\.[\w$]+|\.[\w$]+)*\??\.(?:status|role)\}/g

const FORBIDDEN_UI_STRINGS = [
  'Network Error',
  'Failed to fetch',
  'Request failed with status code',
]

const MACHINE_TEXT_PATTERN = />\s*(pending_confirmation|ready_for_confirmation|needs_input|executing|cancelled|mastered|processing|done)\s*</g

describe('UI 状态呈现架构扫描（学生端）', () => {
  it('扫描范围非空', () => {
    expect(productionFiles.length).toBeGreaterThan(5)
  })

  it('JSX 不得直接渲染 {x.status} / {x.role} raw 值', () => {
    const offenders = []
    for (const file of productionFiles) {
      if (!file.endsWith('.jsx')) continue
      const src = readFileSync(file, 'utf8')
      for (const match of src.match(RAW_STATUS_ROLE_PATTERN) || []) {
        offenders.push(`${path.relative(srcRoot, file)}: ${match}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('传输层英文错误文案不得出现在 JSX 中', () => {
    const offenders = []
    for (const file of productionFiles) {
      if (!file.endsWith('.jsx')) continue
      const src = readFileSync(file, 'utf8')
      for (const text of FORBIDDEN_UI_STRINGS) {
        if (src.includes(text)) offenders.push(`${path.relative(srcRoot, file)}: "${text}"`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('machine status 词不得作为 JSX 可见文本', () => {
    const offenders = []
    for (const file of productionFiles) {
      if (!file.endsWith('.jsx')) continue
      const src = readFileSync(file, 'utf8')
      for (const match of src.match(MACHINE_TEXT_PATTERN) || []) {
        offenders.push(`${path.relative(srcRoot, file)}: ${match}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
