import { describe, expect, it } from 'vitest'
import { onSheet, referenceKey, sameReference } from '../reference-match'

const d = (iso: string) => new Date(`${iso}T00:00:00Z`)

describe('matching well-formed reference numbers', () => {
  it('ignores case, spaces and the hyphen after the series', () => {
    expect(sameReference('INC-26-097-0001', 'INC26-097-0001')).toBe(true)
    expect(sameReference(' iv26-097-0010 ', 'IV26-097-0010')).toBe(true)
  })

  it('never treats a different number as the same document', () => {
    expect(sameReference('IV26-097-0012', 'IV26-097-0011')).toBe(false)
    expect(sameReference('IV26-097-0010', 'IV25-097-0010')).toBe(false)
    expect(sameReference('IV26-097-0010', 'INC26-097-0010')).toBe(false)
  })

  it('does not call a malformed number well-formed', () => {
    expect(referenceKey('IV26-097-00010')).toBeNull()
    expect(referenceKey('SLCLUB097')).toBeNull()
    expect(sameReference(null, null)).toBe(false)
  })
})

describe('which portal documents are already on the sheet', () => {
  const portal = [
    { reference: 'IV26-097-0010', amountCents: 27_000, date: d('2026-09-15') },
    { reference: 'IV26-097-0011', amountCents: 13_500, date: d('2026-09-15') },
  ]

  it('reads the register’s mistyped August rows as the two August invoices', () => {
    const sheet = [
      { reference: 'IV26-097-00010', amountCents: 27_000, date: d('2026-09-15') },
      { reference: 'IV26-097-00012', amountCents: 13_500, date: d('2026-09-15') },
    ]
    expect([...onSheet(sheet, portal)].sort()).toEqual([0, 1])
  })

  it('does not let a mistyped row claim a later, real document with the digits it resembles', () => {
    const sheet = [{ reference: 'IV26-097-00012', amountCents: 13_500, date: d('2026-09-15') }]
    const later = [{ reference: 'IV26-097-0012', amountCents: 20_000, date: d('2026-10-15') }]
    expect(onSheet(sheet, later).size).toBe(0)
  })

  it('lets one sheet row stand for one document only', () => {
    const sheet = [{ reference: 'IV26-097-000X', amountCents: 13_500, date: d('2026-09-15') }]
    const twins = [
      { reference: 'IV26-097-0011', amountCents: 13_500, date: d('2026-09-15') },
      { reference: 'IV26-097-0012', amountCents: 13_500, date: d('2026-09-15') },
    ]
    expect(onSheet([{ ...sheet[0], reference: 'IV26-097-00011' }], twins).size).toBe(1)
  })

  it('matches exact numbers before guessing', () => {
    const sheet = [
      { reference: 'IV26-097-00099', amountCents: 27_000, date: d('2026-09-15') },
      { reference: 'IV26-097-0010', amountCents: 27_000, date: d('2026-09-15') },
    ]
    expect([...onSheet(sheet, portal)]).toEqual([0])
  })
})
