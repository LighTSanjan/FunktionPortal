import { defineConfig, devices } from '@playwright/test'
import { loadIsolatedTestEnv } from './scripts/test/playwright-env'

/**
 * Usability journeys: a real browser, the real app, the throwaway stack.
 *
 * The integration tests prove the server actions do the right thing. These
 * prove a person can actually get there — that every screen renders for the
 * people who are meant to see it, and fails politely for those who are not.
 * A page that crashes because a query now returns nothing is invisible to an
 * action test and the first thing a treasurer sees.
 *
 *   npm run test:stack && npm run test:usability
 */
const testEnv = loadIsolatedTestEnv()
const baseURL = 'http://127.0.0.1:3100'
const suites: Record<string, string | string[]> = {
  journeys: 'journeys.spec.ts',
  'tour-general': 'tour.spec.ts',
  'tour-fees': 'fees-tour.spec.ts',
  'tour-audit': ['journeys.spec.ts', 'zz-audit-tour.spec.ts'],
}
const suite = process.env.PLAYWRIGHT_USABILITY_SUITE ?? 'journeys'

if (!(suite in suites)) {
  throw new Error(`Unknown PLAYWRIGHT_USABILITY_SUITE: ${suite}`)
}

export default defineConfig({
  testDir: './e2e/usability',
  testMatch: suites[suite],
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  globalSetup: './e2e/usability/seed.ts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx next start -H 127.0.0.1 -p 3100',
    url: `${baseURL}/sign-in`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      ...testEnv,
      NEXT_PUBLIC_APP_URL: baseURL,
    },
  },
})
