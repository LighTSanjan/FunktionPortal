/**
 * Load .env.test, and refuse to go any further if it points anywhere real.
 *
 * Imported before anything that reads process.env, so the database client and
 * the storage client are both built against the test stack.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const file = path.resolve(__dirname, '../../../.env.test')

for (const line of readFileSync(file, 'utf8').split('\n')) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
  if (!match) continue
  const [, key, raw] = match
  process.env[key] = raw.replace(/^"(.*)"$/, '$1')
}

const LOCAL = /^(postgres(ql)?|https?):\/\/([^@/]*@)?(localhost|127\.0\.0\.1)(:\d+)?/

for (const key of ['DATABASE_URL', 'DIRECT_URL', 'NEXT_PUBLIC_SUPABASE_URL'] as const) {
  const value = process.env[key] ?? ''
  if (!LOCAL.test(value)) {
    // Every integration test truncates every table. Pointed at the hosted
    // project that is the club's roster, its payments and its signatures gone.
    throw new Error(
      `Integration tests only run against localhost; ${key} is "${value.replace(/\/\/[^@]*@/, '//***@')}". ` +
        'Start the test stack: docker compose -p funktion-test -f docker-compose.yml -f docker-compose.test.yml up -d'
    )
  }
}

if (process.env.APP_USER_DATABASE_URL) {
  throw new Error('APP_USER_DATABASE_URL must be empty for integration tests, so dbAs uses SET ROLE locally.')
}
