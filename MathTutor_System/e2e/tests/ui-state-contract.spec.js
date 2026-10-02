/**
 * BROWSER_STATE_CONTRACT — NOT REAL_E2E.
 *
 * These tests intentionally use Playwright page.route() to deterministically
 * drive UI states that cannot be produced against a real backend without an
 * external LLM (agent lifecycles, upload polling, unknown future statuses,
 * transport failures). They assert the Chinese presentation contract only.
 */
import { expect, test } from '../fixtures/auth'
import { attachGuards, TEACHER_URL, STUDENT_URL } from '../fixtures/auth'

function runRow(id, goal, status) {
  return { id, goal, status, created_at: '2026-10-02T08:00:00' }
}

const completedArtifact = {
  id: 601,
  agent_run_id: 501,
  artifact_type: 'practice_set',
  status: 'ready_for_confirmation',
  version: 3,
  content_json: {
    title: '契约草稿',
    summary: '状态契约用草稿',
    safety_mode: 'draft_only',
    questions: [
      {
        client_question_id: 'q-1',
        question_type: 'choice',
        stem: '1 + 1 = ?',
        options: ['2', '3'],
        answer: 'A',
        explanation: '2',
        knowledge_points: ['有理数'],
        difficulty: 'easy',
        score: 5,
      },
    ],
  },
  validation_json: { valid: true, question_count: 1, errors: [] },
}

function actionRow(status) {
  return {
    id: 701,
    artifact_id: 601,
    action_type: 'save_practice_set_to_question_bank',
    status,
    idempotency_key: 'k'.repeat(24),
    expected_artifact_version: 3,
    error_code: status === 'failed' ? 'save_failed' : null,
    error_message: status === 'failed' ? 'Practice save failed' : null,
    result_json: status === 'completed' ? { question_count: 1, question_ids: [11] } : null,
  }
}

async function routeCompletedDraft(teacherPage, actionStatus) {
  await teacherPage.route('**/api/teacher-agent/runs?*', (route) =>
    route.fulfill({ json: [runRow(501, '草稿运行', 'completed')] }))
  await teacherPage.route('**/api/teacher-agent/runs/501', (route) =>
    route.fulfill({ json: runRow(501, '草稿运行', 'completed') }))
  await teacherPage.route('**/api/teacher-agent/runs/501/artifacts*', (route) =>
    route.fulfill({ json: [completedArtifact] }))
  await teacherPage.route('**/api/teacher-agent/artifacts/601/actions', (route) =>
    route.fulfill({ json: [actionRow(actionStatus)] }))
}

async function openDraftWithAction(teacherPage, actionStatus) {
  await routeCompletedDraft(teacherPage, actionStatus)
  await teacherPage.goto(`${TEACHER_URL}/teacher-agent`)
  await teacherPage.getByRole('button', { name: /草稿运行/ }).first().click()
  await expect(teacherPage.getByRole('heading', { name: '练习草稿' })).toBeVisible({ timeout: 20_000 })
}

test.describe('BROWSER_STATE_CONTRACT Teacher Agent run lifecycle', () => {
  test('run statuses render Chinese and never raw machine values', async ({ teacherPage }) => {
    const guards = attachGuards(teacherPage, { api5xx: false })

    await teacherPage.route('**/api/teacher-agent/runs?*', async (route) => {
      await route.fulfill({
        json: [
          runRow(101, '运行目标', 'running'),
          runRow(102, '完成目标', 'completed'),
          runRow(103, '补充目标', 'needs_input'),
          runRow(104, '失败目标', 'failed'),
          runRow(105, '创建目标', 'created'),
        ],
      })
    })
    await teacherPage.goto(`${TEACHER_URL}/teacher-agent`)
    await expect(teacherPage.getByText('最近运行')).toBeVisible({ timeout: 20_000 })

    await expect(teacherPage.getByText('运行中', { exact: true })).toBeVisible()
    await expect(teacherPage.getByText('已完成', { exact: true })).toBeVisible()
    await expect(teacherPage.getByText('需要补充信息', { exact: true })).toBeVisible()
    await expect(teacherPage.getByText('失败', { exact: true })).toBeVisible()
    await expect(teacherPage.getByText('已创建', { exact: true })).toBeVisible()

    const bodyText = await teacherPage.locator('body').innerText()
    for (const raw of ['running', 'needs_input', 'completed', 'created']) {
      expect(bodyText, `raw machine value "${raw}" must not render`).not.toContain(raw)
    }

    guards.assert({ allowApi5xx: true })
  })

  test('unknown future status renders 未知状态, never the raw value', async ({ teacherPage }) => {
    const guards = attachGuards(teacherPage, { api5xx: false })

    await teacherPage.route('**/api/teacher-agent/runs?*', async (route) => {
      await route.fulfill({ json: [runRow(901, '未知状态目标', 'future_new_status')] })
    })
    await teacherPage.goto(`${TEACHER_URL}/teacher-agent`)
    await expect(teacherPage.getByText('未知状态', { exact: true })).toBeVisible({ timeout: 20_000 })
    const bodyText = await teacherPage.locator('body').innerText()
    expect(bodyText).not.toContain('future_new_status')

    guards.assert({ allowApi5xx: true })
  })
})

