// @vitest-environment node
/**
 * Guest instructors.
 *
 * The club books a guest for the occasional workshop. They raise an invoice
 * like anyone else, but nothing about them was checked in advance — there is
 * no contract on file — so the details are typed on the day the invoice is
 * due, which is exactly when a missing bank account gets missed.
 */
import { describe, it, expect } from 'vitest'
import {
  assertInvoiceable, deriveShortCode, shortCodeFor,
  IncompleteInstructorError, buildClaim, toInvoiceData, toAttendanceSheetData,
  renderInvoice, type InstructorDetails, type ClaimInput,
} from '..'

const GUEST: InstructorDetails = {
  fullName: 'Ada Lim',
  addressLines: [],
  bankName: 'DBS Savings',
  bankAccountNo: '111-22222-3',
  danceStyle: 'Waacking',
}

function claimInput(instructor: InstructorDetails, shortCode = 'AL'): ClaimInput {
  return {
    instructor,
    shortCode,
    hourlyRateCents: 12000,
    periodYear: 2026,
    periodMonth: 5,
    sessions: [{ heldOn: new Date(2026, 4, 23), durationMinutes: 180, instructorPresent: true, presentMemberIds: ['m1'] }],
    roster: [{ id: 'm1', fullName: 'Alpha Member' }],
    fundSource: 'INCOME',
    organisationName: 'Test Org',
    referenceNumber: 'IV26-097-0011',
    treasurerName: 'A Treasurer',
    billTo: { name: 'Test University', addressLines: ['1 Campus Way'] },
  }
}

describe('what an invoice cannot go out without', () => {
  it('accepts a guest with bank details and no address, since plenty bill from an email', () => {
    expect(() => assertInvoiceable({ ...GUEST, addressLines: [] })).not.toThrow()
  })

  it('refuses one with no bank account, because that invoice pays nobody', () => {
    expect(() => assertInvoiceable({ ...GUEST, bankAccountNo: '' }))
      .toThrow(IncompleteInstructorError)
    expect(() => assertInvoiceable({ ...GUEST, bankAccountNo: '   ' }))
      .toThrow(/bank account number/)
  })

  it('names every missing field at once rather than one per attempt', () => {
    try {
      assertInvoiceable({ ...GUEST, bankName: '', bankAccountNo: '', danceStyle: '' })
      throw new Error('should have thrown')
    } catch (e) {
      const error = e as IncompleteInstructorError
      expect(error.missing).toEqual(['class or style', 'bank', 'bank account number'])
      expect(error.message).toContain('Ada Lim')
      expect(error.message).toContain('no contract on file')
    }
  })

  it('blocks the invoice itself, not just a helper nobody remembers to call', () => {
    const input = claimInput({ ...GUEST, bankAccountNo: '' })
    const claim = buildClaim(input)
    expect(() => toInvoiceData(input, claim)).toThrow(IncompleteInstructorError)
  })

  it('still produces an attendance sheet for an unpayable guest', () => {
    // The class happened. Whether the paperwork to pay for it is complete is
    // a separate question from whether anyone turned up.
    const input = claimInput({ ...GUEST, bankAccountNo: '' })
    expect(() => toAttendanceSheetData(input, buildClaim(input))).not.toThrow()
  })
})

describe('document codes for someone with none on file', () => {
  it('takes initials, ignoring a parenthesised stage name and stray punctuation', () => {
    expect(deriveShortCode('Ada Lim')).toBe('AL')
    expect(deriveShortCode('Ada Lim (Sparky)')).toBe('AL')
    expect(deriveShortCode('Lim,  Ada')).toBe('LA')
    expect(() => deriveShortCode('   ')).toThrow(/Cannot derive/)
  })

  it('always prefers the stored code, which is not derivable', () => {
    // One contracted coach's code is a stage name, not initials — deriving it
    // would quietly renumber every invoice they have ever issued.
    const coach = { ...GUEST, fullName: 'Neo Renyi' }
    expect(shortCodeFor(coach, 'JIN')).toBe('JIN')
    expect(shortCodeFor(coach, '  ')).toBe('NR')
    expect(shortCodeFor(coach, null)).toBe('NR')
  })
})

describe('a guest invoice end to end', () => {
  it('renders at the guest rate with their own details', async () => {
    const input = claimInput(GUEST)
    const claim = buildClaim(input)

    // A three-hour workshop at $120/hr, nothing like the standing $90 class.
    expect(claim.totalCents).toBe(36000)

    const buffer = await renderInvoice(toInvoiceData(input, claim))
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(buffer)
    const text = (await zip.file('word/document.xml')!.async('string')).replace(/<[^>]+>/g, '')

    expect(text).toContain('Ada Lim')
    expect(text).toContain('Waacking')
    expect(text).toContain('DBS Savings')
    expect(text).toContain('$360.00')
    expect(text).toContain('IV26-097-0011')
  })
})
