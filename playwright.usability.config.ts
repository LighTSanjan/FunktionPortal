import { defineConfig, devices } from '@playwright/test'
import { readFileSync } from 'node:fs'

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
const testEnv = Object.fromEntries(
  readFileSync('.env.test', 'utf8')
    .split('\n')
    .map((line) => /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => [match[1], match[2]])
)

export default defineConfig({
  testDir: './e2e/usability',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  globalSetup: './e2e/usability/seed.ts',
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx next dev -p 3100',
    url: 'http://localhost:3100/sign-in',
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      ...testEnv,
      // The local stack confirms every address itself, so here — and only
      // here — a password sign-up's email can be trusted, which lets the
      // bootstrap treasurer be created through the real sign-up form.
      AUTH_EMAILS_ARE_VERIFIED: 'true',
    },
  },
})
