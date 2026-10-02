/**
 * Shared E2E fixtures and guards.
 *
 * Page-error / console policy: any uncaught pageerror fails the test. Known
 * harmless console errors are allowlisted explicitly (never "ignore all").
 * Unexpected 5xx API responses fail REAL_E2E journeys at check time.
 */
import { test as base, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export const BACKEND_URL = 'http://127.0.0.1:8000'
export const TEACHER_URL = 'http://127.0.0.1:5173'
export const STUDENT_URL = 'http://127.0.0.1:5174'

// Credential values come from the environment in CI; defaults match the guarded
// seed fixtures (only valid inside the tutorpro_e2e database).
export const CREDENTIALS = {
  admin: {
    username: process.env.E2E_ADMIN_USERNAME || 'e2e_admin',
    password: process.env.E2E_ADMIN_PASSWORD || 'e2e-admin-pass-123',
  },
  teacher: {
    username: process.env.E2E_TEACHER_USERNAME || 'e2e_teacher',
    password: process.env.E2E_TEACHER_PASSWORD || 'e2e-teacher-pass-123',
  },
  student: {
    loginCode: process.env.E2E_STUDENT_LOGIN_CODE || 'E2E-STU-001',
    password: process.env.E2E_STUDENT_PASSWORD || 'e2e-student-pass-123',
  },
}

export const STORAGE_STATE = {
  teacher: path.join(here, '.auth', 'teacher.json'),
  admin: path.join(here, '.auth', 'admin.json'),
  student: path.join(here, '.auth', 'student.json'),
}

export const teacherToken = async (request) => {
  const response = await request.post(`${BACKEND_URL}/api/token`, {
    form: { username: CREDENTIALS.teacher.username, password: CREDENTIALS.teacher.password },
  })
  expect(response.ok()).toBeTruthy()
  return (await response.json()).access_token
}

export const adminToken = async (request) => {
  const response = await request.post(`${BACKEND_URL}/api/token`, {
    form: { username: CREDENTIALS.admin.username, password: CREDENTIALS.admin.password },
  })
  expect(response.ok()).toBeTruthy()
  return (await response.json()).access_token
}

export const studentToken = async (request) => {
  const response = await request.post(`${BACKEND_URL}/api/student/token`, {
    data: { login_code: CREDENTIALS.student.loginCode, password: CREDENTIALS.student.password },
  })
  expect(response.ok()).toBeTruthy()
  return (await response.json()).access_token
}

// Vite dev overlay / tooling noise that is not a product error.
// "Failed to load resource" is the browser's network-layer log for ANY non-2xx
// response; error-path tests intentionally trigger 401/500/aborted requests,
// while unexpected server failures are still caught by the API 5xx watcher and
// the user-visible assertions of each journey.
const CONSOLE_ALLOWLIST = [
  'React DevTools',
  '[vite]',
  'Failed to load resource',
]

export function attachGuards(page, { api5xx = true } = {}) {
  const state = { pageErrors: [], consoleErrors: [], api5xx: [] }
  page.on('pageerror', (error) => state.pageErrors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (CONSOLE_ALLOWLIST.some((marker) => text.includes(marker))) return
    state.consoleErrors.push(text)
  })
  if (api5xx) {
    page.on('response', (response) => {
      const url = response.url()
      if (url.includes('/api/') && response.status() >= 500) state.api5xx.push(`${response.status()} ${url}`)
    })
  }
  return {
    assert({ allowApi5xx = false } = {}) {
      expect(state.pageErrors, 'uncaught pageerror must not occur').toEqual([])
      const realConsoleErrors = state.consoleErrors
      expect(
        realConsoleErrors,
        `unexpected console.error: \n${realConsoleErrors.join('\n')}`,
      ).toEqual([])
      if (!allowApi5xx) {
        expect(state.api5xx, `unexpected API 5xx: ${state.api5xx.join(', ')}`).toEqual([])
      }
    },
    state,
  }
}

export const test = base.extend({
  teacherPage: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: STORAGE_STATE.teacher })
    const page = await context.newPage()
    await use(page)
    await context.close()
  },
  adminPage: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: STORAGE_STATE.admin })
    const page = await context.newPage()
    await use(page)
    await context.close()
  },
  studentPage: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: STORAGE_STATE.student })
    const page = await context.newPage()
    await use(page)
    await context.close()
  },
})

export { expect }
