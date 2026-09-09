// @vitest-environment node
/**
 * Tested against a real submission: FUNKtion's May 2026 pack for KS.
 *
 * That month ran four sessions — 18, 21, 26 and 28 May. The coach attended
 * two of them, so the invoice billed two at 1.5 hours and $90/hr for $270.00,
 * and the other two were self-practice. Reproducing that arithmetic is the
 * point of most of what follows.
 *
 * Names and bank details here are invented. The real ones live in the
 * database, not the repository — a coach's account number is not something a
 * public checkout should hand out.
 */
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import {
  formatCents, formatSgd, formatHours, sessionAmountCents,
  buildClaim, invoiceDateFor, toInvoiceData, toAttendanceSheetData,
  renderInvoice, renderAttendanceSheet, instructorDocumentNo, NoBillableSessionsError,
  type ClaimInput, type InstructorDetails, type RosterMember, type BillTo, type Branding,
} from '..'

/**
 * Nothing that identifies a club is written into the module, so the tests
 * supply their own. A rebrand or a handover to a differently-named committee
 * changes rows, not code — and these fixtures prove it by using neither the
 * real club's name nor its colours.
 */
const BILL_TO: BillTo = {
  name: 'Test University',
  addressLines: ['1 Campus Way', 'Testville 000000'],
}

const BRANDING: Branding = {
  tagline: 'Test Club — a club for testing!',
  bandColors: ['112233', '445566'],
}

const COACH: InstructorDetails = {
  fullName: 'Test Coach',
  addressLines: ['1 Test Lane, #01-01', 'Singapore 000000'],
  phone: '9000 0000',
  bankName: 'POSB Savings',
  bankAccountNo: '000-00000-0',
  danceStyle: 'Popping',
}

const ROSTER: RosterMember[] = [
  { id: 'm1', fullName: 'Alpha Member' },
  { id: 'm2', fullName: 'Bravo Member' },
  { id: 'm3', fullName: 'Charlie Member' },
]

/** 18, 21, 26, 28 May 2026. The coach came to the 21st and the 28th. */
const MAY_SESSIONS = [
  { heldOn: new Date(2026, 4, 18), durationMinutes: 90, instructorPresent: false, presentMemberIds: ['m1'] },
  { heldOn: new Date(2026, 4, 21), durationMinutes: 90, instructorPresent: true, presentMemberIds: ['m1', 'm2'] },
  { heldOn: new Date(2026, 4, 26), durationMinutes: 90, instructorPresent: false, presentMemberIds: ['m3'] },
  { heldOn: new Date(2026, 4, 28), durationMinutes: 90, instructorPresent: true, presentMemberIds: ['m1', 'm2', 'm3'] },
]

function input(overrides: Partial<ClaimInput> = {}): ClaimInput {
  return {
    instructor: COACH,
    shortCode: 'KS',
    hourlyRateCents: 9000,
    periodYear: 2026,
    periodMonth: 5,
    sessions: MAY_SESSIONS,
    roster: ROSTER,
    fundSource: 'SEED',
    organisationName: 'Test Org',
    referenceNumber: 'IV26-097-0008',
    treasurerName: 'A Treasurer',
    billTo: BILL_TO,
    branding: BRANDING,
    ...overrides,
  }
}

describe('money', () => {
  it('formats cents with thousands separators and two decimals', () => {
    expect(formatCents(5)).toBe('0.05')
    expect(formatCents(153000)).toBe('1,530.00')
    expect(formatSgd(153000)).toBe('$1,530.00')
  })

  it('charges a part hour without losing a cent', () => {
    expect(sessionAmountCents(60, 9000)).toBe(9000)
    expect(sessionAmountCents(90, 9000)).toBe(13500)
    expect(sessionAmountCents(180, 9000)).toBe(27000)
    // 50 minutes at $90/hr is $75 exactly; naive per-minute rounding gives $74.99.
    expect(sessionAmountCents(50, 9000)).toBe(7500)
  })

  it('refuses nonsense durations and rates rather than billing them', () => {
    expect(() => sessionAmountCents(0, 9000)).toThrow(/positive whole number of minutes/)
    expect(() => sessionAmountCents(-60, 9000)).toThrow()
    expect(() => sessionAmountCents(90.5, 9000)).toThrow()
    expect(() => sessionAmountCents(60, 0)).toThrow(/positive whole number of cents/)
  })

  it('writes hours the way a person would', () => {
    expect(formatHours(90)).toBe('1.5')
    expect(formatHours(180)).toBe('3')
  })
})

