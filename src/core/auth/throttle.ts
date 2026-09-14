import 'server-only'

/**
 * A fixed-window counter in Postgres, for the requests that send email.
 *
 * Supabase limits emails per project; this limits them per address and per
 * IP, so one person hammering the button cannot use up everybody's codes, and
 * guessing at a code is capped well below the million it would take.
 */
import { dbAdmin } from '@/core/db/admin'

export interface Limit {
  key: string
  max: number
  windowSeconds: number
}

/** Count one attempt against every limit; false if any is already spent. */
export async function takeAttempt(limits: Limit[]): Promise<boolean> {
  let allowed = true
  for (const limit of limits) {
    const windowMs = limit.windowSeconds * 1000
    const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs)
    const [row] = await dbAdmin.$queryRaw<Array<{ count: number }>>`
      INSERT INTO auth_throttle (key, window_start, count)
      VALUES (${limit.key}, ${windowStart}, 1)
      ON CONFLICT (key, window_start) DO UPDATE SET count = auth_throttle.count + 1
      RETURNING count
    `
    if (row.count > limit.max) allowed = false
  }

  // Old windows are worth nothing. Clearing them here keeps the table small
  // without a scheduled job.
  if (Math.random() < 0.02) {
    await dbAdmin.$executeRaw`DELETE FROM auth_throttle WHERE window_start < now() - interval '2 days'`
  }
  return allowed
}
