import 'server-only'

type LogLevel = 'info' | 'warn' | 'error'
type LogValue = string | number | boolean | null | undefined

const PRIVATE_KEY = /(authorization|cookie|token|secret|password|proof|signature|account|student|email|name|payload|body|form)/i
const SAFE_OPERATIONAL_KEYS = new Set(['emailSent', 'telegramSent'])

/**
 * Emit one-line JSON that Vercel and ordinary log collectors can parse.
 * Callers pass small operational facts, never request bodies. Suspicious key
 * names are redacted here as a second line of defence.
 */
export function logEvent(level: LogLevel, event: string, fields: Record<string, LogValue> = {}): void {
  const safe = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      !SAFE_OPERATIONAL_KEYS.has(key) && PRIVATE_KEY.test(key) ? '[redacted]' : value,
    ])
  )
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...safe,
  })

  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.info(line)
}

/** Error shape safe enough for external runtime logs. Messages are omitted. */
export function errorFields(error: unknown): Record<string, LogValue> {
  if (!(error instanceof Error)) return { errorType: 'unknown' }
  const shaped = error as Error & { code?: unknown; digest?: unknown }
  return {
    errorType: error.name,
    errorCode: typeof shaped.code === 'string' ? shaped.code : undefined,
    errorDigest: typeof shaped.digest === 'string' ? shaped.digest : undefined,
  }
}
