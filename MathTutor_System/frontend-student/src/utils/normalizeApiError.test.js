import { describe, expect, it } from 'vitest'
import { normalizeApiError } from './normalizeApiError'

describe('学生端 normalizeApiError', () => {
  it('中文业务 detail 原样保留', () => {
    expect(normalizeApiError({ response: { status: 401, data: { detail: '登录码或密码错误' } } })).toBe('登录码或密码错误')
    expect(normalizeApiError({ response: { status: 400, data: { detail: '您尚未设置密码，无法修改。请联系老师在学生管理中为您设置密码。' } } }))
      .toBe('您尚未设置密码，无法修改。请联系老师在学生管理中为您设置密码。')
  })

  it('机器错误码前缀被隐藏，中文部分保留', () => {
    expect(normalizeApiError({ response: { status: 500, data: { detail: 'EXAM_GRADING_ERROR: 提交批改结果失败，请稍后重试。' } } }))
      .toBe('提交批改结果失败，请稍后重试。')
  })

  it('已知结构化 code 映射中文', () => {
    expect(normalizeApiError({ response: { status: 500, data: { detail: { code: 'REPORT_GENERATION_ERROR', message: 'boom' } } } }))
      .toBe('生成报告失败，请稍后重试')
  })

  it('未知 code / 英文 detail → 安全中文兜底，不透出原始值', () => {
    expect(normalizeApiError({ response: { status: 500, data: { detail: 'REPORT_PROVIDER_ERROR: upstream down' } } }))
      .toBe('学情报告服务暂时不可用，请稍后重试')
    expect(normalizeApiError({ response: { status: 500, data: { detail: 'Internal Server Error' } } }))
      .toBe('服务暂时不可用，请稍后重试')
    expect(normalizeApiError(new Error('Cannot read properties of undefined'))).toBe('操作失败，请稍后重试')
  })

  it('Network Error / Failed to fetch → 中文', () => {
    expect(normalizeApiError(new Error('Network Error'))).toBe('网络连接失败，请检查网络后重试')
    expect(normalizeApiError(new TypeError('Failed to fetch'))).toBe('网络连接失败，请检查网络后重试')
  })

  it('timeout / ECONNABORTED → 中文', () => {
    expect(normalizeApiError({ code: 'ECONNABORTED', message: 'timeout of 15000ms exceeded' })).toBe('请求超时，请稍后重试')
  })

  it.each([
    [401, '登录状态已失效，请重新登录'],
    [403, '当前账号无权执行此操作'],
    [404, '请求的内容不存在或已被删除'],
    [409, '当前状态已发生变化，请刷新后重试'],
    [422, '输入内容不符合要求，请检查后重试'],
    [429, '请求过于频繁，请稍后再试'],
    [500, '服务暂时不可用，请稍后重试'],
    [503, '服务暂时不可用，请稍后重试'],
  ])('HTTP %i → 中文兜底', (status, expected) => {
    expect(normalizeApiError({ response: { status, data: {} } })).toBe(expected)
  })

  it('FastAPI 422 校验数组安全兜底', () => {
    const result = normalizeApiError({
      response: { status: 422, data: { detail: [{ loc: ['body', 'login_code'], msg: 'field required' }] } },
    })
    expect(result).toBe('输入内容不符合要求，请检查后重试')
    expect(result).not.toContain('login_code')
  })

  it('null / undefined 返回默认消息', () => {
    expect(normalizeApiError(null)).toBe('操作失败，请稍后重试')
    expect(normalizeApiError(undefined, '登录失败，请检查登录码和密码')).toBe('登录失败，请检查登录码和密码')
  })

  it('敏感字段不进入用户文案', () => {
    const token = ['eyJ', 'hbGci', 'xxx'].join('')
    const result = normalizeApiError({ headers: { Authorization: `Bearer ${token}` }, config: { apiKey: 'sk-secret' } })
    expect(result).toBe('操作失败，请稍后重试')
    expect(result).not.toContain(token)
    expect(result).not.toContain('sk-secret')
  })
})
