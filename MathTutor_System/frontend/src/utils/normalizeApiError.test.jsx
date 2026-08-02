import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { normalizeApiError } from './normalizeApiError'
import { ErrorState } from '../components/UiV2'

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
    const error = {
      config: { url: '/api/test' },
      headers: { Authorization: 'Bearer secret-token-123', Cookie: 'session=xyz' },
      request: {},
    }
    const result = normalizeApiError(error)
    expect(result).toBe('操作失败')
    expect(result).not.toContain('secret-token-123')
    expect(result).not.toContain('Bearer')
    expect(result).not.toContain('Cookie')
  })

  it('11. object with Authorization does not leak Authorization', () => {
    const error = { detail: { Authorization: 'Bearer abcdef' } }
    const result = normalizeApiError(error)
    expect(result).toBe('操作失败')
    expect(result).not.toContain('abcdef')
  })

  it('12. object with apiKey/token does not leak values', () => {
    const error = { apiKey: 'sk-1234567890', token: 'eyJhbGci...' }
    const result = normalizeApiError(error)
    expect(result).toBe('操作失败')
    expect(result).not.toContain('sk-1234567890')
    expect(result).not.toContain('eyJhbGci')
  })

  it('13. ErrorState does not render [object Object] and does not crash when given arbitrary object', () => {
    const sensitiveObj = {
      headers: { Authorization: 'Bearer secret' },
      config: { apiKey: 'private-key' },
    }

    render(<ErrorState title="发生错误" description={sensitiveObj} />)

    expect(screen.getByText('发生错误')).toBeInTheDocument()
    expect(screen.getByText('加载失败')).toBeInTheDocument()
    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument()
    expect(screen.queryByText('secret')).not.toBeInTheDocument()
    expect(screen.queryByText('private-key')).not.toBeInTheDocument()
  })
})
