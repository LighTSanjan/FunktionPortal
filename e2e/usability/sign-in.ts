import { expect, type Page } from '@playwright/test'

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:58025'

/** The newest sign-in code Mailpit caught for this address, after `since`. */
export async function latestCode(email: string, since: number): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const search = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)
    const { messages = [] } = (await search.json()) as { messages?: Array<{ ID: string; Created: string }> }
    const fresh = messages.find((message) => Date.parse(message.Created) >= since - 2000)
    if (fresh) {
      const message = (await (await fetch(`${MAILPIT}/api/v1/message/${fresh.ID}`)).json()) as { Text: string }
      const code = /\b(\d{6,10})\b/.exec(message.Text)?.[1]
      if (code) return code
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`No sign-in code reached ${email}`)
}

/** Sign in the way a person does: address, email, code. */
export async function signInWithCode(page: Page, email: string, landing: RegExp = /dashboard/) {
  await page.goto('/sign-in')
  await page.locator('#email').fill(email)
  const since = Date.now()
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await expect(page.locator('#code')).toBeVisible()
  await page.locator('#code').fill(await latestCode(email, since))
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(landing)
}
