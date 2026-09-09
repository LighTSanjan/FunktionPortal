// @vitest-environment node
/**
 * The labelling protocol, tested against the forms that actually appear in
 * the club's registers — including the one that is written wrongly.
 */
import { describe, it, expect } from 'vitest'
import { financialYearOf, formatReference, parseReference } from '..'

describe('financial year', () => {
  it('runs April to March', () => {
    expect(financialYearOf(new Date(2026, 3, 1))).toBe(2026)  // 1 Apr 2026
    expect(financialYearOf(new Date(2026, 8, 8))).toBe(2026)  // 8 Sep 2026
    expect(financialYearOf(new Date(2027, 2, 31))).toBe(2026) // 31 Mar 2027
    expect(financialYearOf(new Date(2027, 3, 1))).toBe(2027)  // 1 Apr 2027
  })

  it('puts the March 2027 handover on the last day of FY2026', () => {
    // The outgoing treasurer's final month and the incoming one's first fall
    // either side of a counter reset.
    expect(financialYearOf(new Date(2027, 2, 15))).toBe(2026)
    expect(financialYearOf(new Date(2027, 3, 15))).toBe(2027)
  })
})

describe('formatting', () => {
  it('writes the four series in the protocol form', () => {
    const parts = { financialYear: 2026, projectCode: '097', sequence: 10 }
    expect(formatReference({ ...parts, series: 'IV' })).toBe('IV26-097-0010')
    expect(formatReference({ ...parts, series: 'SCF' })).toBe('SCF26-097-0010')
    expect(formatReference({ ...parts, series: 'PO' })).toBe('PO26-097-0010')
    expect(formatReference({ ...parts, series: 'INC' })).toBe('INC26-097-0010')
  })

  it('matches the reference on the live May 2026 invoice', () => {
    expect(formatReference({ series: 'IV', financialYear: 2026, projectCode: '097', sequence: 8 }))
      .toBe('IV26-097-0008')
  })

  it('refuses a project code that is not three digits', () => {
    const base = { series: 'IV' as const, financialYear: 2026, sequence: 1 }
    expect(() => formatReference({ ...base, projectCode: '97' })).toThrow(/three digits/)
    expect(() => formatReference({ ...base, projectCode: '0097' })).toThrow(/three digits/)
  })

  it('refuses a sequence the format cannot represent', () => {
    const base = { series: 'IV' as const, financialYear: 2026, projectCode: '097' }
    expect(() => formatReference({ ...base, sequence: 0 })).toThrow(/between 1 and 9999/)
    expect(() => formatReference({ ...base, sequence: 10000 })).toThrow(/between 1 and 9999/)
    expect(() => formatReference({ ...base, sequence: 1.5 })).toThrow()
  })
})

describe('parsing', () => {
  it('reads a well-formed reference back', () => {
    expect(parseReference('IV26-097-0008')).toEqual({
      series: 'IV', financialYear: 26, projectCode: '097', sequence: 8,
    })
  })

  it('rejects the malformed number in the FY2026 register', () => {
    // The register records the summer collection as INC-26-097-0001, with a
    // hyphen after the prefix. The protocol has no hyphen there.
    expect(parseReference('INC-26-097-0001')).toBeNull()
    expect(parseReference('INC26-097-0001')).not.toBeNull()
  })

  it('rejects other near misses rather than guessing', () => {
    for (const bad of [
      'IV26-097-008',    // three-digit sequence
      'IV2026-097-0008', // four-digit year
      'IV26 097 0008',   // spaces for hyphens
      'XX26-097-0008',   // unknown series
      'IV26-97-0008',    // two-digit project code
      '',
    ]) {
      expect(parseReference(bad), `${bad} should not parse`).toBeNull()
    }
  })
})
