import { describe, expect, it } from 'vitest'
import { containsSensitiveMaterial, normalizeApiError } from './normalizeApiError'

// Deterministic runtime assembly of credential-shaped fixtures; complete
// credential-like literals are never stored statically in the source tree.
const credentialFixture = (...segments) => segments.join('')

describe('学生端 normalizeApiError secret redaction boundary (RB01)', () => {
  it('Authorization/Bearer credential in Chinese text falls back safely', () => {
    const secret = credentialFixture('secret', '-token-', '123')
    const result = normalizeApiError(`请求失败，Authorization: Bearer ${secret}`)
    expect(result).toBe('操作失败，请稍后重试')
    expect(result).not.toContain(secret)
    expect(result).not.toContain('Bearer')
    expect(result).not.toContain('Authorization')
  })

  it('JWT-shaped token in Chinese text falls back safely', () => {
    const jwt = credentialFixture('eyJ', 'hbGciOiJIUzI1NiJ9.', 'secret')
    const result = normalizeApiError(`服务异常，token=${jwt}`)
    expect(result).toBe('操作失败，请稍后重试')
    expect(result).not.toContain(jwt)
  })

  it('api_key value in Chinese text falls back safely', () => {
    const apiKey = credentialFixture('sk-', '1234567890abcdef')
    const result = normalizeApiError(`模型调用失败，api_key=${apiKey}`)
    expect(result).toBe('操作失败，请稍后重试')
    expect(result).not.toContain(apiKey)
    expect(result).not.toContain('sk-')
  })

  it('credential-bearing database URL falls back without host/db leakage', () => {
    const dbUrl = credentialFixture('postgresql+psycopg://user:pass', 'word@db:', '5432/app')
    const passwordValue = credentialFixture('pass', 'word')
    const result = normalizeApiError(`数据库异常：${dbUrl}`)
    expect(result).toBe('操作失败，请稍后重试')
    expect(result).not.toContain(passwordValue)
    expect(result).not.toContain('db:5432')
    expect(result).not.toContain(dbUrl)
  })

  it('known machine code wins over secret-bearing remainder', () => {
    const secret = credentialFixture('browser', '-secret-token')
    const result = normalizeApiError({
      response: { status: 500, data: { detail: `EXAM_GRADING_ERROR: 提交失败，Authorization: Bearer ${secret}` } },
    })
    expect(result).toBe('提交批改结果失败，请稍后重试')
    expect(result).not.toContain(secret)
    expect(result).not.toContain('Authorization')
    expect(result).not.toContain('EXAM_GRADING_ERROR')
  })

  it('structured unknown code with sensitive message returns generic Chinese', () => {
    const apiKey = credentialFixture('sk-', 'abcdef1234567890')
    const result = normalizeApiError({
      response: { status: 500, data: { detail: { code: 'FUTURE_ERROR', message: `处理失败，api_key=${apiKey}` } } },
    })
    expect(result).toBe('服务暂时不可用，请稍后重试')
    expect(result).not.toContain(apiKey)
  })

  it.each([
    ['请先填写 API Key'],
    ['当前浏览器未保存 API Key'],
    ['Base URL 配置无效'],
  ])('safe technical term survives: %s', (text) => {
    expect(containsSensitiveMaterial(text)).toBe(false)
    expect(normalizeApiError(text)).toBe(text)
  })

  it('containsSensitiveMaterial detects credential shapes', () => {
    const secret = credentialFixture('secret', '-value-', '42')
    expect(containsSensitiveMaterial(`token=${secret}`)).toBe(true)
    expect(containsSensitiveMaterial(`Basic ${secret}`)).toBe(true)
    expect(containsSensitiveMaterial(`redis://user:${secret}@host:6379/0`)).toBe(true)
    expect(containsSensitiveMaterial('登录码或密码错误，请重试')).toBe(false)
  })
})

describe('学生端 normalizeApiError', () => {
  it('中文业务 detail 原样保留', () => {
    expect(normalizeApiError({ response: { status: 401, data: { detail: '登录码或密码错误' } } })).toBe('登录码或密码错误')
    expect(normalizeApiError({ response: { status: 400, data: { detail: '您尚未设置密码，无法修改。请联系老师在学生管理中为您设置密码。' } } }))
      .toBe('您尚未设置密码，无法修改。请联系老师在学生管理中为您设置密码。')
  })

  it('机器错误码前缀被隐藏：known code 返回稳定映射，忽略 remainder', () => {
    expect(normalizeApiError({ response: { status: 500, data: { detail: 'EXAM_GRADING_ERROR: 提交批改结果失败，请稍后重试。' } } }))
      .toBe('提交批改结果失败，请稍后重试')
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
