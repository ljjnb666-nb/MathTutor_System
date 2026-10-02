/**
 * Setup project: create storage states by REALLY logging into the real backend,
 * then injecting the issued token into the real frontends' localStorage.
 * No hardcoded JWT anywhere — every token comes from a live login call.
 */
import { expect, test as setup } from '@playwright/test'
import {
  adminToken,
  STORAGE_STATE,
  studentToken,
  teacherToken,
  TEACHER_URL,
  STUDENT_URL,
} from './fixtures/auth'

async function persistToken(page, origin, storageKey, token) {
  await page.goto(origin)
  await page.evaluate(([key, value]) => {
    localStorage.setItem(key, value)
  }, [storageKey, token])
  await page.reload()
}

setup('create teacher storage state', async ({ request, page }) => {
  const token = await teacherToken(request)
  await persistToken(page, TEACHER_URL, 'math_tutor_auth_token', token)
  await expect(page).toHaveURL(new RegExp(`${TEACHER_URL.replace(/[:/]/g, '\\$&')}/(\\?.*)?$`))
  await page.context().storageState({ path: STORAGE_STATE.teacher })
})

setup('create admin storage state', async ({ request, page }) => {
  const token = await adminToken(request)
  await persistToken(page, TEACHER_URL, 'math_tutor_auth_token', token)
  await page.context().storageState({ path: STORAGE_STATE.admin })
})

setup('create student storage state', async ({ request, page }) => {
  const token = await studentToken(request)
  await persistToken(page, STUDENT_URL, 'math_tutor_student_token', token)
  await page.context().storageState({ path: STORAGE_STATE.student })
})
