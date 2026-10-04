/**
 * REAL_E2E journeys 02 / 03 / 07:
 * - teacher navigation over every visible route (no crash, no blank screen);
 * - admin-only 用户管理 permission boundary (real role from real backend);
 * - schedule CRUD through the real UI with persistence checks.
 */
import { expect, test } from '../fixtures/auth'
import { attachGuards, TEACHER_URL } from '../fixtures/auth'

const TEACHER_ROUTES = [
  '/',
  '/smart-gen',
  '/chat',
  '/teacher-agent',
  '/question-bank',
  '/knowledge-base',
  '/exams/import',
  '/ppt',
  '/schedule',
  '/homework-progress',
  '/mistake-book',
  '/knowledge-graph',
  '/reports',
  '/exams',
  '/student-mgmt',
  '/pricing',
  '/settings',
]

test.describe('REAL_E2E teacher navigation', () => {
  test('every teacher route loads with real backend data and no crash', async ({ teacherPage }) => {
    const guards = attachGuards(teacherPage)
    for (const route of TEACHER_ROUTES) {
      await teacherPage.goto(`${TEACHER_URL}${route}`)
      await expect(teacherPage.locator('main').first()).toBeVisible({ timeout: 20_000 })
      const bodyText = (await teacherPage.locator('body').innerText()).trim()
      expect(bodyText.length, `route ${route} rendered a blank screen`).toBeGreaterThan(10)
    }
    guards.assert()
  })
})

test.describe('REAL_E2E admin permission boundary', () => {
  test('teacher does not see 用户管理 and is redirected away from /admin-users', async ({ teacherPage }) => {
    const guards = attachGuards(teacherPage)

    await teacherPage.goto(TEACHER_URL)
    await expect(teacherPage.locator('.v2-page-shell').first()).toBeVisible()
    await expect(teacherPage.getByRole('link', { name: '用户管理' })).toHaveCount(0)

    await teacherPage.goto(`${TEACHER_URL}/admin-users`)
    await teacherPage.waitForURL((url) => !url.pathname.includes('/admin-users'), { timeout: 15_000 })
    expect(teacherPage.url()).not.toContain('/admin-users')

    guards.assert()
  })

  test('admin sees the 用户管理 console with real seeded users', async ({ adminPage }) => {
    const guards = attachGuards(adminPage)

    await adminPage.goto(`${TEACHER_URL}/admin-users`)
    await expect(adminPage.getByText('用户管理').first()).toBeVisible({ timeout: 20_000 })
    await expect(adminPage.getByText('e2e_teacher').first()).toBeVisible({ timeout: 20_000 })
    // Roles are presented in Chinese through the shared SSOT.
    await expect(adminPage.getByText('教师', { exact: true }).first()).toBeVisible()

    guards.assert()
  })
})

test.describe('REAL_E2E teacher schedule CRUD', () => {
  test('create, edit and delete a schedule through the real backend', async ({ teacherPage }) => {
    const guards = attachGuards(teacherPage)
    const unique = `E2E 排课 - ${Date.now()}`
    // Create inside the current week (the default view is a week calendar
    // canvas) on the last day of the week so it sorts strictly after the
    // seeded tomorrow-10:00 fixture.
    const now = new Date()
    const daysToSunday = (7 - now.getDay()) % 7
    const dateValue = new Date(now.getTime() + daysToSunday * 86_400_000).toISOString().slice(0, 10)

    // Accept every native confirm up front: overlap warning on create and
    // the delete confirmation later.
    teacherPage.on('dialog', (d) => d.accept())

    await teacherPage.goto(`${TEACHER_URL}/schedule`)
    await expect(teacherPage.getByRole('button', { name: '添加排课' }).first()).toBeVisible({ timeout: 20_000 })
    await teacherPage.getByRole('button', { name: '添加排课' }).first().click()

    await expect(teacherPage.locator('#schedule-modal-title')).toBeVisible()

    // Student dropdown: the modal may preselect the seeded student; otherwise
    // open the dropdown and pick it (options carry a "名字 / 年级 班级"
    // accessible name and render under a pointer-capture overlay → force)
    const studentTrigger = teacherPage.getByRole('button', { name: '请选择学生' })
    if (await studentTrigger.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await studentTrigger.click()
      await teacherPage.getByRole('button', { name: /^E2E学生/ }).first().click({ force: true })
    } else {
      await expect(teacherPage.getByRole('button', { name: /^E2E学生/ }).first()).toBeVisible()
    }

    await teacherPage.locator('input[type="date"]').fill(dateValue)
    const timeInputs = teacherPage.locator('input[type="time"]')
    await timeInputs.nth(0).fill('15:00')
    await timeInputs.nth(1).fill('16:00')
    await teacherPage.getByPlaceholder('如：二次函数复习').fill(unique)
    await teacherPage.getByRole('button', { name: '添加', exact: true }).click()

    await expect(teacherPage.getByRole('heading', { name: unique, exact: true })).toBeVisible({ timeout: 15_000 })

    // Edit: the week-calendar card is an <article.v2-schedule-block> holding
    // both the heading and the action buttons.
    const createdCard = teacherPage.locator('article.v2-schedule-block').filter({ has: teacherPage.getByRole('heading', { name: unique }) })
    await createdCard.getByTitle('编辑排课').click()
    await expect(teacherPage.locator('#schedule-modal-title')).toHaveText('编辑排课')
    await teacherPage.getByPlaceholder('如：二次函数复习').fill(`${unique}-改`)
    await teacherPage.getByRole('button', { name: '保存', exact: true }).click()
    await expect(teacherPage.getByRole('heading', { name: `${unique}-改`, exact: true })).toBeVisible({ timeout: 15_000 })

    // Delete with the native confirm (accepted by the page-level handler)
    const editedCard = teacherPage.locator('article.v2-schedule-block').filter({ has: teacherPage.getByRole('heading', { name: `${unique}-改` }) })
    await editedCard.getByTitle('删除排课').click()
    await expect(teacherPage.getByText(`${unique}-改`)).toHaveCount(0, { timeout: 15_000 })

    // Persistence: reload shows neither the created nor the edited schedule
    await teacherPage.reload()
    await expect(teacherPage.getByText(unique)).toHaveCount(0)
    await expect(teacherPage.getByText(`${unique}-改`)).toHaveCount(0)

    guards.assert()
  })
})