describe('claim', () => {
  it('reproduces the real May 2026 total', () => {
    const claim = buildClaim(input())
    expect(claim.sessions).toHaveLength(4)
    expect(claim.lines).toHaveLength(2)
    expect(formatSgd(claim.totalCents)).toBe('$270.00')
  })

  it('leaves self-practice off the invoice and on the sheet', () => {
    const i = input()
    const claim = buildClaim(i)

    expect(claim.lines.map((l) => l.heldOn.getDate())).toEqual([21, 28])
    expect(toAttendanceSheetData(i, claim).sessions.map((s) => s.heldOn.getDate())).toEqual([18, 21, 26, 28])
    expect(toAttendanceSheetData(i, claim).billedSessionCount).toBe(2)
  })

  it('bills a three hour session at twice a ninety minute one', () => {
    const claim = buildClaim(input({
      sessions: [
        { heldOn: new Date(2026, 4, 21), durationMinutes: 90, instructorPresent: true, presentMemberIds: [] },
        { heldOn: new Date(2026, 4, 28), durationMinutes: 180, instructorPresent: true, presentMemberIds: [] },
      ],
    }))
    expect(claim.lines.map((l) => l.amountCents)).toEqual([13500, 27000])
    expect(formatSgd(claim.totalCents)).toBe('$405.00')
    expect(claim.totalMinutes).toBe(270)
  })

  it('counts heads per session, ignoring a member marked twice', () => {
    const claim = buildClaim(input({
      sessions: [{ heldOn: new Date(2026, 4, 21), durationMinutes: 90, instructorPresent: true, presentMemberIds: ['m1', 'm1', 'm2'] }],
    }))
    expect(claim.sessions[0].presentCount).toBe(2)
  })

  it('refuses an attendee who is not on the roster', () => {
    expect(() =>
      buildClaim(input({
        sessions: [{ heldOn: new Date(2026, 4, 21), durationMinutes: 90, instructorPresent: true, presentMemberIds: ['ghost'] }],
      })),
    ).toThrow(/not on the roster/)
  })

  it('sorts sessions into date order regardless of input order', () => {
    const claim = buildClaim(input({ sessions: [...MAY_SESSIONS].reverse() }))
    expect(claim.sessions.map((s) => s.heldOn.getDate())).toEqual([18, 21, 26, 28])
  })

  it('rejects a session from the wrong month instead of billing it', () => {
    expect(() =>
      buildClaim(input({
        sessions: [{ heldOn: new Date(2026, 5, 6), durationMinutes: 90, instructorPresent: true, presentMemberIds: [] }],
      })),
    ).toThrow(/fall outside 5\/2026/)
  })

  it('adds GST only when the instructor is registered for it', () => {
    expect(buildClaim(input()).totalCents).toBe(27000)
    expect(buildClaim(input({ gstCents: 2430 })).totalCents).toBe(29430)
  })
})

describe('a month the coach did not teach', () => {
  const selfPracticeOnly = input({
    sessions: [
      { heldOn: new Date(2026, 4, 18), durationMinutes: 90, instructorPresent: false, presentMemberIds: ['m1', 'm2'] },
    ],
  })

  it('raises no invoice, and says why rather than crashing', () => {
    const claim = buildClaim(selfPracticeOnly)
    expect(claim.hasBillableSessions).toBe(false)
    expect(claim.totalCents).toBe(0)
    expect(() => toInvoiceData(selfPracticeOnly, claim)).toThrow(NoBillableSessionsError)
    expect(() => toInvoiceData(selfPracticeOnly, claim)).toThrow(/no invoice to raise/)
  })

  it('still produces an attendance sheet, because the club still met', async () => {
    const claim = buildClaim(selfPracticeOnly)
    const text = await documentText(await renderAttendanceSheet(toAttendanceSheetData(selfPracticeOnly, claim)))
    expect(text).toContain('18 May')
    expect(text).toContain('$0.00')
  })
})

describe('invoice dating', () => {
  it('defaults to the 15th of the following month', () => {
    expect(invoiceDateFor(2026, 6)).toEqual(new Date(2026, 6, 15))
    // Across the calendar year, and so across the FY boundary in March.
    expect(invoiceDateFor(2026, 12)).toEqual(new Date(2027, 0, 15))
    expect(invoiceDateFor(2027, 3)).toEqual(new Date(2027, 3, 15))
  })

  it('takes an explicit date, since real invoices are dated when raised', () => {
    // The live May 2026 invoice is dated 17 June and numbered from that date.
    const claim = buildClaim(input({ invoiceDate: new Date(2026, 5, 17) }))
    expect(claim.documentNo).toBe('KS17062026')
  })

  it('numbers the issuer document from the invoice date', () => {
    expect(instructorDocumentNo('jin', new Date(2026, 6, 15))).toBe('JIN15072026')
    expect(instructorDocumentNo('KS', new Date(2027, 0, 15))).toBe('KS15012027')
  })
})

/** The document text lives in word/document.xml inside the .docx zip. */
async function documentText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  const xml = await zip.file('word/document.xml')!.async('string')
  return xml.replace(/<[^>]+>/g, '')
}

