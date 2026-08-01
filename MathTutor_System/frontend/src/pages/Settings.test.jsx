import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import Settings from './Settings'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { username: 'admin', role: 'admin' },
  }),
}))

vi.mock('../services/toolsApi', () => ({
  testLlmApiKey: vi.fn(),
}))

function installMatchMedia(matches) {
  window.matchMedia = vi.fn(() => ({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('ui_theme', 'auto')
  document.documentElement.dataset.theme = 'dark'
  installMatchMedia(false)
})

afterEach(() => {
  cleanup()
})

describe('Settings theme initialization', () => {
  it('does not write auto to data-theme when opening the page', async () => {
    render(<Settings />)

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('light')
    })
    expect(document.documentElement.dataset.theme).not.toBe('auto')
    expect(localStorage.getItem('ui_theme')).toBe('auto')
  })
})
