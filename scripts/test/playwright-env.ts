import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'dotenv'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

function requireLoopbackUrl(env: Record<string, string>, name: string, expectedPort: string) {
  const value = env[name]
  if (!value) throw new Error(`${name} is missing from .env.test`)

  const url = new URL(value)
  if (!LOOPBACK_HOSTS.has(url.hostname) || url.port !== expectedPort) {
    throw new Error(
      `${name} must point at the throwaway local test stack on port ${expectedPort}; received ${url.origin}`
    )
  }
}

export function assertIsolatedTestEnv(env: Record<string, string>): void {
  requireLoopbackUrl(env, 'DATABASE_URL', '55432')
  requireLoopbackUrl(env, 'DIRECT_URL', '55432')
  if (!Object.hasOwn(env, 'APP_USER_DATABASE_URL')) {
    throw new Error('APP_USER_DATABASE_URL is missing from .env.test')
  }
  // Empty is the intentional local mode: dbAs switches to app_user inside the
  // transaction. If a direct login URL is supplied, it must still be local.
  if (env.APP_USER_DATABASE_URL) {
    requireLoopbackUrl(env, 'APP_USER_DATABASE_URL', '55432')
  }
  requireLoopbackUrl(env, 'NEXT_PUBLIC_SUPABASE_URL', '58000')
  requireLoopbackUrl(env, 'MAILPIT_URL', '58025')
}

/**
 * Load the browser-test environment and refuse to run against anything except
 * the dedicated Docker stack. This check happens while Playwright loads its
 * config, before a web server or global setup can mutate data.
 */
export function loadIsolatedTestEnv(): Record<string, string> {
  const path = resolve(process.cwd(), '.env.test')
  let env: Record<string, string>

  try {
    env = parse(readFileSync(path))
  } catch (error) {
    throw new Error(
      'Missing .env.test. Run `npm run test:stack` before launching Playwright.',
      { cause: error }
    )
  }

  // Older generated .env.test files predate this explicit setting; the
  // application already used the same loopback URL as its test-only default.
  env.MAILPIT_URL ||= 'http://localhost:58025'
  // The screen gallery includes intentional 404/500 states and is never
  // exposed by default in a real production environment. Visual tours opt in.
  env.ENABLE_SCREEN_PREVIEWS ||= 'true'

  assertIsolatedTestEnv(env)

  return env
}
