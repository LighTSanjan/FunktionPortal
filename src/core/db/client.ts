import { PrismaClient, Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { dbAdmin } from './admin'

// Hosted Supabase blocks SET ROLE into custom roles, so production connects as
// app_user directly. Local Postgres can use SET ROLE on the admin connection.
const globalForAppUserPrisma = globalThis as unknown as {
  appUserPrisma: PrismaClient | undefined
}

function getAppUserClient(): PrismaClient | undefined {
  const connectionString = process.env.APP_USER_DATABASE_URL
  if (!connectionString) return undefined

  if (!globalForAppUserPrisma.appUserPrisma) {
    globalForAppUserPrisma.appUserPrisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    })
  }
  return globalForAppUserPrisma.appUserPrisma
}

export class RlsScopeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RlsScopeError'
  }
}

// Claims and queries must share one connection, so each scoped call is an
// interactive transaction.
const TX_OPTIONS = { maxWait: 15_000, timeout: 20_000 } as const

// Stay below the hosted pool's 15-connection limit and queue excess work.
const MAX_CONCURRENT_TX = 10

let active = 0
const waiting: Array<() => void> = []

async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT_TX) {
    active++
    return
  }
  await new Promise<void>((resolve) => waiting.push(resolve))
  active++
}

function release(): void {
  active--
  waiting.shift()?.()
}

export async function dbAs<T>(
  userId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  await acquire()
  try {
    return await runScoped(userId, fn)
  } finally {
    release()
  }
}

async function runScoped<T>(
  userId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  // JWT role is the authenticated identity claim; the database session still
  // runs as app_user. The current_user check prevents an accidental RLS bypass.
  const claims = JSON.stringify({ sub: userId, role: 'authenticated' })

  const appUserClient = getAppUserClient()

  if (appUserClient) {
    // Hosted Supabase path: already connected as app_user (see
    // getAppUserClient's comment for why SET ROLE can't be used here).
    // Only the claims need installing per transaction.
    return appUserClient.$transaction(async (tx) => {
      const [{ current_role }] = await tx.$queryRaw<{ current_role: string }[]>`
        SELECT set_config('request.jwt.claims', ${claims}, true), current_user AS current_role
      `
      if (current_role !== 'app_user') {
        throw new RlsScopeError(
          `Expected to run as 'app_user' but session role is '${current_role}'. ` +
            `Refusing to execute — RLS would not be enforced.`
        )
      }
      return fn(tx)
    }, TX_OPTIONS)
  }

  // Local/self-hosted path: no platform-level SET ROLE restriction, so
  // switching role on the shared dbAdmin connection works fine.
  return dbAdmin.$transaction(async (tx) => {
    const [{ current_role }] = await tx.$queryRaw<{ current_role: string }[]>`
      SELECT
        set_config('request.jwt.claims', ${claims}, true),
        set_config('role', 'app_user', true),
        current_user AS current_role
    `

    // If the role switch silently failed we would be running as the table
    // owner, which bypasses RLS entirely — a silent loss of tenant isolation.
    // Turn that into a loud failure.
    if (current_role !== 'app_user') {
      throw new RlsScopeError(
        `Expected to run as 'app_user' but session role is '${current_role}'. ` +
          `Refusing to execute — RLS would not be enforced.`
      )
    }

    return fn(tx)
  }, TX_OPTIONS)
}