test.describe('BROWSER_STATE_CONTRACT Agent action lifecycle', () => {
  for (const [status, label] of [
    ['pending_confirmation', '等待确认'],
    ['executing', '正在保存'],
    ['completed', '保存完成'],
    ['failed', '保存失败'],
    ['cancelled', '已取消'],
  ]) {
    test(`action status ${status} renders ${label}`, async ({ teacherPage }) => {
      const guards = attachGuards(teacherPage, { api5xx: false })

      await openDraftWithAction(teacherPage, status)
      await expect(teacherPage.getByText('保存状态')).toBeVisible()
      await expect(teacherPage.getByText(label, { exact: true }).first()).toBeVisible()
      const bodyText = await teacherPage.locator('body').innerText()
      expect(bodyText).not.toContain(status)

      guards.assert({ allowApi5xx: true })
    })
  }

  test('failed action shows mapped Chinese error, not backend English', async ({ teacherPage }) => {
    const guards = attachGuards(teacherPage, { api5xx: false })

    await openDraftWithAction(teacherPage, 'failed')
    await expect(teacherPage.getByText('保存到题库失败，请稍后重试')).toBeVisible()
    await expect(teacherPage.getByText('Practice save failed')).toHaveCount(0)

    guards.assert({ allowApi5xx: true })
  })
})

test.describe('BROWSER_STATE_CONTRACT confirmation dialog', () => {
  test('dialog labels, summary and will_not phrases are fully Chinese', async ({ teacherPage }) => {
    const guards = attachGuards(teacherPage, { api5xx: false })

    await routeCompletedDraft(teacherPage, 'pending_confirmation')
    await teacherPage.route('**/api/teacher-agent/artifacts/601/prepare-save', (route) =>
      route.fulfill({
        json: {
          action: actionRow('pending_confirmation'),
          confirmation_summary: {
            question_count: 2,
            target_label: '保存到：当前教师私有题库',
            knowledge_points: ['一次函数'],
            total_score: 20,
            artifact_version: 3,
            will_not: ['publish homework', 'create exam', 'some future phrase'],
          },
        },
      }))

    await teacherPage.goto(`${TEACHER_URL}/teacher-agent`)
    await teacherPage.getByRole('button', { name: /草稿运行/ }).first().click()
    await expect(teacherPage.getByRole('button', { name: '保存到题库' })).toBeVisible({ timeout: 20_000 })
    await teacherPage.getByRole('button', { name: '保存到题库' }).click()

    const dialog = teacherPage.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: '确认保存到题库' })).toBeVisible()
    await expect(dialog.getByText('将创建 2 道正式题目')).toBeVisible()
    await expect(dialog.getByText(/保存目标：/)).toBeVisible()
    await expect(dialog.getByText(/知识点：一次函数/)).toBeVisible()
    await expect(dialog.getByText(/总分：20/)).toBeVisible()
    await expect(dialog.getByText(/草稿版本：3/)).toBeVisible()
    await expect(dialog.getByText('不会发布作业')).toBeVisible()
    await expect(dialog.getByText('不会创建考试')).toBeVisible()
    await expect(dialog.getByText(/some future phrase/)).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: '取消' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: '确认保存到题库' })).toBeVisible()

    const dialogText = await dialog.innerText()
    for (const forbidden of ['Will create', 'Target:', 'Knowledge points:', 'Will not:', 'Confirm save', 'Cancel']) {
      expect(dialogText).not.toContain(forbidden)
    }

    guards.assert({ allowApi5xx: true })
  })
})

test.describe('BROWSER_STATE_CONTRACT RAG async upload', () => {
  async function openKnowledgeBase(teacherPage, statusSequence, finalError) {
    await teacherPage.route('**/api/rag/upload/async', async (route) => {
      await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ task_id: 'task-e2e-1', status: 'pending', message: 'Queued' }) })
    })
    let pollCount = 0
    await teacherPage.route('**/api/rag/upload/status/*', async (route) => {
      const status = statusSequence[Math.min(pollCount, statusSequence.length - 1)]
      pollCount += 1
      await route.fulfill({
        json: {
          task_id: 'task-e2e-1',
          status,
          message: null,
          filename: '契约文档.pdf',
          error: finalError && status === 'failed' ? finalError : null,
        },
      })
    })

    await teacherPage.goto(`${TEACHER_URL}/knowledge-base`)
    await expect(teacherPage.getByRole('button', { name: '上传资料' }).first()).toBeVisible({ timeout: 20_000 })
    await teacherPage.getByText('使用异步导入').click()
    await teacherPage.setInputFiles('input[type="file"]', {
      name: '契约文档.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 e2e contract fixture'),
    })
  }

  test('async upload progress ends with the Chinese success feedback', async ({ teacherPage }) => {
    const guards = attachGuards(teacherPage, { api5xx: false })

    await openKnowledgeBase(teacherPage, ['processing', 'done'])
    await expect(teacherPage.getByText(/已加入知识库/).first()).toBeVisible({ timeout: 30_000 })

    guards.assert({ allowApi5xx: true })
  })

  test('async upload failure shows a Chinese error, not the backend English text', async ({ teacherPage }) => {
    const guards = attachGuards(teacherPage, { api5xx: false })

    await openKnowledgeBase(teacherPage, ['failed'], 'Upload failed')
    await expect(teacherPage.getByText('导入失败，请稍后重试').first()).toBeVisible({ timeout: 30_000 })
    const bodyText = await teacherPage.locator('body').innerText()
    expect(bodyText).not.toContain('Upload failed')

    guards.assert({ allowApi5xx: true })
  })
})

