import 'server-only'

/**
 * Per-address and per-IP limits on the requests that send email or check a
 * code, on top of Supabase's own per-project limits.
 *
 * rate-limiter-flexible does the limiting. Its Prisma store reads a row and
 * then writes it, so concurrent attempts can each read the same count and all
 * get through; the one method overridden here makes that write a single
 * atomic upsert. (Its Postgres store is atomic but uses named prepared
 * statements, which Supabase's transaction pooler does not support.)
 *
 * Keys are hashed: the table holds counts, not the addresses and IPs of
 * everybody who tried to sign in.
 */
import { createHash } from 'node:crypto'
import { RateLimiterPrisma, RateLimiterRes } from 'rate-limiter-flexible'
import { dbAdmin } from '@/core/db/admin'

export interface Limit {
  key: string
  max: number
  windowSeconds: number
}

class AtomicPrismaLimiter extends RateLimiterPrisma {
  async _upsert(key: string, points: number, msDuration: number, forceExpire = false) {
    const now = new Date()
    const expire = msDuration > 0 ? new Date(now.getTime() + msDuration) : null
    const [row] = await dbAdmin.$queryRaw<Array<{ points: number; expire: Date | null }>>`
      INSERT INTO rate_limits (key, points, expire)
      VALUES (${key}, ${points}, ${expire})
      ON CONFLICT (key) DO UPDATE SET
        points = CASE
          WHEN ${forceExpire} OR rate_limits.expire IS NULL OR rate_limits.expire <= ${now} OR ${expire}::timestamp IS NULL
          THEN EXCLUDED.points
          ELSE rate_limits.points + EXCLUDED.points
        END,
        expire = CASE
          WHEN ${forceExpire} OR rate_limits.expire IS NULL OR rate_limits.expire <= ${now} OR ${expire}::timestamp IS NULL
          THEN EXCLUDED.expire
          ELSE rate_limits.expire
        END
      RETURNING points, expire
    `
    return row
  }
}

const limiters = new Map<string, AtomicPrismaLimiter>()

function limiterFor(max: number, windowSeconds: number): AtomicPrismaLimiter {
  const id = `${max}/${windowSeconds}`
  let limiter = limiters.get(id)
  if (!limiter) {
    limiter = new AtomicPrismaLimiter({
      storeClient: dbAdmin,
      tableName: 'rateLimit',
      points: max,
      duration: windowSeconds,
    })
    limiters.set(id, limiter)
  }
  return limiter
}

function storedKey(limit: Limit): string {
  const hashed = createHash('sha256').update(limit.key).digest('base64url')
  return limiterFor(limit.max, limit.windowSeconds).getKey(hashed)
}

/**
 * Hand back an attempt that turned out to cost nothing — a code Supabase
 * refused to send. Counting it anyway is how somebody pressing "send a new
 * code" three times inside Supabase's own one-minute wait used up their hour.
 */
export async function giveBack(limits: Limit[]): Promise<void> {
  for (const limit of limits) {
    await dbAdmin.$executeRaw`
      UPDATE rate_limits SET points = greatest(points - 1, 0)
      WHERE key = ${storedKey(limit)} AND expire > now()
    `
  }
}

/** Seconds until every spent limit has room again; 0 if none is spent. */
export async function secondsUntilAllowed(limits: Limit[]): Promise<number> {
  let wait = 0
  for (const limit of limits) {
    const [row] = await dbAdmin.$queryRaw<Array<{ points: number; expire: Date | null }>>`
      SELECT points, expire FROM rate_limits WHERE key = ${storedKey(limit)}
    `
    if (row && row.points >= limit.max && row.expire) {
      wait = Math.max(wait, Math.ceil((row.expire.getTime() - Date.now()) / 1000))
    }
  }
  return wait
}

/** Count one attempt against every limit; false if any is already spent. */
export async function takeAttempt(limits: Limit[]): Promise<boolean> {
  let allowed = true
  for (const limit of limits) {
    const key = createHash('sha256').update(limit.key).digest('base64url')
    try {
      await limiterFor(limit.max, limit.windowSeconds).consume(key)
    } catch (error) {
      if (error instanceof RateLimiterRes) allowed = false
      else throw error
    }
  }
  return allowed
}
