import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Seeded demo accounts for Northstar Studios (ORG_A), one per role. Sourced
 * from the FUNKtion seed rather than duplicated here, so these can't drift
 * from what `npm run db:seed` actually creates.
 */
// Placeholder fixtures until the FUNKtion seed lands.
const SHARED_PASSWORD = 'funktion-e2e'
const ORG_A = { slug: 'funktion' }

export const ORG_A_SLUG = ORG_A.slug

export const DEMO_USERS = {
  owner: 'ava.lim@northstarstudios.sg',
  hrAdmin: 'rachel.tan@northstarstudios.sg',
  manager: 'daniel.chen@northstarstudios.sg',
  employee: 'marcus.lee@northstarstudios.sg',
} as const

export type DemoRole = keyof typeof DEMO_USERS

/**
 * Signs in through the real UI (not a storage-state shortcut) and waits for
 * the post-login redirect into the org dashboard, so every test that calls
 * this starts from a known, fully-authenticated state.
 */
export async function signIn(page: Page, role: DemoRole): Promise<void> {
  // Clear any existing session first — the proxy redirects an already
  // authenticated visitor away from /sign-in before the form ever renders,
  // which matters here since a single test often switches between roles.
  await page.context().clearCookies()
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(DEMO_USERS[role])
  await page.getByLabel('Password').fill(SHARED_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(new RegExp(`/${ORG_A_SLUG}/`))
}
