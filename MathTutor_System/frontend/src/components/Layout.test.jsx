import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, Link } from 'react-router-dom'
import Layout from './Layout'
import { FOCUSABLE_SELECTOR } from './ui/useOverlayFocusManagement'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: '教师张', role: 'teacher' },
    logout: vi.fn(),
  }),
}))

vi.mock('../contexts/StudentContext', () => ({
  useStudent: () => ({
    currentStudent: null,
    students: [],
    selectStudent: vi.fn(),
    refreshStudents: vi.fn(),
  }),
}))

vi.mock('../contexts/SubscriptionContext', () => ({
  useSubscription: () => ({ atStudentLimit: false }),
}))

function TestApp({ initialEntries = ['/'] }) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<div data-testid="page-home">首页工作台</div>} />
          <Route path="questions" element={<div data-testid="page-questions">题库中心</div>} />
          <Route path="smart-gen" element={<div data-testid="page-smart-gen">智能出题</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('Layout Mobile Navigation Accessibility Matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('MOBILE-NAV-A11Y-01: closed drawer leaves no hidden tabbable navigation', () => {
    render(<TestApp />)

    const hamburger = screen.getByRole('button', { name: '打开导航菜单' })
    expect(hamburger).toHaveAttribute('aria-expanded', 'false')
    expect(hamburger).toHaveAttribute('aria-controls', 'mobile-navigation')

    // When closed, Drawer primitive renders null, leaving zero hidden tabbable elements in DOM
    const mobileNav = document.getElementById('mobile-navigation')
    expect(mobileNav).toBeNull()

    // No dialog overlay exists
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('MOBILE-NAV-A11Y-02: hamburger opens drawer and focus moves inside', () => {
    render(<TestApp />)

    const hamburger = screen.getByRole('button', { name: '打开导航菜单' })
    hamburger.focus()
    expect(document.activeElement).toBe(hamburger)

    fireEvent.click(hamburger)
    expect(hamburger).toHaveAttribute('aria-expanded', 'true')

    const mobileNav = document.getElementById('mobile-navigation')
    expect(mobileNav).toBeInTheDocument()
    expect(mobileNav).toHaveAttribute('role', 'dialog')
    expect(mobileNav).toHaveAttribute('aria-modal', 'true')

    // Focus has entered the mobile navigation drawer
    expect(mobileNav.contains(document.activeElement)).toBe(true)
  })

  it('MOBILE-NAV-A11Y-03: Tab traps last → first', () => {
    render(<TestApp />)

    const hamburger = screen.getByRole('button', { name: '打开导航菜单' })
    fireEvent.click(hamburger)

    const mobileNav = document.getElementById('mobile-navigation')
    const focusables = Array.from(mobileNav.querySelectorAll(FOCUSABLE_SELECTOR))
    expect(focusables.length).toBeGreaterThan(1)

    const first = focusables[0]
    const last = focusables[focusables.length - 1]

    // Focus the last tabbable element
    last.focus()
    expect(document.activeElement).toBe(last)

    // Press Tab
    fireEvent.keyDown(window, { key: 'Tab' })

    // Tab must wrap back to first element inside drawer
    expect(document.activeElement).toBe(first)
  })

  it('MOBILE-NAV-A11Y-04: Shift+Tab traps first → last', () => {
    render(<TestApp />)

    const hamburger = screen.getByRole('button', { name: '打开导航菜单' })
    fireEvent.click(hamburger)

    const mobileNav = document.getElementById('mobile-navigation')
    const focusables = Array.from(mobileNav.querySelectorAll(FOCUSABLE_SELECTOR))
    const first = focusables[0]
    const last = focusables[focusables.length - 1]

    // Focus first element
    first.focus()
    expect(document.activeElement).toBe(first)

    // Press Shift+Tab
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })

    // Must wrap to last element
    expect(document.activeElement).toBe(last)
  })

  it('MOBILE-NAV-A11Y-05: Escape closes', () => {
    render(<TestApp />)

    const hamburger = screen.getByRole('button', { name: '打开导航菜单' })
    fireEvent.click(hamburger)

    expect(document.getElementById('mobile-navigation')).toBeInTheDocument()

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape' })

    // Mobile nav must be closed
    expect(document.getElementById('mobile-navigation')).toBeNull()
    expect(hamburger).toHaveAttribute('aria-expanded', 'false')
  })

  it('MOBILE-NAV-A11Y-06: close restores hamburger focus', () => {
    render(<TestApp />)

    const hamburger = screen.getByRole('button', { name: '打开导航菜单' })
    hamburger.focus()
    expect(document.activeElement).toBe(hamburger)

    // Open drawer
    fireEvent.click(hamburger)
    const mobileNav = document.getElementById('mobile-navigation')
    expect(mobileNav).toBeInTheDocument()

    // Close drawer via Escape key
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(document.getElementById('mobile-navigation')).toBeNull()
    // Focus MUST be restored to the hamburger trigger button
    expect(document.activeElement).toBe(hamburger)
  })

  it('MOBILE-NAV-A11Y-07: route navigation closes drawer', () => {
    render(<TestApp initialEntries={['/']} />)

    const hamburger = screen.getByRole('button', { name: '打开导航菜单' })
    fireEvent.click(hamburger)

    const mobileNav = document.getElementById('mobile-navigation')
    expect(mobileNav).toBeInTheDocument()

    // Find and click the '智能出题' link inside mobile drawer
    const navLinks = within(mobileNav).getAllByRole('link', { name: /智能出题/ })
    expect(navLinks.length).toBeGreaterThan(0)
    fireEvent.click(navLinks[0])

    // Drawer must be closed automatically upon route change
    expect(document.getElementById('mobile-navigation')).toBeNull()
    expect(hamburger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByTestId('page-smart-gen')).toBeInTheDocument()
  })
})
