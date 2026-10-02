/**
 * REAL_E2E security journey 12 — student credential policy at the real boundary.
 *
 * The backend test suite is the security authority; this journey proves the
 * teacher-facing UI surfaces the server's Chinese rejection when a student is
 * given a login code without a password, and that supplying a password then
 * succeeds. No API is mocked.
 */
import { expect, test } from '../fixtures/auth'
import { attachGuards, BACKEND_URL, TEACHER_URL, teacherToken } from '../fixtures/auth'

const UNIQUE = Date.now().toString().slice(-6)

test.describe('REAL_E2E student credential policy', () => {
  test('login code without password is rejected with the Chinese reason, then succeeds with one', async ({ teacherPage, request }) => {
    const guards = attachGuards(teacherPage)

    await teacherPage.goto(`${TEACHER_URL}/student-mgmt`)
    await expect(teacherPage.getByRole('button', { name: /添加学生/ }).first()).toBeVisible({ timeout: 20_000 })
    await teacherPage.getByRole('button', { name: /添加学生/ }).first().click()

    const nameInput = teacherPage.locator('input[placeholder="请输入姓名"]')
    await expect(nameInput).toBeVisible({ timeout: 10_000 })
    await nameInput.fill(`安全验证学生${UNIQUE}`)
    await teacherPage.locator('input[placeholder="学生用此码登录学生端"]').fill(`E2E-SEC-${UNIQUE}`)
    // Password deliberately left empty: the server must refuse the credential pair.
    await teacherPage.getByRole('button', { name: '添加', exact: true }).click()

    await expect(
      teacherPage.getByText(/启用学生端登录.*必须.*设置密码|必须同时设置密码/).first(),
    ).toBeVisible({ timeout: 15_000 })
    const bodyText = await teacherPage.locator('body').innerText()
    expect(bodyText).not.toMatch(/Bad Request|Exception|Traceback|POST .*400/)

    // Now supply the paired password: the same submission succeeds.
    await teacherPage.locator('input[type="password"]').fill('e2e-secure-pass-9')
    await teacherPage.getByRole('button', { name: '添加', exact: true }).click()
    await expect(teacherPage.getByText(`安全验证学生${UNIQUE}`).first()).toBeVisible({ timeout: 20_000 })

    guards.assert()

    // Cleanup through the real API so the shared e2e database returns to its
    // seeded shape for the journeys that run after this spec (workers=1).
    const token = await teacherToken(request)
    const headers = { Authorization: `Bearer ${token}` }
    const list = await request.get(`${BACKEND_URL}/api/students/`, { headers })
    const created = (await list.json()).find((s) => s.login_code === `E2E-SEC-${UNIQUE}`)
    if (created) {
      const deleted = await request.delete(`${BACKEND_URL}/api/students/${created.id}`, { headers })
      expect(deleted.ok()).toBeTruthy()
    }
  })
})