describe('the invoice', () => {
  it('carries the reference, the payee and the real total', async () => {
    const i = input({ invoiceDate: new Date(2026, 5, 17) })
    const text = await documentText(await renderInvoice(toInvoiceData(i, buildClaim(i))))

    expect(text).toContain('IV26-097-0008')
    expect(text).toContain('KS17062026')
    expect(text).toContain('Test University')
    expect(text).toContain('$270.00')
    expect(text).toContain('POSB Savings')
    expect(text).toContain('Intended fund:')
    expect(text).toContain('Seed Fund')
    // The payee is the coach and the countersignature is the treasurer.
    // The old templates ran the two together into one block.
    expect(text).toContain('Test Coach')
    expect(text).toContain('A Treasurer')
  })

  it('lists only the sessions the coach taught', async () => {
    const i = input()
    const text = await documentText(await renderInvoice(toInvoiceData(i, buildClaim(i))))
    expect(text).toContain('21 May')
    expect(text).toContain('28 May')
    expect(text).not.toContain('18 May')
    expect(text).not.toContain('26 May')
  })

  it('renders one row per session, not a fixed four', async () => {
    const one = input({
      sessions: [{ heldOn: new Date(2026, 4, 21), durationMinutes: 180, instructorPresent: true, presentMemberIds: [] }],
    })
    const text = await documentText(await renderInvoice(toInvoiceData(one, buildClaim(one))))
    expect(text).toContain('$270.00')
    expect(text).toContain('3')
  })
})

describe('the attendance sheet', () => {
  it('lays out every member against every date', async () => {
    const i = input()
    const text = await documentText(await renderAttendanceSheet(toAttendanceSheetData(i, buildClaim(i))))

    expect(text).toContain('Coaches Monthly Attendance Sheet')
    expect(text).toContain('Test Club')
    expect(text).toContain('MAY 2026')
    for (const m of ROSTER) expect(text).toContain(m.fullName)
    for (const d of ['18 May', '21 May', '26 May', '28 May']) expect(text).toContain(d)
    expect(text).toContain('Total pax present')
  })

  it('shows the coach absent on the self-practice dates', async () => {
    const i = input()
    const data = toAttendanceSheetData(i, buildClaim(i))
    expect(data.sessions.map((s) => s.instructorPresent)).toEqual([false, true, false, true])
    expect(data.sessions.map((s) => s.presentCount)).toEqual([1, 2, 1, 3])
  })

  it('shows the working behind the claim when every session ran the same length', async () => {
    const i = input()
    const text = await documentText(await renderAttendanceSheet(toAttendanceSheetData(i, buildClaim(i))))
    expect(text).toContain('$90.00/hr x 2 sessions x 1.5 hr/session')
  })

  it('lists the hours instead when the sessions differ, rather than implying one length', async () => {
    const i = input({
      sessions: [
        { heldOn: new Date(2026, 4, 21), durationMinutes: 90, instructorPresent: true, presentMemberIds: [] },
        { heldOn: new Date(2026, 4, 28), durationMinutes: 180, instructorPresent: true, presentMemberIds: [] },
      ],
    })
    const text = await documentText(await renderAttendanceSheet(toAttendanceSheetData(i, buildClaim(i))))
    expect(text).toContain('$90.00/hr x 1.5 hr + 3 hr')
    expect(text).not.toContain('hr/session')
  })

  it('prints the club fund balance and the treasurer who verified it', async () => {
    const i = input({
      clubFundBalanceCents: 328198,
      verification: { name: 'A Treasurer', studentId: '1009153', signedOn: new Date(2026, 5, 17) },
    })
    const text = await documentText(await renderAttendanceSheet(toAttendanceSheetData(i, buildClaim(i))))

    expect(text).toContain('Balance of Club Fund:')
    expect(text).toContain('$3,281.98')
    expect(text).toContain('Verified by')
    expect(text).toContain('A Treasurer')
    // Office defaults rather than being asked for: the treasurer signs this.
    expect(text).toContain('Office:')
    expect(text).toContain('Treasurer')
    expect(text).toContain('1009153')
    expect(text).toContain('17 June 2026')
  })
})

describe('nothing club-specific is baked into the module', () => {
  it('renders with no branding at all rather than falling back to someone else', async () => {
    const bare = input({ branding: undefined })
    const text = await documentText(await renderAttendanceSheet(toAttendanceSheetData(bare, buildClaim(bare))))

    // The club name still prints — it is an input. What disappears is the
    // tagline, and no borrowed palette takes its place.
    expect(text).toContain('Coaches Monthly Attendance Sheet')
    expect(text).toContain('Test Org')
    expect(text).not.toContain('Test Club')
  })

  it('mentions no real club anywhere in its own source', async () => {
    const fs = await import('node:fs/promises')
    const dir = new URL('..', import.meta.url).pathname
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.ts'))

    for (const file of files) {
      const source = await fs.readFile(dir + file, 'utf8')
      // The module renders documents; it does not know whose they are.
      expect(source, `${file} names the club`).not.toMatch(/FUNKtion/i)
      expect(source, `${file} names a coach`).not.toMatch(/Lim Kah Sing|Neo Renyi/i)
    }
  })

  it('takes the billing address from settings, not from a constant', async () => {
    const elsewhere = input({ billTo: { name: 'Another University', addressLines: ['2 Other Road'] } })
    const text = await documentText(await renderInvoice(toInvoiceData(elsewhere, buildClaim(elsewhere))))

    expect(text).toContain('Another University')
    expect(text).toContain('2 Other Road')
    expect(text).not.toContain('Somapah')
  })
})
