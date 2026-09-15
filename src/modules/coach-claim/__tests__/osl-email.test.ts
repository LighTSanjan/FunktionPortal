import { describe, expect, it } from 'vitest'
import { coachPaymentEmail } from '../osl-email'

describe("the month's email to OSL", () => {
  it('names every coach in order, the way the treasurer writes it', () => {
    const { subject, body } = coachPaymentEmail({
      periodYear: 2025,
      periodMonth: 2,
      coaches: [
        { fullName: 'Neo Renyi', shortCode: 'Jin' },
        { fullName: 'Lim Kah Sing', shortCode: 'KS' },
      ],
    })
    expect(subject).toBe('Coach Payment for February 2025')
    expect(body).toBe(
      "For the month of February 2025, attached are the necessary documents for instructor's payment:\n\n" +
        '·   The invoice from first coach for February 2025 club sessions: Neo Renyi (Jin) + Attendance sheet for February 2025\n\n' +
        '·   The invoice from second coach for February 2025 club sessions: Lim Kah Sing (KS) + Attendance sheet for February 2025'
    )
  })

  it('does not call a lone coach the first', () => {
    const { body } = coachPaymentEmail({ periodYear: 2026, periodMonth: 8, coaches: [{ fullName: 'Lim Kah Sing', shortCode: 'KS' }] })
    expect(body).toContain('The invoice from the coach for August 2026 club sessions: Lim Kah Sing (KS)')
  })
})
