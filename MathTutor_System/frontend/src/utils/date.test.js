import { describe, it, expect } from 'vitest'
import { getTimeOfDayGreeting, formatCurrentDate, formatDateTime } from './date'

describe('Scoped Date and Greeting Utilities', () => {
  it('returns appropriate greeting based on hour', () => {
    expect(getTimeOfDayGreeting(new Date('2026-10-05T04:00:00'))).toBe('凌晨好')
    expect(getTimeOfDayGreeting(new Date('2026-10-05T09:00:00'))).toBe('上午好')
    expect(getTimeOfDayGreeting(new Date('2026-10-05T13:00:00'))).toBe('中午好')
    expect(getTimeOfDayGreeting(new Date('2026-10-05T16:00:00'))).toBe('下午好')
    expect(getTimeOfDayGreeting(new Date('2026-10-05T20:00:00'))).toBe('晚上好')
  })

  it('formats dates consistently', () => {
    const formatted = formatCurrentDate(new Date('2026-10-05T10:00:00'))
    expect(formatted).toContain('2026')
    expect(formatted).toContain('10')

    expect(formatDateTime(null)).toBe('—')
    expect(formatDateTime('invalid-date')).toBe('—')
    const dt = formatDateTime('2026-10-05T14:30:00Z')
    expect(dt).not.toBe('—')
  })
})
