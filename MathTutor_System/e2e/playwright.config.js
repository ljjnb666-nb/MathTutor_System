/**
 * Playwright browser E2E gate for MathTutor_System.
 *
 * REAL_E2E: real Chromium -> teacher/student Vite dev servers -> FastAPI -> PostgreSQL.
 * BROWSER_STATE_CONTRACT: page.route() interception to deterministically drive UI
 * states — those tests are clearly grouped in ui-state-contract.spec.js and are
 * never reported as REAL_E2E.
 */
import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

const BACKEND_URL = 'http://127.0.0.1:8000'
const TEACHER_URL = 'http://127.0.0.1:5173'
const STUDENT_URL = 'http://127.0.0.1:5174'

const databaseUrl = process.env.E2E_DATABASE_URL
  || 'postgresql+psycopg://tutorpro:tutorpro_e2e_password@localhost:5433/tutorpro_e2e'

const backendEnv = {
  DATABASE_URL: databaseUrl,
  ENV: 'e2e',
  DEBUG: 'true',
  LLM_API_KEY: '',
  TUTORPRO_E2E: '1',
}

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  globalSetup: path.join(here, 'global-setup.js'),
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',
  use: {
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'setup',
      testDir: '.',
      testMatch: /auth\.setup\.js/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
  webServer: [
    {
      command: 'python -m uvicorn app.main:app --host 127.0.0.1 --port 8000',
      url: `${BACKEND_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      cwd: path.join(repoRoot, 'backend'),
      env: backendEnv,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
      url: TEACHER_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      cwd: path.join(repoRoot, 'frontend'),
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',
      url: STUDENT_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      cwd: path.join(repoRoot, 'frontend-student'),
    },
  ],
})
