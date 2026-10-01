/**
 * The month's pack as one PDF, printed by a real Chrome from the print page.
 *
 * Not a third renderer. The print page is already the document laid out for
 * paper, and it is held to the .docx by the drift tests; anything that drew
 * the PDF separately would be one more rendering to drift. So the server opens
 * that page in headless Chromium, as the person asking, and prints it.
 *
 * Locally that is Playwright's own Chromium. On Vercel it is @sparticuz/chromium,
 * a build of Chromium small enough for a serverless function.
 */
import 'server-only'
import type { Browser } from 'playwright-core'

async function launch(): Promise<Browser> {
  const { chromium: playwright } = await import('playwright-core')
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const { default: chromium } = await import('@sparticuz/chromium')
    return playwright.launch({ args: chromium.args, executablePath: await chromium.executablePath() })
  }
  return playwright.launch()
}

class PrintFailedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PrintFailedError'
  }
}

/**
 * `appOrigin` must come from configuration, never from the request: the
 * caller's session cookies go wherever this points.
 */
export async function printPageToPdf(args: {
  appOrigin: string
  path: string
  sessionCookies: Array<{ name: string; value: string }>
}): Promise<Buffer> {
  const browser = await launch()
  try {
    const context = await browser.newContext()
    await context.addCookies(
      args.sessionCookies.map((cookie) => ({ ...cookie, url: args.appOrigin }))
    )
    const page = await context.newPage()
    const response = await page.goto(`${args.appOrigin}${args.path}`, { waitUntil: 'networkidle', timeout: 45_000 })
    // A redirect to sign-in or to "that screen is for the exco" would print
    // perfectly well, and be the wrong document.
    if (!response?.ok() || new URL(page.url()).pathname !== args.path) {
      throw new PrintFailedError(`The print page did not open (${response?.status() ?? 'no response'} at ${new URL(page.url()).pathname})`)
    }
    await page.emulateMedia({ media: 'print' })
    return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })
  } finally {
    await browser.close()
  }
}
