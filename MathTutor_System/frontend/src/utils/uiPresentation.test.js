import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  DRAFT_VALIDATION_FALLBACK,
  UNKNOWN_STATUS_PRESENTATION,
  getAgentActionErrorPresentation,
  getAgentRunErrorPresentation,
  getConfigSourcePresentation,
  getDraftValidationMessage,
  getPlanPresentation,
  getRagDocumentStatePresentation,
  getRolePresentation,
  getSaveTargetPresentation,
  getStatusPresentation,
  getWillNotPresentation,
} from './uiPresentation'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = JSON.parse(
  readFileSync(path.resolve(here, '../../../test-fixtures/ui-state-cases.json'), 'utf8'),
)

describe('getStatusPresentation（共享 fixture 契约）', () => {
  for (const [domain, cases] of Object.entries(fixture.teacher)) {
    if (domain === 'role' || domain === 'plan') continue
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

describe('未登记状态不得透出原始值', () => {
  it('未知 agentRun 状态返回安全兜底', () => {
    expect(getStatusPresentation('agentRun', fixture.unknown.machineValue)).toEqual({
      label: fixture.unknown.teacherExpectedLabel,
      tone: fixture.unknown.expectedTone,
    })
  })

  it('每个域的未知值都不返回原始 machine value', () => {
    for (const value of ['SOMETHING_NEW', 'future_new_status', '', null, undefined]) {
      for (const domain of ['agentRun', 'agentArtifact', 'agentAction', 'ragUpload', 'mistake', 'order']) {
        const presentation = getStatusPresentation(domain, value)
        if (value) expect(presentation.label).not.toBe(value)
        expect(/[\u4e00-\u9fff]/.test(presentation.label)).toBe(true)
      }
    }
  })

  it('未知域返回统一未知状态', () => {
    expect(getStatusPresentation('nonexistentDomain', 'completed')).toEqual(UNKNOWN_STATUS_PRESENTATION)
  })
})

describe('role / plan 呈现', () => {
  it.each(fixture.teacher.role)('role $machineValue → $expectedLabel', ({ machineValue, expectedLabel }) => {
    expect(getRolePresentation(machineValue)).toBe(expectedLabel)
  })

  it.each(fixture.teacher.plan)('plan $machineValue → $expectedLabel', ({ machineValue, expectedLabel }) => {
    expect(getPlanPresentation(machineValue)).toBe(expectedLabel)
  })

  it('未知 role / plan 不透出原始值', () => {
    expect(getRolePresentation('superadmin')).toBe('未知角色')
    expect(getRolePresentation(undefined)).toBe('未知角色')
    expect(getPlanPresentation('ultimate')).toBe('未知版本')
  })
})

describe('agent 错误呈现', () => {
  it('已知 run error_code 映射中文', () => {
    expect(getAgentRunErrorPresentation({ error_code: 'intent_extraction_failed', error_message: 'Intent extraction failed. Please retry.' }))
      .toBe('无法理解教学目标，请换个说法后重试')
    expect(getAgentRunErrorPresentation({ error_code: 'unsafe_plan', error_message: 'Plan failed read-only safety validation.' }))
      .toBe('计划未通过安全校验，已停止执行')
  })

  it('中文业务消息保留，英文消息兜底', () => {
    expect(getAgentRunErrorPresentation({ error_message: '后端返回的中文原因' })).toBe('后端返回的中文原因')
    expect(getAgentRunErrorPresentation({ error_message: 'Some english failure' })).toBe('运行失败，请稍后重试')
    expect(getAgentRunErrorPresentation(null)).toBe('运行失败，请稍后重试')
  })

  it('action 错误呈现', () => {
    expect(getAgentActionErrorPresentation({ error_code: 'save_failed', error_message: 'Save failed' })).toBe('保存到题库失败，请稍后重试')
    expect(getAgentActionErrorPresentation({ error_message: '数据库写入失败' })).toBe('数据库写入失败')
    expect(getAgentActionErrorPresentation({})).toBe('操作失败，请稍后重试')
  })
})

describe('确认弹窗 summary 呈现', () => {
  it('will_not 已知英文短语映射中文', () => {
    expect(getWillNotPresentation('publish homework')).toBe('不会发布作业')
    expect(getWillNotPresentation('create PPTX')).toBe('不会生成 PPTX 课件')
  })

  it('will_not 未知值返回 null（不展示）', () => {
    expect(getWillNotPresentation('deploy to production')).toBeNull()
  })

  it('保存目标优先使用中文 target_label，machine 短语映射中文', () => {
    expect(getSaveTargetPresentation({ target_label: '保存到：当前教师私有题库' })).toBe('保存到：当前教师私有题库')
    expect(getSaveTargetPresentation({ target_question_bank: 'current teacher private question bank' })).toBe('当前教师私有题库')
    expect(getSaveTargetPresentation({})).toBe('教师私有题库')
  })
})

describe('草稿校验错误呈现', () => {
  it('已知 code 映射中文', () => {
    expect(getDraftValidationMessage({ code: 'empty_stem', message: 'Question stem cannot be empty.' })).toBe('存在题干为空的题目，请补充题干')
    expect(getDraftValidationMessage({ code: 'invalid_choice_answer', message: 'Choice answer must match an option.' })).toBe('选择题答案必须匹配某个选项')
  })

  it('未知 code 不透出内部 message，使用安全兜底', () => {
    expect(getDraftValidationMessage({ code: 'brand_new_rule', message: 'Internal english detail' })).toBe(DRAFT_VALIDATION_FALLBACK)
    expect(getDraftValidationMessage(null)).toBe(DRAFT_VALIDATION_FALLBACK)
  })

  it('后端中文 message 保留', () => {
    expect(getDraftValidationMessage({ code: 'brand_new_rule', message: '题目内容有安全问题' })).toBe('题目内容有安全问题')
  })
})

describe('知识库文档状态（派生态）', () => {
  it('无 document_id → 待迁移', () => {
    expect(getRagDocumentStatePresentation({})).toEqual({ label: '待迁移', tone: 'warning' })
  })
  it('无 chunk → 待向量化', () => {
    expect(getRagDocumentStatePresentation({ document_id: 'doc_1' })).toEqual({ label: '待向量化', tone: 'warning' })
  })
  it('已向量化 → 已完成', () => {
    expect(getRagDocumentStatePresentation({ document_id: 'doc_1', chunk_count: 3 })).toEqual({ label: '已完成', tone: 'success' })
  })
})

describe('配置来源呈现', () => {
  it('server → 服务器配置', () => {
    expect(getConfigSourcePresentation('server')).toBe('服务器配置')
  })
  it('未知来源不透出原始值', () => {
    expect(getConfigSourcePresentation('weird_source')).toBe('未知来源')
  })
})
