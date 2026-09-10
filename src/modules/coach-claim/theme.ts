/** Neutral fallback when organisation branding is absent. */
export const FALLBACK_BAND_COLORS = ['BFBFBF', 'CFCFCF', 'DFDFDF', 'EFEFEF']

export const INK = '1A1A1A'
export const INK_SOFT = '595959'
export const RULE = 'BFBFBF'
export const HEADER_FILL = 'F2F2F2'

export const FONT = 'Calibri'

/** docx sizes are half-points. */
export const SIZE = {
  masthead: 30, // 15pt
  title: 24, //    12pt
  body: 20, //     10pt
  small: 17, //     8.5pt
  tiny: 15, //      7.5pt
} as const

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

/** "15 September 2026" */
export function longDate(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/**
 * "2026-05-21" in the LOCAL calendar, not UTC.
 *
 * toISOString() would render a Singapore class on the 21st as the 20th,
 * which in an error message sends a treasurer looking for the wrong day.
 */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "4 Jun" — the form the attendance sheets already use for column heads. */
export function shortDate(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
