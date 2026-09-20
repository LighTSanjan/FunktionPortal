import { defineConfig, devices } from '@playwright/test'
import { loadIsolatedTestEnv } from './scripts/test/playwright-env'

const testEnv = loadIsolatedTestEnv()
const baseURL = 'http://127.0.0.1:3100'

export default defineConfig({
  testDir: './e2e',
  // The default suite is deliberately read-only. State-changing journeys live
  // behind playwright.usability.config.ts and always use the throwaway stack.
  testMatch: 'auth.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
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
