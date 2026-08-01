import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, resolveTheme, subscribeToSystemThemeChanges } from './theme'

function installMatchMedia(initialMatches) {
  const listeners = new Set()
  const mediaQuery = {
    matches: initialMatches,
    addEventListener: vi.fn((event, listener) => {
      if (event === 'change') listeners.add(listener)
    }),
    removeEventListener: vi.fn((event, listener) => {
      if (event === 'change') listeners.delete(listener)
    }),
  }

  window.matchMedia = vi.fn(() => mediaQuery)

  return {
    setMatches(matches) {
      mediaQuery.matches = matches
      for (const listener of listeners) {
        listener({ matches })
      }
    },
  }
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('theme utilities', () => {
  it('resolves auto to light when the system prefers light', () => {
    installMatchMedia(false)

    expect(resolveTheme('auto')).toBe('light')
    expect(applyTheme('auto')).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('resolves auto to dark when the system prefers dark', () => {
    installMatchMedia(true)

    expect(resolveTheme('auto')).toBe('dark')
    expect(applyTheme('auto')).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('updates the DOM when the system theme changes in auto mode', () => {
    const systemTheme = installMatchMedia(false)
    localStorage.setItem('ui_theme', 'auto')
    applyTheme('auto')

    const unsubscribe = subscribeToSystemThemeChanges()
    systemTheme.setMatches(true)
    expect(document.documentElement.dataset.theme).toBe('dark')

    systemTheme.setMatches(false)
    expect(document.documentElement.dataset.theme).toBe('light')
    unsubscribe()
  })

  it('does not let system changes override manual light or dark preferences', () => {
    const systemTheme = installMatchMedia(false)
    const unsubscribe = subscribeToSystemThemeChanges()

    localStorage.setItem('ui_theme', 'light')
    applyTheme('light')
    systemTheme.setMatches(true)
    expect(document.documentElement.dataset.theme).toBe('light')

    localStorage.setItem('ui_theme', 'dark')
    applyTheme('dark')
    systemTheme.setMatches(false)
    expect(document.documentElement.dataset.theme).toBe('dark')

    unsubscribe()
  })
})
