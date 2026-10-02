import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { containsSensitiveMaterial, normalizeApiError } from './normalizeApiError'
import { ErrorState } from '../components/UiV2'

// Deterministic runtime construction of credential-shaped test fixtures.
// The complete credential-like literals are not stored statically in the
// source tree, while the runtime values keep the exact API-key-shaped /
// JWT-shaped / bearer-token-shaped data that the leak-regression
// assertions below must guard against.
const credentialFixture = (...segments) => segments.join('')

describe('normalizeApiError 基础归一化', () => {
  it('1. 中文字符串原样保留', () => {
    expect(normalizeApiError('网络连接失败')).toBe('网络连接失败')
  })

  it('2. 英文原生 Error 消息不透出，返回中文兜底', () => {
    expect(normalizeApiError(new Error('Permission denied'))).toBe('操作失败，请稍后重试')
  })

  it('3. 中文原生 Error 消息保留', () => {
    expect(normalizeApiError(new Error('用户未登录'))).toBe('用户未登录')
  })

  it('4. FastAPI 英文 detail 字符串不透出', () => {
    const error = { response: { status: 500, data: { detail: 'Internal Server Error' } } }
    expect(normalizeApiError(error)).toBe('服务暂时不可用，请稍后重试')
  })

  it('5. FastAPI 中文业务 detail 保留', () => {
    const error = { response: { status: 409, data: { detail: '用户正在删除中' } } }
    expect(normalizeApiError(error)).toBe('用户正在删除中')
  })

  it('6. FastAPI 422 校验数组统一安全兜底', () => {
    const error = {
      response: {
        status: 422,
        data: {
          detail: [
            { loc: ['body', 'id'], msg: 'field required' },
            { loc: ['body', 'title'], msg: 'must be string' },
          ],
        },
      },
    }
    const result = normalizeApiError(error)
    expect(result).toBe('输入内容不符合要求，请检查后重试')
    expect(result).not.toContain('field required')
    expect(result).not.toContain('body')
  })

  it('7. { msg } 对象（中文）', () => {
    expect(normalizeApiError({ msg: '用户未登录' })).toBe('用户未登录')
  })

  it('8. { message } 对象（中文）', () => {
    expect(normalizeApiError({ message: '服务器繁忙' })).toBe('服务器繁忙')
  })

  it('9. null / undefined 返回默认消息', () => {
    expect(normalizeApiError(null)).toBe('操作失败，请稍后重试')
    expect(normalizeApiError(null, '默认错误')).toBe('默认错误')
    expect(normalizeApiError(undefined)).toBe('操作失败，请稍后重试')
  })

  it('10. 未知对象返回默认消息', () => {
    const error = { foo: 'bar', status: 500 }
    expect(normalizeApiError(error)).toBe('操作失败，请稍后重试')
  })
})

describe('normalizeApiError 机器错误码契约', () => {
  it('已知结构化 code 映射稳定中文文案', () => {
    expect(normalizeApiError({ response: { status: 500, data: { detail: { code: 'EXAM_GRADING_ERROR', message: 'boom' } } } }))
      .toBe('提交批改结果失败，请稍后重试')
    expect(normalizeApiError({ detail: { error_code: 'LLM_AUTH_ERROR', message: 'denied' } }))
      .toBe('AI 服务鉴权失败，请检查模型配置')
  })

  it('未知结构化 code 且英文 message → 中文兜底', () => {
    expect(normalizeApiError({ response: { status: 500, data: { detail: { code: 'TOTALLY_NEW_CODE', message: 'mystery failure' } } } }))
      .toBe('服务暂时不可用，请稍后重试')
  })

  it('机器错误码前缀被隐藏：known code 返回稳定映射，忽略 remainder', () => {
    expect(normalizeApiError({ response: { status: 500, data: { detail: 'EXAM_GRADING_ERROR: 提交批改结果失败，请稍后重试。' } } }))
      .toBe('提交批改结果失败，请稍后重试')
  })

  it('未知机器前缀 + 无中文内容 → 安全兜底', () => {
    expect(normalizeApiError({ response: { status: 500, data: { detail: 'WORKSPACE_UNKNOWN_ERROR: something broke' } } }))
      .toBe('服务暂时不可用，请稍后重试')
  })

  it('LLM/WORKSPACE 系列机器 token 不进入用户文案', () => {
    const result = normalizeApiError({ response: { status: 400, data: { detail: 'LLM_CONFIG_MISSING_KEY: missing' } } })
    expect(result).toBe('未配置 AI 服务密钥，请先在设置中填写 API Key')
    expect(normalizeApiError({ response: { status: 409, data: { detail: 'WORKSPACE_BUSY: locked' } } }))
      .toBe('当前状态已发生变化，请刷新后重试')
  })
})

