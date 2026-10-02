/**
 * REAL_E2E journeys 04 / 05 / 06:
 * - student login through the real UI (login_code + password) and session restore;
 * - exam lifecycle: answer the seeded exam, deliberately get one question wrong,
 *   submit, see the Chinese grading result, find the new mistake in 错题本;
 * - mistake lifecycle: 复习一次 and 标记掌握, verified persisted after reload.
 * No grading API is mocked anywhere in this spec.
 */
import { expect, test } from '../fixtures/auth'
import { attachGuards, CREDENTIALS, STUDENT_URL } from '../fixtures/auth'

test.describe('REAL_E2E student login/session', () => {
  test('student logs in with login code and survives reload', async ({ page }) => {
    const guards = attachGuards(page)

    await page.goto(`${STUDENT_URL}/login`)
    await page.getByLabel('登录码').fill(CREDENTIALS.student.loginCode)
    await page.getByLabel(/密码/).fill(CREDENTIALS.student.password)
    await page.getByRole('button', { name: '登录', exact: true }).click()

    await expect(page.getByText('学情概览')).toBeVisible({ timeout: 20_000 })
    const stored = await page.evaluate(() => localStorage.getItem('math_tutor_student_token'))
    expect(stored).toBeTruthy()

    await page.reload()
    await expect(page.getByText('学情概览')).toBeVisible({ timeout: 20_000 })

    guards.assert()
  })

  test('wrong password shows the backend Chinese error without leakage', async ({ page }) => {
    const guards = attachGuards(page)

    await page.goto(`${STUDENT_URL}/login`)
    await page.getByLabel('登录码').fill(CREDENTIALS.student.loginCode)
    await page.getByLabel(/密码/).fill('wrong-pass')
    await page.getByRole('button', { name: '登录', exact: true }).click()

    await expect(page.getByText('登录码或密码错误').first()).toBeVisible({ timeout: 15_000 })
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/401|Unauthorized|Bearer|eyJhbGci/)

    guards.assert()
  })
})

test.describe('REAL_E2E student exam lifecycle', () => {
  test('answer the seeded exam (one deliberate mistake), submit, grading is real', async ({ studentPage }) => {
    const guards = attachGuards(studentPage)

    await studentPage.goto(`${STUDENT_URL}/exams`)
    await expect(studentPage.getByRole('heading', { name: '我的题目' })).toBeVisible({ timeout: 20_000 })

    await studentPage.getByText('E2E 试卷 - 一次函数').first().click()
    await expect(studentPage.getByText('第 1 题')).toBeVisible({ timeout: 20_000 })

    // Q1 choice: correct answer A
    await studentPage.getByLabel('选项 A', { exact: true }).nth(0).check()
    // Q2 choice: deliberately WRONG (correct is B)
    await studentPage.getByLabel('选项 A', { exact: true }).nth(1).check()
    // Q3 fill: correct answer 7
    await studentPage.getByLabel('第 3 题答案').fill('7')

    await studentPage.getByRole('button', { name: /提交答案/ }).click()

    // Chinese grading result, backed by real graded_at/grade_summary in PostgreSQL
    await expect(studentPage.getByText(/答对/).first()).toBeVisible({ timeout: 20_000 })
    await expect(studentPage.getByText(/已加入错题本/).first()).toBeVisible()

    await studentPage.getByRole('button', { name: '去错题本查看' }).click()
    await expect(studentPage.getByRole('heading', { name: '错题本' })).toBeVisible({ timeout: 20_000 })

    // The deliberately wrong question became a real mistake row
    await expect(studentPage.getByText('E2E-第2题 计算：5 × 3 = ?')).toBeVisible({ timeout: 20_000 })

    guards.assert()
  })

  test('exam list shows the graded exam as 已完成 after submission', async ({ studentPage }) => {
    const guards = attachGuards(studentPage)

    await studentPage.goto(`${STUDENT_URL}/exams`)
    await expect(studentPage.getByRole('heading', { name: '我的题目' })).toBeVisible({ timeout: 20_000 })
    await expect(studentPage.getByText('已完成').first()).toBeVisible()

    guards.assert()
  })
})

test.describe('REAL_E2E student mistake lifecycle', () => {
  test('复习一次 then 标记掌握 persist across reload', async ({ studentPage }) => {
    const guards = attachGuards(studentPage)

    await studentPage.goto(`${STUDENT_URL}/mistakes`)
    await expect(studentPage.getByRole('heading', { name: '错题本' })).toBeVisible({ timeout: 20_000 })

    // 复习一次 on the seeded mistake (stays pending, review recorded)
    const seeded = studentPage.locator('li').filter({ hasText: 'E2E 预置错题' })
    await expect(seeded).toBeVisible()
    await seeded.getByRole('button', { name: '复习一次' }).click()
    await expect(studentPage.getByText('已记录复习')).toBeVisible({ timeout: 15_000 })

    // 标记掌握 the exam-derived mistake
    const examMistake = studentPage.locator('li').filter({ hasText: 'E2E-第2题' }).first()
    await expect(examMistake).toBeVisible()
    await examMistake.getByRole('button', { name: '标记为已掌握' }).click()
    await expect(studentPage.getByText('已标记为掌握')).toBeVisible({ timeout: 15_000 })

    // Status survives a full reload (real DB persistence)
    await studentPage.reload()
    await expect(studentPage.getByRole('heading', { name: '错题本' })).toBeVisible({ timeout: 20_000 })
    await studentPage.getByRole('button', { name: '已掌握错题' }).click()
    await expect(studentPage.getByText('E2E-第2题 计算：5 × 3 = ?')).toBeVisible({ timeout: 20_000 })

    // The seeded mistake is still pending after review
    await studentPage.getByRole('button', { name: '待攻克错题' }).click()
    await expect(studentPage.getByText('E2E 预置错题')).toBeVisible({ timeout: 20_000 })

    guards.assert()
  })
})
