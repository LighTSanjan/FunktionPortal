/** Verify the app role, installed policies and unscoped RLS isolation. */
import '../load-env'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const DIM = '\x1b[2m'
const OFF = '\x1b[0m'

let failures = 0

function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? `${GREEN}pass${OFF}` : `${RED}FAIL${OFF}`}  ${label}${detail ? ` ${DIM}${detail}${OFF}` : ''}`)
  if (!ok) failures++
}

async function main() {
  const url = process.env.APP_USER_DATABASE_URL
  if (!url) {
    console.error(
      'APP_USER_DATABASE_URL is not set.\n' +
        'Run ./scripts/db/set-app-user-password.sh, then paste the ALTER ROLE it prints\n' +
        'into the Supabase SQL editor.',
    )
    process.exit(1)
  }

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })

  try {
    const [{ current_user, rls_bypass }] = await db.$queryRaw<
      Array<{ current_user: string; rls_bypass: boolean }>
    >`SELECT current_user, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS rls_bypass`

    check('app_user can connect', true, `(connected as ${current_user})`)
    check('connection role is app_user', current_user === 'app_user', `(got ${current_user})`)
    check('role does not bypass RLS', rls_bypass === false)

    // No claims installed: every org-scoped policy should match nothing.
    const [{ n }] = await db.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM instructors`
    check('unscoped connection sees no instructors', Number(n) === 0, `(saw ${n})`)

    const [{ policies }] = await db.$queryRaw<Array<{ policies: bigint }>>`
      SELECT count(*) AS policies FROM pg_policies WHERE schemaname = 'public'
    `
    check('policies are installed', Number(policies) > 0, `(${policies} policies)`)

    const [{ unprotected }] = await db.$queryRaw<Array<{ unprotected: string | null }>>`
      SELECT string_agg(c.relname, ', ') AS unprotected
      FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
      WHERE ns.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname <> '_prisma_migrations'
        AND NOT c.relrowsecurity
    `
    check('every table has RLS enabled', unprotected === null, unprotected ? `(missing: ${unprotected})` : '')
  } finally {
    await db.$disconnect()
  }

  console.log()
  if (failures > 0) {
    console.error(`${RED}${failures} check(s) failed.${OFF}`)
    process.exit(1)
  }
  console.log(`${GREEN}RLS is live and enforcing.${OFF}`)
}

main().catch((error) => {
  console.error(`\n${RED}Could not verify.${OFF}`)
  console.error(error instanceof Error ? error.message : error)
  // The two failures here look nothing alike and have different fixes, so
  // guess from the error rather than always blaming authentication.
  const message = error instanceof Error ? error.message : String(error)
  if (/permission denied/i.test(message)) {
    console.error(
      '\napp_user connected but cannot read the tables, which means the RLS\n' +
        'migration has not been applied yet. Run: npm run db:deploy',
    )
  } else if (/authenticat|password|SASL/i.test(message)) {
    console.error(
      '\nAuthentication failed. The ALTER ROLE statement from\n' +
        'set-app-user-password.sh has not been run in the Supabase SQL editor yet,\n' +
        'or APP_USER_DATABASE_URL no longer matches the password that was set.',
    )
  }
  process.exit(1)
})
