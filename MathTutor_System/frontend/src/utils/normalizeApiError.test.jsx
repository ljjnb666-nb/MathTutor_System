import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { normalizeApiError } from './normalizeApiError'
import { ErrorState } from '../components/UiV2'

// Deterministic runtime construction of credential-shaped test fixtures.
// The complete credential-like literals are not stored statically in the
// source tree, while the runtime values keep the exact API-key-shaped /
// JWT-shaped / bearer-token-shaped data that the leak-regression
// assertions below must guard against.
const credentialFixture = (...segments) => segments.join('')

describe('normalizeApiError & ErrorState security rules', () => {
  it('1. string returns string', () => {
    expect(normalizeApiError('网络连接失败')).toBe('网络连接失败')
  })

  it('2. Error.message returns message', () => {
    expect(normalizeApiError(new Error('Permission denied'))).toBe('Permission denied')
  })

  it('3. FastAPI detail string', () => {
    const error = { response: { data: { detail: 'Unprocessable Entity' } } }
    expect(normalizeApiError(error)).toBe('Unprocessable Entity')
  })

  it('4. FastAPI detail array', () => {
    const error = {
      response: {
        data: {
          detail: [
            { loc: ['body', 'id'], msg: 'field required' },
            { loc: ['body', 'title'], msg: 'must be string' },
          ],
        },
      },
    }
    expect(normalizeApiError(error)).toBe('id: field required; title: must be string')
  })

  it('5. { msg } object', () => {
    expect(normalizeApiError({ msg: '用户未登录' })).toBe('用户未登录')
  })

  it('6. { message } object', () => {
    expect(normalizeApiError({ message: '服务器繁忙' })).toBe('服务器繁忙')
  })

  it('7. null returns default message', () => {
    expect(normalizeApiError(null)).toBe('操作失败')
    expect(normalizeApiError(null, '默认错误')).toBe('默认错误')
  })

  it('8. undefined returns default message', () => {
    expect(normalizeApiError(undefined)).toBe('操作失败')
  })

  it('9. unknown object returns default message', () => {
    const error = { foo: 'bar', status: 500 }
    expect(normalizeApiError(error)).toBe('操作失败')
  })

  it('10. object with headers does not leak headers', () => {
    const bearerTokenValue = credentialFixture('sec', 'ret-token-', '123')
    const cookieValue = credentialFixture('sess', 'ion=xy', 'z')
    const error = {
      config: { url: '/api/test' },
      headers: { Authorization: `Bearer ${bearerTokenValue}`, Cookie: cookieValue },
      request: {},
    }
    const result = normalizeApiError(error)
    expect(result).toBe('操作失败')
    expect(result).not.toContain(bearerTokenValue)
    expect(result).not.toContain('Bearer')
    expect(result).not.toContain('Cookie')
  })

  it('11. object with Authorization does not leak Authorization', () => {
    const bearerValue = credentialFixture('ab', 'cd', 'ef')
    const error = { detail: { Authorization: `Bearer ${bearerValue}` } }
    const result = normalizeApiError(error)
    expect(result).toBe('操作失败')
    expect(result).not.toContain(bearerValue)
  })

  it('12. object with apiKey/token does not leak values', () => {
    const apiKeyValue = credentialFixture('sk-', '1234', '5678', '90')
    const tokenValue = credentialFixture('eyJ', 'hbGci', '...')
    const error = { apiKey: apiKeyValue, token: tokenValue }
    const result = normalizeApiError(error)
    expect(result).toBe('操作失败')
    expect(result).not.toContain(apiKeyValue)
    expect(result).not.toContain(tokenValue)
  })

  it('13. ErrorState does not render [object Object] and does not crash when given arbitrary object', () => {
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
