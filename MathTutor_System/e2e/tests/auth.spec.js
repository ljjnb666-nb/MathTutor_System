/**
 * REAL_E2E journey 01: teacher login through the real UI.
 * Real Chromium -> Vite teacher app -> FastAPI -> PostgreSQL.
 * Wrong password shows a Chinese error; no HTTP/machine leakage.
 */
import { expect, test } from '../fixtures/auth'
import { attachGuards, CREDENTIALS, TEACHER_URL } from '../fixtures/auth'

test.describe('REAL_E2E teacher login/session', () => {
  let guards

  test.beforeEach(({ page }) => {
    guards = attachGuards(page)
  })

  test.afterEach(() => {
    guards.assert()
  })

  test('wrong password shows a Chinese error without machine leakage', async ({ page }) => {
    await page.goto(`${TEACHER_URL}/login`)
    await page.getByLabel(/用户名/).fill(CREDENTIALS.teacher.username)
    await page.getByLabel(/密码/, { exact: false }).first().fill('wrong-password-000')
    await page.getByRole('button', { name: /登录/ }).click()

    const alert = page.getByRole('alert')
    await expect(alert).toBeVisible()
    await expect(alert).toContainText('用户名或密码错误')
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/401|Unauthorized|Token|Request failed/)
    expect(bodyText).not.toMatch(/Bearer|eyJhbGci/)
  })

  test('correct login reaches the dashboard and survives a reload', async ({ page, request }) => {
    await page.goto(`${TEACHER_URL}/login`)
    await page.getByLabel(/用户名/).fill(CREDENTIALS.teacher.username)
    await page.getByLabel(/密码/, { exact: false }).first().fill(CREDENTIALS.teacher.password)
    await page.getByRole('button', { name: /登录/ }).click()

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 })
    await expect(page.locator('.v2-page-shell').first()).toBeVisible({ timeout: 20_000 })

    // Token is a real backend-issued JWT (never hardcoded in the repo).
    const stored = await page.evaluate(() => localStorage.getItem('math_tutor_auth_token'))
    expect(stored).toBeTruthy()
    expect(stored.startsWith('eyJ')).toBe(true)

    await page.reload()
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 })
    await expect(page.locator('.v2-page-shell').first()).toBeVisible()
  })
})
