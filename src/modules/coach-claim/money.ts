/**
 * Money helpers.
 *
 * Everything is integer cents. The OSL register quotes two decimals and
 * derives GST by division, so a float representation drifts against the
 * document the portal has to reconcile with.
 */

/** 1530_00 -> "1,530.00" */
export function formatCents(cents: number): string {
  const negative = cents < 0
  const abs = Math.abs(Math.round(cents))
  const dollars = Math.floor(abs / 100).toLocaleString('en-SG')
  const remainder = String(abs % 100).padStart(2, '0')
  return `${negative ? '-' : ''}${dollars}.${remainder}`
}

/** 1530_00 -> "$1,530.00" */
export function formatSgd(cents: number): string {
  return `$${formatCents(cents)}`
}

/**
 * Charge for one session, from its duration and the contracted hourly rate.
 *
 * Rounded once, here, rather than by summing rounded fractions of an hour —
 * a 90 minute lesson at $90/hr is $135.00, and no arrangement of the same
 * numbers should produce $134.99.
 */
export function sessionAmountCents(minutes: number, hourlyRateCents: number): number {
  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw new Error(`Session duration must be a positive whole number of minutes, got ${minutes}`)
  }
  if (!Number.isInteger(hourlyRateCents) || hourlyRateCents <= 0) {
    throw new Error(`Hourly rate must be a positive whole number of cents, got ${hourlyRateCents}`)
  }
  return Math.round((minutes * hourlyRateCents) / 60)
}

/** "1.5" for 90 minutes, "2" for 120 — trailing zeroes trimmed. */
export function formatHours(minutes: number): string {
  const hours = minutes / 60
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}