test.describe('BROWSER_STATE_CONTRACT error presentation', () => {
  test('machine error prefix is hidden, Chinese business text kept (student)', async ({ studentPage }) => {
    const guards = attachGuards(studentPage, { api5xx: false })

    await studentPage.route('**/api/student/exams', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'EXAM_GRADING_ERROR: 提交批改结果失败，请稍后重试。' }),
      })
    })
    await studentPage.goto(`${STUDENT_URL}/exams`)
    // Known machine code → stable Chinese mapping (remainder ignored entirely)
    await expect(studentPage.getByText('提交批改结果失败，请稍后重试').first()).toBeVisible({ timeout: 20_000 })
    const bodyText = await studentPage.locator('body').innerText()
    expect(bodyText).not.toContain('EXAM_GRADING_ERROR')

    guards.assert({ allowApi5xx: true })
  })

  test('machine code with embedded secret maps to the stable Chinese message (student)', async ({ studentPage }) => {
    const guards = attachGuards(studentPage, { api5xx: false })
    const secret = ['browser', '-secret-token'].join('')

    await studentPage.route('**/api/student/exams', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: `EXAM_GRADING_ERROR: 提交失败，Authorization: Bearer ${secret}` }),
      })
    })
    await studentPage.goto(`${STUDENT_URL}/exams`)
    // Known machine code → stable Chinese mapping; the credential-bearing
    // remainder must never reach the UI.
    await expect(studentPage.getByText('提交批改结果失败，请稍后重试').first()).toBeVisible({ timeout: 20_000 })
    const bodyText = await studentPage.locator('body').innerText()
    expect(bodyText).not.toContain(secret)
    expect(bodyText).not.toContain('Authorization')
    expect(bodyText).not.toContain('EXAM_GRADING_ERROR')
    expect(bodyText).not.toContain('提交失败')

    guards.assert({ allowApi5xx: true })
  })

  test('Chinese error text carrying an access_token credential fails closed (student)', async ({ studentPage }) => {
    const guards = attachGuards(studentPage, { api5xx: false })
    // Runtime-generated secret; never a committed credential literal.
    const secret = ['opaque', '-browser-', 'token-99'].join('')

    // No known machine-code prefix here: this exercises the
    // containsSensitiveMaterial() detector itself on the UI path.
    await studentPage.route('**/api/student/exams', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: `处理失败，access_token=${secret}` }),
      })
    })
    await studentPage.goto(`${STUDENT_URL}/exams`)
    await expect(studentPage.getByText('服务暂时不可用，请稍后重试').first()).toBeVisible({ timeout: 20_000 })
    const bodyText = await studentPage.locator('body').innerText()
    expect(bodyText).not.toContain('access_token')
    expect(bodyText).not.toContain(secret)

    guards.assert({ allowApi5xx: true })
  })

  test('network failure shows the Chinese transport message (student)', async ({ studentPage }) => {
    const guards = attachGuards(studentPage, { api5xx: false })

    await studentPage.route('**/api/student/exams', async (route) => {
      await route.abort('connectionrefused')
    })
    await studentPage.goto(`${STUDENT_URL}/exams`)
    await expect(studentPage.getByText('网络连接失败，请检查网络后重试').first()).toBeVisible({ timeout: 20_000 })
    const bodyText = await studentPage.locator('body').innerText()
    expect(bodyText).not.toContain('Failed to fetch')
    expect(bodyText).not.toContain('Network Error')

    guards.assert({ allowApi5xx: true })
  })

  test('HTTP 500 with English detail never leaks raw text (student)', async ({ studentPage }) => {
    const guards = attachGuards(studentPage, { api5xx: false })

    await studentPage.route('**/api/student/exams', async (route) => {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Internal Server Error' }) })
    })
    await studentPage.goto(`${STUDENT_URL}/exams`)
    await expect(studentPage.getByText('服务暂时不可用，请稍后重试').first()).toBeVisible({ timeout: 20_000 })
    const bodyText = await studentPage.locator('body').innerText()
    expect(bodyText).not.toContain('Internal Server Error')

    guards.assert({ allowApi5xx: true })
  })
})
