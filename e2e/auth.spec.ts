import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('should show sign-in page', async ({ page }) => {
    await page.goto('/sign-in')
    await expect(page.getByRole('heading', { name: 'Welcome!' })).toBeVisible()
  })

  test('should canonicalise the retired sign-up page to sign-in', async ({
    page,
  }) => {
    await page.goto('/sign-up')
    await expect(page).toHaveURL(/\/sign-in$/)
    await expect(page.getByRole('heading', { name: 'Welcome!' })).toBeVisible()
  })

  test('should redirect unauthenticated users and preserve their destination', async ({
    page,
  }) => {
    await page.goto('/some-org/dashboard')
    await expect(page).toHaveURL(
      /\/sign-in\?callbackUrl=%2Fsome-org%2Fdashboard$/
    )
  })
})