describe('normalizeApiError 传输层契约', () => {
  it('Network Error → 中文', () => {
    expect(normalizeApiError(new Error('Network Error'))).toBe('网络连接失败，请检查网络后重试')
    expect(normalizeApiError({ code: 'ERR_NETWORK', message: 'Network Error' })).toBe('网络连接失败，请检查网络后重试')
    expect(normalizeApiError(new TypeError('Failed to fetch'))).toBe('网络连接失败，请检查网络后重试')
  })

  it('timeout / ECONNABORTED → 中文', () => {
    expect(normalizeApiError({ code: 'ECONNABORTED', message: 'timeout of 30000ms exceeded' })).toBe('请求超时，请稍后重试')
    expect(normalizeApiError(new Error('Request timed out'))).toBe('请求超时，请稍后重试')
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

  it('axios 英文 status message 也映射', () => {
    expect(normalizeApiError({ message: 'Request failed with status code 500' })).toBe('服务暂时不可用，请稍后重试')
  })
})

describe('normalizeApiError secret redaction boundary (RB01)', () => {
  it('1. Chinese business text containing a Bearer credential falls back safely', () => {
    const secret = credentialFixture('secret', '-token-', '123')
    const result = normalizeApiError(`请求失败，Authorization: Bearer ${secret}`)
    expect(result).toBe('操作失败，请稍后重试')
    expect(result).not.toContain(secret)
    expect(result).not.toContain('Bearer')
    expect(result).not.toContain('Authorization')
  })

  it('2. Chinese business text containing an api_key value falls back safely', () => {
    const apiKey = credentialFixture('sk-', '1234567890abcdef')
    const result = normalizeApiError(`模型失败，api_key=${apiKey}`)
    expect(result).toBe('操作失败，请稍后重试')
    expect(result).not.toContain(apiKey)
    expect(result).not.toContain('sk-')
  })

  it('3. Chinese business text containing a JWT-shaped token falls back safely', () => {
    const jwt = credentialFixture('eyJ', 'hbGciOiJIUzI1NiJ9.', 'secret')
    const result = normalizeApiError(`调用失败，token=${jwt}`)
    expect(result).toBe('操作失败，请稍后重试')
    expect(result).not.toContain(jwt)
  })

  it('4. credential-bearing database URL falls back without host/db leakage', () => {
    const dbUrl = credentialFixture('postgresql+psycopg://user:pass', 'word@db:', '5432/app')
    const passwordValue = credentialFixture('pass', 'word')
    const result = normalizeApiError(`数据库异常：${dbUrl}`)
    expect(result).toBe('操作失败，请稍后重试')
    expect(result).not.toContain(passwordValue)
    expect(result).not.toContain('db:5432')
    expect(result).not.toContain(dbUrl)
  })

  it('5. password field in Chinese text falls back', () => {
    const secret = credentialFixture('hunter', '-2')
    const result = normalizeApiError(`连接失败，password=${secret}`)
    expect(result).toBe('操作失败，请稍后重试')
    expect(result).not.toContain(secret)
  })

  it('6. Google-shaped key in Chinese text falls back', () => {
    const gkey = credentialFixture('AIza', 'SyA1234567890abcdefgh', 'ijk')
    const result = normalizeApiError(`LLM 调用失败，key=${gkey}`)
    expect(result).toBe('操作失败，请稍后重试')
    expect(result).not.toContain(gkey)
  })

  it('known machine code wins over any remainder, including secrets', () => {
    const secret = credentialFixture('secret', '-token')
    const result = normalizeApiError({
      response: { status: 500, data: { detail: `EXAM_GRADING_ERROR: 提交失败，Authorization: Bearer ${secret}` } },
    })
    expect(result).toBe('提交批改结果失败，请稍后重试')
    expect(result).not.toContain(secret)
    expect(result).not.toContain('Authorization')
  })

  it('structured unknown code with sensitive message returns generic safe Chinese', () => {
    const apiKey = credentialFixture('sk-', 'abcdef1234567890')
    const result = normalizeApiError({
      response: { status: 500, data: { detail: { code: 'FUTURE_ERROR', message: `处理失败，api_key=${apiKey}` } } },
    })
    expect(result).toBe('服务暂时不可用，请稍后重试')
    expect(result).not.toContain(apiKey)
    expect(result).not.toContain('FUTURE_ERROR')
  })

  it('native Error with embedded credential does not leak', () => {
    const secret = credentialFixture('secret', '-token')
    const result = normalizeApiError(new Error(`操作失败，Bearer ${secret}`))
    expect(result).toBe('操作失败，请稍后重试')
    expect(result).not.toContain(secret)
    expect(result).not.toContain('Bearer')
  })

  it.each([
    ['请先填写 API Key'],
    ['当前浏览器未保存 API Key'],
    ['Base URL 配置无效'],
    ['Provider 尚未配置'],
  ])('safe technical term survives: %s', (text) => {
    expect(containsSensitiveMaterial(text)).toBe(false)
    expect(normalizeApiError(text)).toBe(text)
  })

  it('underscore credential variants (access_token / client_secret) fall back safely', () => {
    const opaque = credentialFixture('opaque', '-value-', '77')
    const privateSecret = credentialFixture('private', '-value-', '88')
    expect(containsSensitiveMaterial(`access_token=${opaque}`)).toBe(true)
    expect(containsSensitiveMaterial(`"access_token": "${opaque}"`)).toBe(true)
    expect(containsSensitiveMaterial(`client_secret=${privateSecret}`)).toBe(true)
    expect(containsSensitiveMaterial(`"client_secret": "${privateSecret}"`)).toBe(true)

    const accessTokenResult = normalizeApiError(`请求失败，access_token=${opaque}`)
    expect(accessTokenResult).toBe('操作失败，请稍后重试')
    expect(accessTokenResult).not.toContain('access_token')
    expect(accessTokenResult).not.toContain(opaque)

    const clientSecretResult = normalizeApiError(`服务失败，client_secret=${privateSecret}`)
    expect(clientSecretResult).toBe('操作失败，请稍后重试')
    expect(clientSecretResult).not.toContain('client_secret')
    expect(clientSecretResult).not.toContain(privateSecret)
  })

  it('containsSensitiveMaterial detects credential shapes across formats', () => {
    const secret = credentialFixture('secret', '-value-', '42')
    expect(containsSensitiveMaterial(`api_key: ${secret}`)).toBe(true)
    expect(containsSensitiveMaterial(`"api_key": "${secret}"`)).toBe(true)
    expect(containsSensitiveMaterial(`token=${secret}`)).toBe(true)
    expect(containsSensitiveMaterial(`Basic ${secret}`)).toBe(true)
    expect(containsSensitiveMaterial(`redis://user:${secret}@host:6379/0`)).toBe(true)
    expect(containsSensitiveMaterial('请先填写 API Key')).toBe(false)
    expect(containsSensitiveMaterial('登录码或密码错误，请重试')).toBe(false)
  })
})

describe('normalizeApiError secret 安全（既有回归）', () => {
  it('object with headers does not leak headers', () => {
    const bearerTokenValue = credentialFixture('sec', 'ret-token-', '123')
    const cookieValue = credentialFixture('sess', 'ion=xy', 'z')
    const error = {
      config: { url: '/api/test' },
      headers: { Authorization: `Bearer ${bearerTokenValue}`, Cookie: cookieValue },
      request: {},
    }
    const result = normalizeApiError(error)
    expect(result).toBe('操作失败，请稍后重试')
    expect(result).not.toContain(bearerTokenValue)
    expect(result).not.toContain('Bearer')
    expect(result).not.toContain('Cookie')
  })

  it('object with Authorization does not leak Authorization', () => {
    const bearerValue = credentialFixture('ab', 'cd', 'ef')
    const error = { detail: { Authorization: `Bearer ${bearerValue}` } }
    const result = normalizeApiError(error)
    expect(result).toBe('操作失败，请稍后重试')
    expect(result).not.toContain(bearerValue)
  })

  it('object with apiKey/token does not leak values', () => {
    const apiKeyValue = credentialFixture('sk-', '1234', '5678', '90')
    const tokenValue = credentialFixture('eyJ', 'hbGci', '...')
    const error = { apiKey: apiKeyValue, token: tokenValue }
    const result = normalizeApiError(error)
    expect(result).toBe('操作失败，请稍后重试')
    expect(result).not.toContain(apiKeyValue)
    expect(result).not.toContain(tokenValue)
  })

  it('ErrorState does not render [object Object] and does not crash when given arbitrary object', () => {
    const bearerValue = credentialFixture('sec', 'ret')
    const apiKeyValue = credentialFixture('pri', 'vate-', 'key')
    const sensitiveObj = {
      headers: { Authorization: `Bearer ${bearerValue}` },
      config: { apiKey: apiKeyValue },
    }

    render(<ErrorState title="发生错误" description={sensitiveObj} />)

    expect(screen.getByText('发生错误')).toBeInTheDocument()
    expect(screen.getByText('加载失败')).toBeInTheDocument()
    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument()
    expect(screen.queryByText('secret')).not.toBeInTheDocument()
    expect(screen.queryByText(apiKeyValue)).not.toBeInTheDocument()
  })
})
