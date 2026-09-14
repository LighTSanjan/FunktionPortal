import 'server-only'

/**
 * Per-address and per-IP limits on the requests that send email or check a
 * code, on top of Supabase's own per-project limits.
 *
 * rate-limiter-flexible, stored in Postgres through the admin Prisma client,
 * so the limits hold across every serverless instance.
 */
import { RateLimiterPrisma, RateLimiterRes } from 'rate-limiter-flexible'
import { dbAdmin } from '@/core/db/admin'

export interface Limit {
  key: string
  max: number
  windowSeconds: number
}

const limiters = new Map<string, RateLimiterPrisma>()

function limiterFor(max: number, windowSeconds: number): RateLimiterPrisma {
  const id = `${max}/${windowSeconds}`
  let limiter = limiters.get(id)
  if (!limiter) {
    limiter = new RateLimiterPrisma({
      storeClient: dbAdmin,
      tableName: 'rateLimit',
      points: max,
      duration: windowSeconds,
    })
    limiters.set(id, limiter)
  }
  return limiter
}

/** Count one attempt against every limit; false if any is already spent. */
export async function takeAttempt(limits: Limit[]): Promise<boolean> {
  let allowed = true
  for (const limit of limits) {
    try {
      await limiterFor(limit.max, limit.windowSeconds).consume(limit.key)
    } catch (error) {
      if (error instanceof RateLimiterRes) allowed = false
      else throw error
    }
  }
  return allowed
}
