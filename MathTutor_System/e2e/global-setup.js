/**
 * Global setup: seed the dedicated E2E database through the guarded test-only
 * seed CLI (backend/scripts/e2e_seed.py). The script refuses to run without
 * TUTORPRO_E2E=1 and a DATABASE_URL pointing at the tutorpro_e2e database.
 */
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const backendDir = path.join(repoRoot, 'backend')

const databaseUrl = process.env.E2E_DATABASE_URL
  || 'postgresql+psycopg://tutorpro:tutorpro_e2e_password@localhost:5433/tutorpro_e2e'

export default function globalSetup() {
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    TUTORPRO_E2E: '1',
    ENV: 'e2e',
  }
  try {
    execSync('python scripts/e2e_seed.py', { cwd: backendDir, env, stdio: 'inherit' })
  } catch (error) {
    throw new Error(`E2E seed failed: ${error.message}`)
  }
}
