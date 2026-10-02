import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  UNKNOWN_STATUS_PRESENTATION,
  getExamStatePresentation,
  getRolePresentation,
  getStatusPresentation,
} from './uiPresentation'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = JSON.parse(
  readFileSync(path.resolve(here, '../../../test-fixtures/ui-state-cases.json'), 'utf8'),
)

describe('学生端 getStatusPresentation（共享 fixture 契约）', () => {
  for (const [domain, cases] of Object.entries(fixture.student)) {
    if (domain === 'role') continue
    it(`domain ${domain} 的每个登记值都有中文呈现`, () => {
      for (const item of cases) {
        const presentation = getStatusPresentation(domain, item.machineValue)
        expect(presentation.label).toBe(item.expectedLabel)
        expect(presentation.tone).toBe(item.expectedTone)
        expect(presentation.label).not.toBe(item.machineValue)
        expect(/[\u4e00-\u9fff]/.test(presentation.label)).toBe(true)
      }
    })
  }
})

describe('学生端 role / 派生态', () => {
  it.each(fixture.student.role)('role $machineValue → $expectedLabel', ({ machineValue, expectedLabel }) => {
    expect(getRolePresentation(machineValue)).toBe(expectedLabel)
  })

  it('未知 role 不透出原始值', () => {
    expect(getRolePresentation('principal')).toBe('未知角色')
  })

  it('examState 由 graded_at 派生', () => {
    expect(getExamStatePresentation(null)).toEqual({ label: '去做题', tone: 'warning' })
    expect(getExamStatePresentation('2026-10-02T08:00:00')).toEqual({ label: '已完成', tone: 'success' })
  })
})

describe('学生端未登记状态不得透出原始值', () => {
  it('未知 mistake 状态返回安全兜底', () => {
    expect(getStatusPresentation('mistake', fixture.unknown.machineValue)).toEqual({
      label: fixture.unknown.studentExpectedLabel,
      tone: fixture.unknown.expectedTone,
    })
  })

  it('未知域返回统一未知状态', () => {
    expect(getStatusPresentation('nonexistentDomain', 'pending')).toEqual(UNKNOWN_STATUS_PRESENTATION)
  })
})
