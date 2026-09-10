import { describe, it, expect } from 'vitest'
import { addWorkingDays } from '../deadlines'

/**
 * §3.1.2: an invoice reaches OSL within three working days of its own date.
 *
 * The deadline is only ever shown, never enforced, so nothing downstream
 * would notice it being wrong — which is exactly why it is worth pinning.
 */
describe('addWorkingDays', () => {
  const at = (value: string) => new Date(`${value}T00:00:00`)
  // Local components, not toISOString(): the whole coach-claim module dates
  // documents in local time (see isoDate in theme.ts), and formatting these
  // through UTC would shift every assertion by a day when the test runs
  // anywhere east of Greenwich.
  const iso = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`

  it('counts plain weekdays', () => {
    // Monday 2026-06-01 + 3 => Thursday 2026-06-04
    expect(iso(addWorkingDays(at('2026-06-01'), 3))).toBe('2026-06-04')
  })

  it('steps over a weekend', () => {
    // Thursday 2026-06-04 + 3 => Tuesday 2026-06-09, not Sunday the 7th
    expect(iso(addWorkingDays(at('2026-06-04'), 3))).toBe('2026-06-09')
  })

  it('starts counting from the next day when the invoice falls on a Friday', () => {
    // Friday 2026-06-05 + 3 => Wednesday 2026-06-10
    expect(iso(addWorkingDays(at('2026-06-05'), 3))).toBe('2026-06-10')
  })

  it('does not count the weekend day it starts on', () => {
    // Saturday 2026-06-06 + 1 => Monday 2026-06-08
    expect(iso(addWorkingDays(at('2026-06-06'), 1))).toBe('2026-06-08')
  })

  it('leaves the original date untouched', () => {
    const start = at('2026-06-01')
    addWorkingDays(start, 5)
    expect(iso(start)).toBe('2026-06-01')
  })
})
