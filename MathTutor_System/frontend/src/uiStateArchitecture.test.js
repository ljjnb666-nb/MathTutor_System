import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/**
 * 架构静态扫描：production JSX 不得把 machine status / role 作为可见文本渲染。
 * - 合法内部比较（status === 'completed'）不受影响；
 * - 只拦截 JSX 输出位置的 raw 值（{item.status}、{user.role}）与已知英文 UI 文案。
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

// JSX 输出位置的 raw 成员访问：{item.status} / {action?.status} / {user.role}
const RAW_STATUS_ROLE_PATTERN = /(?<!\$)\{[\w$]+(?:\?\.[\w$]+|\.[\w$]+)*\??\.(?:status|role)\}/g

// 已知不允许再出现的英文 user-facing 文案（教师端）
const FORBIDDEN_UI_STRINGS = [
  'Waiting for confirmation',
  'Save action status',
  'Save completed',
  'Save failed',
  'Confirm question-bank save',
  'Confirm save to question bank',
  'Will create ',
  'Will not: ',
  'Question IDs',
  'Knowledge points:',
  'Total score:',
  'Artifact version:',
  'Cancel action',
  'Drafts are not written',
  'Generate practice draft',
  'Save to question bank',
  'Save edit',
  'Custom Base URL requires',
  'Preset providers use',
  'ADMIN CONSOLE',
]

// machine status 值作为 JSX 可见文本：>pending_confirmation<
const MACHINE_TEXT_PATTERN = />\s*(pending_confirmation|ready_for_confirmation|needs_input|executing|cancelled|mastered|processing|done)\s*</g

describe('UI 状态呈现架构扫描（教师端）', () => {
  it('扫描范围非空', () => {
    expect(productionFiles.length).toBeGreaterThan(50)
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

  it('已知英文 user-facing 文案不得回归', () => {
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
